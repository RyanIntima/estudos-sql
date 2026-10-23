import { PGlite } from '@electric-sql/pglite'

export interface StatementResult {
  /** Comando do Postgres: SELECT, INSERT, CREATE TABLE, … */
  command: string
  columns: string[]
  /** Linhas em formato de array para suportar colunas com nomes repetidos (ex.: a.id, b.id). */
  rows: unknown[][]
  /** Linhas retornadas (SELECT) ou afetadas (INSERT/UPDATE/DELETE). */
  rowCount: number
}

export interface SqlError {
  message: string
  /** SQLSTATE, ex.: 42P01 (tabela inexistente), 23505 (violação de UNIQUE). */
  code?: string
  /** Posição (1-based, em caracteres) do erro no SQL enviado. */
  position?: number
  detail?: string
  hint?: string
}

interface OutcomeBase {
  durationMs: number
  /**
   * O script terminou com uma transação aberta (BEGIN sem COMMIT/ROLLBACK, ou transação em erro).
   * O motor fez ROLLBACK: o Postgres só grava o que foi confirmado com COMMIT.
   */
  rolledBack?: boolean
}

export type RunOutcome =
  | ({ ok: true; results: StatementResult[] } & OutcomeBase)
  | ({ ok: false; error: SqlError } & OutcomeBase)

/** Acesso direto à sessão, sem esperar a fila: só quem já está com a vez (callbacks de `readOnly` e `trial`) o recebe. */
export type Session = Pick<Engine, 'query' | 'queryRows'>

export interface Engine {
  /** Executa um script (um ou mais comandos) como o aluno digitou. Nunca lança por erro de SQL. */
  run(sql: string): Promise<RunOutcome>
  /**
   * Executa `sql` dentro de uma transação, entrega o resultado a `inspect` (que pode consultar o banco com o efeito
   * ainda visível) e DESFAZ tudo ao final. Serve para testar uma resposta sem deixar marcas.
   * Um COMMIT dentro de `sql` é neutralizado (não confirma): o efeito fica visível a `inspect` e some no fim.
   */
  trial<T>(sql: string, inspect: (outcome: RunOutcome, session: Session) => Promise<T>): Promise<T>
  /**
   * Roda `fn` dentro de uma transação SOMENTE LEITURA, desfeita ao final. `fn` consulta a sessão pelo `session` que
   * recebe: é o único acesso que enxerga a transação (e o SET ROLE) que o diagnóstico preparou.
   * É a rede de segurança dos diagnósticos que executam SQL do aluno sem ele pedir (etapas de execução, plano):
   * uma consulta que chame uma função que grava dados é recusada pelo Postgres em vez de ser executada.
   */
  readOnly<T>(fn: (session: Session) => Promise<T>): Promise<T>
  /** Como `query`, mas em formato de tabela (colunas repetidas de um JOIN continuam todas lá). Limpa a sessão ao final, como `run`; dentro de `readOnly`/`trial` use o `session`, que não limpa. */
  queryRows(sql: string): Promise<StatementResult>
  /** Consulta interna (introspecção, validação). Lança em caso de erro. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  /** Apaga tudo que o aluno criou, voltando ao banco vazio. */
  reset(): Promise<void>
  close(): Promise<void>
}

function toSqlError(err: unknown): SqlError {
  const e = err as { message?: string; code?: string; position?: string; detail?: string; hint?: string }
  const position = e.position !== undefined ? Number(e.position) : undefined
  return {
    message: e.message ?? String(err),
    code: e.code,
    position: Number.isFinite(position) ? position : undefined,
    detail: e.detail,
    hint: e.hint,
  }
}

/**
 * @param dataDir 'idb://nome' persiste no navegador; omitido = memória (testes).
 */
export async function createEngine(dataDir?: string): Promise<Engine> {
  const db = await PGlite.create(dataDir)

  /**
   * Execuções, diagnósticos e testes são sequências de comandos (BEGIN … ROLLBACK) sobre UMA sessão. Sem fila, o
   * diagnóstico automático do editor (plano, etapas) podia abrir a sua transação no meio de um script do aluno,
   * que então rodava dentro dela. As operações que mexem na sessão entram numa fila e nunca se intercalam.
   * As consultas soltas (query, queryRows) também esperam a vez: lidas no meio de um script com SET ROLE ou com
   * transação aberta, enxergariam (ou recusariam) o que o aluno ainda não terminou de fazer. Os diagnósticos
   * (readOnly) e testes (trial) recebem um `Session` que consulta direto, porque já estão com a vez.
   */
  let queue: Promise<unknown> = Promise.resolve()
  function serial<T>(op: () => Promise<T>): Promise<T> {
    const result = queue.then(op, op)
    queue = result.catch(() => undefined)
    return result
  }

  const session: Session = {
    async query<T>(sql: string, params?: unknown[]) {
      return (await db.query<T>(sql, params)).rows as T[]
    },
    async queryRows(sql) {
      const raw = await db.exec(sql, { rowMode: 'array' })
      const r = raw[raw.length - 1]
      return { command: r.command ?? '', columns: r.fields.map((f) => f.name), rows: r.rows as unknown as unknown[][], rowCount: r.rows.length }
    },
  }

  /**
   * Cada execução começa de uma sessão limpa: sem transação aberta (que deixaria o banco "preso" para a execução
   * seguinte, inclusive para as consultas internas do app) e sem SET ROLE / search_path / tabelas temporárias de antes.
   * Devolve true se havia uma transação aberta, descoberta pelo aviso que o ROLLBACK dá quando não há nenhuma.
   */
  async function cleanSession(): Promise<boolean> {
    let nothingToRollback = false
    await db.exec('ROLLBACK', { onNotice: (n) => { if (n.code === '25P01') nothingToRollback = true } })
    // DISCARD ALL e não RESET ALL: este NÃO desfaz SET ROLE nem SET SESSION AUTHORIZATION (parâmetros NO_RESET_ALL).
    // Também descarta tabelas temporárias e cursores. Só roda fora de transação, e o ROLLBACK acima garante isso.
    await db.exec('DISCARD ALL')
    return !nothingToRollback
  }

  /** Executa o script e devolve o resultado, SEM limpar a sessão depois. */
  async function execRaw(sql: string): Promise<RunOutcome> {
    const started = performance.now()
    try {
      const raw = await db.exec(sql, { rowMode: 'array' })
      const results: StatementResult[] = raw.map((r) => ({
        command: r.command ?? '',
        columns: r.fields.map((f) => f.name),
        rows: r.rows as unknown as unknown[][],
        rowCount: r.rows.length > 0 ? r.rows.length : (r.affectedRows ?? 0),
      }))
      return { ok: true, results, durationMs: performance.now() - started }
    } catch (err) {
      return { ok: false, error: toSqlError(err), durationMs: performance.now() - started }
    }
  }

  return {
    run: (sql) =>
      serial(async () => {
        const out = await execRaw(sql)
        const rolledBack = await cleanSession()
        return rolledBack ? { ...out, rolledBack } : out
      }),

    readOnly: (fn) =>
      serial(async () => {
        await cleanSession()
        await db.exec('BEGIN READ ONLY')
        try {
          return await fn(session)
        } finally {
          await cleanSession()
        }
      }),

    trial: (sql, inspect) =>
      serial(async () => {
        await cleanSession()
        await db.exec('BEGIN')
        try {
          // Um COMMIT do script confirmaria de verdade e escaparia do desfazer final. Aqui ele vira um ponto de
          // retorno inofensivo: o efeito continua visível para `inspect`, e o ROLLBACK do `finally` leva tudo embora.
          const out = await execRaw(sql.replace(/\bcommit\b/gi, 'SAVEPOINT trial_commit'))
          // Se o script falhou a transação está abortada: não há o que inspecionar no banco, só o erro.
          return await inspect(out, session)
        } finally {
          await cleanSession()
        }
      }),

    query: (sql, params) => serial(() => session.query(sql, params)),
    queryRows: (sql) =>
      serial(async () => {
        try {
          return await session.queryRows(sql)
        } finally {
          // O SQL pode ser o de uma solução com SET ROLE / search_path: não deixa isso na sessão do aluno.
          await cleanSession()
        }
      }),

    reset: () => serial(resetDatabase),

    close: () => db.close(),
  }

  async function resetDatabase() {
    const schemas = await db.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace
        WHERE left(nspname, 3) <> 'pg_' AND nspname <> 'information_schema'`,
    )
    for (const { nspname } of schemas.rows) {
      await db.exec(`DROP SCHEMA IF EXISTS "${nspname}" CASCADE`)
    }
    // Papéis não moram em schema nenhum: precisam ser apagados à parte (e antes, as permissões que eles têm).
    const roles = await db.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE left(rolname, 3) <> 'pg_' AND rolname <> current_user`,
    )
    for (const { rolname } of roles.rows) {
      await db.exec(`DROP OWNED BY "${rolname}"`)
      await db.exec(`DROP ROLE "${rolname}"`)
    }
    await db.exec('CREATE SCHEMA public')
    // Como no Postgres de fábrica: todo mundo pode USAR o schema public (criar objetos nele é outra permissão).
    await db.exec('GRANT USAGE ON SCHEMA public TO PUBLIC')
  }
}

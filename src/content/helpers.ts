import type { Check, Step } from '../lessons/types'

interface QueryStep {
  id: string
  title: string
  goal: string
  context?: string
  /** A consulta de referência: também é o resultado que a resposta do aluno precisa igualar. */
  solution: string
  hints: string[]
  wrong?: string[]
  /** A ordem das linhas importa (a consulta tem ORDER BY). */
  ordered?: boolean
  ignoreColumnNames?: boolean
  /** Exigências além do resultado (ex.: ter usado uma subconsulta). */
  also?: Check[]
  xp?: number
  starter?: string
}

/** Passo cuja resposta é um SELECT: vale o mesmo resultado que a consulta de referência. */
export function queryStep(q: QueryStep): Step {
  const { also = [], ordered, ignoreColumnNames, ...rest } = q
  return {
    ...rest,
    checks: [...also, { kind: 'resultMatches', expectedSql: q.solution.replace(/;\s*$/, ''), ordered, ignoreColumnNames }],
  }
}

/** Passo de carga: o aluno lê (com a explicação ao lado) e roda um script pronto, que é também a solução. */
export function seedStep(s: Pick<Step, 'id' | 'title' | 'goal' | 'context' | 'hints' | 'checks' | 'xp'> & { script: string }): Step {
  const { script, ...rest } = s
  return { ...rest, starter: script, solution: script }
}

/** Exige que o SQL executado neste passo contenha `pattern` (case-insensitive). */
export const uses = (pattern: string, label: string): Check => ({ kind: 'sqlMatches', pattern, label })

/** O papel existe no banco. */
export const roleExists = (role: string, label = `Existe o papel \`${role}\``): Check =>
  catalog(label, `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}')`, `O papel ${role} ainda não existe.`)

/** O papel TEM (ou, com `expected = false`, NÃO tem) a permissão sobre o objeto, no sentido real do Postgres. */
export const hasPrivilege = (role: string, object: string, privilege: string, expected = true): Check =>
  catalog(
    `${expected ? 'Pode' : 'NÃO pode'} ${privilege} em \`${object}\`: papel \`${role}\``,
    `SELECT ${expected ? '' : 'NOT '}has_table_privilege('${role}', '${object}', '${privilege}')`,
    expected ? `O papel ${role} ainda não tem ${privilege} em ${object}.` : `O papel ${role} não deveria ter ${privilege} em ${object}.`,
  )

/** Confere uma propriedade do catálogo do Postgres (ex.: a definição de uma regra CHECK). */
export const catalog = (label: string, sql: string, message?: string): Check => ({ kind: 'sqlTrue', label, sql, message })

/**
 * A definição de alguma regra CHECK da tabela casa com a expressão regular (sem diferenciar maiúsculas).
 * O Postgres normaliza o que o aluno escreveu: `preco > 0` vira `preco > (0)::numeric`. Escreva o padrão com isso em mente.
 */
export const checkDefinition = (table: string, regex: string | string[], label: string): Check => {
  // Com uma lista, UMA mesma regra CHECK precisa casar com todos os padrões.
  const all = (Array.isArray(regex) ? regex : [regex]).map((r) => `pg_get_constraintdef(oid) ~* '${r}'`).join(' AND ')
  return catalog(
    label,
    `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '${table}'::regclass AND contype = 'c' AND ${all})`,
    `Não achei na tabela ${table} uma regra CHECK com esse conteúdo.`,
  )
}

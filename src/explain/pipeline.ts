import type { Engine, StatementResult } from '../db/engine'
import { parseSql, topKeywords, type AstNode } from './parse'

export type StageId = 'from' | 'where' | 'group' | 'having' | 'window' | 'select' | 'distinct' | 'order' | 'limit'

export interface Stage {
  id: StageId
  title: string
  /** O que o aluno escreveu para esta etapa. */
  snippet: string
  /** Intervalo no texto do editor, para destacar ao passar o mouse. */
  from: number
  to: number
  /** Explicação fixa do papel da etapa na ordem de execução. */
  what: string
  /** Consulta (somente leitura) que conta as linhas que sobram depois desta etapa. */
  countSql: string
  /** Consulta que mostra algumas linhas desta etapa. */
  sampleSql?: string
}

export type Pipeline = { ok: true; stages: Stage[] } | { ok: false; reason: string }

export interface StageResult {
  id: StageId
  count: number | null
  sample?: StatementResult
  error?: string
}

const AGG = new Set(['count', 'sum', 'avg', 'min', 'max', 'string_agg', 'array_agg', 'bool_and', 'bool_or'])

/** Há agregação (sem janela) neste nó? Subconsultas têm o seu próprio escopo e ficam de fora. */
function hasAggregate(node: AstNode): boolean {
  if (Array.isArray(node)) return node.some(hasAggregate)
  if (!node || typeof node !== 'object') return false
  for (const [k, v] of Object.entries(node as Record<string, AstNode>)) {
    if (k === 'SubLink') continue
    if (k === 'FuncCall' && !v.over) {
      const fn = String(v.funcname?.at(-1)?.String?.sval ?? '').toLowerCase()
      if (AGG.has(fn) || v.agg_star || v.agg_distinct) return true
    }
    if (hasAggregate(v)) return true
  }
  return false
}

/** Há função de janela (com OVER) neste nó? */
function hasWindow(node: AstNode): boolean {
  if (Array.isArray(node)) return node.some(hasWindow)
  if (!node || typeof node !== 'object') return false
  for (const [k, v] of Object.entries(node as Record<string, AstNode>)) {
    if (k === 'SubLink') continue
    if (k === 'FuncCall' && v.over) return true
    if (hasWindow(v)) return true
  }
  return false
}

const WHAT: Record<StageId, string> = {
  from: 'Lê a(s) tabela(s) e junta as linhas. É sempre o **primeiro** passo: antes dele não existe linha nenhuma.',
  where: 'Descarta as linhas que não cumprem a condição. Roda **antes** de agrupar.',
  group: 'Agrupa as linhas: a partir daqui, cada linha é um **grupo**.',
  having: 'Descarta **grupos** inteiros, pelo resultado da agregação.',
  window: 'Calcula as **funções de janela** sobre as linhas que sobraram. **Não muda** a quantidade de linhas: só acrescenta colunas.',
  select: 'Só agora as colunas do resultado são calculadas (e os apelidos nascem aqui).',
  distinct: 'Remove as linhas repetidas do resultado.',
  order: 'Ordena o resultado. Não muda a quantidade de linhas.',
  limit: 'Corta o resultado: pula (`OFFSET`) e limita (`LIMIT`).',
}

/**
 * Monta as etapas lógicas do ÚLTIMO SELECT do texto, na ordem em que o banco as executa
 * (que não é a ordem em que o aluno escreve), com consultas para contar as linhas de cada uma.
 */
export async function buildPipeline(sql: string): Promise<Pipeline> {
  const parsed = await parseSql(sql)
  if (!parsed.ok) return { ok: false, reason: 'O comando está incompleto ou com erro de escrita.' }

  const stmt = parsed.statements.filter((s) => s.kind === 'SelectStmt').at(-1)
  if (!stmt) return { ok: false, reason: 'Escreva uma consulta (`SELECT`) para ver as etapas de execução.' }
  const sel = stmt.node
  if (sel.op && sel.op !== 'SETOP_NONE') return { ok: false, reason: 'Esta consulta combina resultados (`UNION`/`INTERSECT`/`EXCEPT`). Veja cada parte separadamente.' }
  if (sel.valuesLists) return { ok: false, reason: 'Uma lista `VALUES` não tem etapas de execução.' }

  const tk = stmt.tokens
  const kws = topKeywords(tk)
  const selIdx = kws.find((i) => tk[i].upper === 'SELECT')
  if (selIdx === undefined) return { ok: false, reason: 'Não encontrei o `SELECT` principal.' }

  const find = (name: string) =>
    kws.find((i) => {
      if (i <= selIdx) return false
      const [w, w2] = name.split(' ')
      return tk[i].upper === w && (!w2 || tk[i + 1]?.upper === w2)
    })
  const idx = {
    from: find('FROM'),
    where: find('WHERE'),
    group: find('GROUP BY'),
    having: find('HAVING'),
    order: find('ORDER BY'),
    limit: find('LIMIT'),
    offset: find('OFFSET'),
  }
  if (idx.from === undefined) return { ok: false, reason: 'A consulta não tem `FROM`: não há tabela para ler, então não há etapas a mostrar.' }

  const starts = Object.values(idx).filter((i): i is number => i !== undefined).sort((a, b) => a - b)
  const endOf = (i: number) => starts.find((s) => s > i) ?? tk.length
  const seg = (i: number) => sql.slice(tk[i].start, tk[endOf(i) - 1].end)
  const range = (i: number) => ({ from: tk[i].start, to: tk[endOf(i) - 1].end })

  const prefix = sql.slice(stmt.from, tk[selIdx].start) // `WITH ... ` quando há CTEs
  const distinct = tk[selIdx + 1]?.upper === 'DISTINCT'
  const listStart = selIdx + 1 + (distinct ? 1 : 0)
  const selectList = sql.slice(tk[listStart].start, tk[idx.from - 1].end)

  const from = seg(idx.from)
  const where = idx.where !== undefined ? seg(idx.where) : ''
  const group = idx.group !== undefined ? seg(idx.group) : ''
  const having = idx.having !== undefined ? seg(idx.having) : ''
  const body = [from, where, group, having].filter(Boolean).join(' ')
  const core = (d: boolean) => `${prefix}SELECT ${d ? 'DISTINCT ' : ''}${selectList} ${body}`
  const count = (inner: string) => `SELECT count(*) AS n FROM (${inner}) q`

  const stages: Stage[] = []
  const add = (s: Omit<Stage, 'what'>) => stages.push({ ...s, what: WHAT[s.id] })

  const joins = (sel.fromClause ?? []).some((f: AstNode) => f.JoinExpr)
  add({
    id: 'from',
    title: joins ? 'FROM + JOIN' : 'FROM',
    snippet: from,
    ...range(idx.from),
    countSql: `${prefix}SELECT count(*) AS n ${from}`,
    sampleSql: `${prefix}SELECT * ${from} LIMIT 5`,
  })
  if (idx.where !== undefined) {
    add({
      id: 'where',
      title: 'WHERE',
      snippet: where,
      ...range(idx.where),
      countSql: `${prefix}SELECT count(*) AS n ${from} ${where}`,
      sampleSql: `${prefix}SELECT * ${from} ${where} LIMIT 5`,
    })
  }

  const groupKeys = idx.group !== undefined ? sql.slice(tk[idx.group + 2].start, tk[endOf(idx.group) - 1].end) : ''
  const groupSample = (extra: string) => `${prefix}SELECT ${groupKeys}, count(*) AS linhas ${[from, where, group, extra].filter(Boolean).join(' ')} ORDER BY linhas DESC LIMIT 5`
  if (idx.group !== undefined) {
    add({
      id: 'group',
      title: 'GROUP BY',
      snippet: group,
      ...range(idx.group),
      countSql: count(`${prefix}SELECT 1 ${[from, where, group].filter(Boolean).join(' ')}`),
      sampleSql: groupSample(''),
    })
  } else if (hasAggregate(sel.targetList) || hasAggregate(sel.havingClause)) {
    // Sem GROUP BY, uma agregação junta todas as linhas num único grupo.
    add({
      id: 'group',
      title: 'Agregação (sem GROUP BY)',
      snippet: selectList,
      from: tk[listStart].start,
      to: tk[idx.from - 1].end,
      countSql: 'SELECT 1 AS n',
    })
  }
  if (idx.having !== undefined) {
    add({
      id: 'having',
      title: 'HAVING',
      snippet: having,
      ...range(idx.having),
      countSql: count(`${prefix}SELECT 1 ${body}`),
      sampleSql: idx.group !== undefined ? groupSample(having) : undefined,
    })
  }

  if (hasWindow(sel.targetList)) {
    add({
      id: 'window',
      title: 'Funções de janela (OVER)',
      snippet: selectList,
      from: tk[listStart].start,
      to: tk[idx.from - 1].end,
      countSql: count(`${prefix}SELECT 1 ${body}`),
    })
  }

  add({
    id: 'select',
    title: 'SELECT',
    snippet: selectList,
    from: tk[selIdx].start,
    to: tk[idx.from - 1].end,
    countSql: count(core(false)),
    sampleSql: `${core(false)} LIMIT 5`,
  })
  if (distinct) {
    add({ id: 'distinct', title: 'DISTINCT', snippet: 'DISTINCT', from: tk[selIdx + 1].start, to: tk[selIdx + 1].end, countSql: count(core(true)), sampleSql: `${core(true)} LIMIT 5` })
  }
  if (idx.order !== undefined) {
    add({ id: 'order', title: 'ORDER BY', snippet: seg(idx.order), ...range(idx.order), countSql: count(core(distinct)) })
  }
  const limitIdx = [idx.limit, idx.offset].filter((i): i is number => i !== undefined).sort((a, b) => a - b)[0]
  if (limitIdx !== undefined) {
    const last = Math.max(...[idx.limit, idx.offset].filter((i): i is number => i !== undefined))
    add({
      id: 'limit',
      title: idx.limit !== undefined && idx.offset !== undefined ? 'LIMIT + OFFSET' : idx.limit !== undefined ? 'LIMIT' : 'OFFSET',
      snippet: sql.slice(tk[limitIdx].start, tk[endOf(last) - 1].end),
      from: tk[limitIdx].start,
      to: tk[endOf(last) - 1].end,
      countSql: count(sql.slice(stmt.from, stmt.to)),
    })
  }
  return { ok: true, stages }
}

/**
 * Roda as consultas de contagem e de amostra de cada etapa.
 * Dentro de uma transação SOMENTE LEITURA: se a consulta do aluno chamar uma função que grava dados,
 * o Postgres recusa a etapa em vez de executá-la a cada tecla digitada.
 */
export async function runPipeline(engine: Engine, stages: Stage[]): Promise<StageResult[]> {
  return engine.readOnly(async (session) => {
    const out: StageResult[] = []
    for (const s of stages) {
      const r: StageResult = { id: s.id, count: null }
      try {
        const [row] = await session.query<{ n: number | string | bigint }>(s.countSql)
        r.count = Number(row.n)
        if (s.sampleSql) {
          // `query` (e não `run`): `run` encerra a sessão ao final, e isso desfaria a transação somente leitura.
          const rows = await session.queryRows(s.sampleSql)
          r.sample = rows
        }
      } catch (e) {
        r.error = e instanceof Error ? e.message : String(e)
        out.push(r)
        // Depois de um erro a transação fica abortada: as etapas seguintes não conseguem rodar.
        for (const rest of stages.slice(out.length)) out.push({ id: rest.id, count: null, error: 'não executada: uma etapa anterior falhou' })
        break
      }
      out.push(r)
    }
    return out
  })
}

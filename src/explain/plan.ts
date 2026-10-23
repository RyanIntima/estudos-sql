import type { Engine } from '../db/engine'
import { parseSql, topKeywords, type AstNode } from './parse'

export interface PlanNode {
  type: string
  relation?: string
  alias?: string
  index?: string
  startupCost: number
  totalCost: number
  planRows: number
  actualRows?: number
  /** Tempo real total deste nó, já multiplicado pelas repetições (loops). Inclui o dos filhos. */
  time?: number
  loops?: number
  /** Tempo só deste nó, sem o dos filhos. */
  selfTime?: number
  filter?: string
  indexCond?: string
  sortKey?: string[]
  /** Linhas lidas e jogadas fora pelo filtro. */
  removedByFilter?: number
  children: PlanNode[]
}

export interface PlanResult {
  root: PlanNode
  planningMs?: number
  executionMs?: number
}

export type PlanOutcome = { ok: true; plan: PlanResult; sql: string } | { ok: false; reason: string }

type Json = Record<string, unknown>
const num = (v: unknown) => (typeof v === 'number' ? v : undefined)

function toNode(j: Json): PlanNode {
  const loops = num(j['Actual Loops'])
  const time = num(j['Actual Total Time'])
  const node: PlanNode = {
    type: String(j['Node Type']),
    relation: j['Relation Name'] as string | undefined,
    alias: j['Alias'] as string | undefined,
    index: j['Index Name'] as string | undefined,
    startupCost: num(j['Startup Cost']) ?? 0,
    totalCost: num(j['Total Cost']) ?? 0,
    planRows: num(j['Plan Rows']) ?? 0,
    actualRows: num(j['Actual Rows']),
    loops,
    time: time === undefined ? undefined : time * (loops ?? 1),
    filter: j['Filter'] as string | undefined,
    indexCond: (j['Index Cond'] ?? j['Recheck Cond']) as string | undefined,
    sortKey: j['Sort Key'] as string[] | undefined,
    removedByFilter: num(j['Rows Removed by Filter']),
    children: ((j['Plans'] as Json[] | undefined) ?? []).map(toNode),
  }
  if (node.time !== undefined) {
    const kids = node.children.reduce((sum, c) => sum + (c.time ?? 0), 0)
    node.selfTime = Math.max(0, node.time - kids)
  }
  return node
}

/** O JSON de `EXPLAIN (FORMAT JSON)`: uma lista com um objeto `{ Plan, "Planning Time", "Execution Time" }`. */
export function parsePlanJson(json: unknown): PlanResult {
  const top = (Array.isArray(json) ? json[0] : json) as Json
  return {
    root: toNode(top['Plan'] as Json),
    planningMs: num(top['Planning Time']),
    executionMs: num(top['Execution Time']),
  }
}

/** O texto da consulta cujo plano deve ser mostrado: o último SELECT, ou o SELECT dentro de um EXPLAIN. */
export async function planTarget(sql: string): Promise<{ ok: true; sql: string } | { ok: false; reason: string }> {
  const parsed = await parseSql(sql)
  if (!parsed.ok) return { ok: false, reason: 'O comando está incompleto ou com erro de escrita.' }
  const stmt = parsed.statements.filter((s) => s.kind === 'SelectStmt' || (s.kind === 'ExplainStmt' && (s.node as AstNode).query?.SelectStmt)).at(-1)
  if (!stmt) return { ok: false, reason: 'Escreva uma consulta (`SELECT`) para ver o plano de execução.' }
  if (stmt.kind === 'SelectStmt') return { ok: true, sql: sql.slice(stmt.from, stmt.to) }
  const tk = stmt.tokens
  const inner = topKeywords(tk).find((i) => i > 0 && ['SELECT', 'WITH'].includes(tk[i].upper))
  return inner === undefined ? { ok: false, reason: 'Não encontrei a consulta dentro do EXPLAIN.' } : { ok: true, sql: sql.slice(tk[inner].start, stmt.to) }
}

/**
 * Roda `EXPLAIN (ANALYZE, FORMAT JSON)`. O ANALYZE EXECUTA a consulta, então vai numa transação somente leitura:
 * um SELECT que chame uma função que grava dados é recusado em vez de ser executado.
 */
export async function explainPlan(engine: Engine, sql: string): Promise<PlanOutcome> {
  const target = await planTarget(sql)
  if (!target.ok) return target
  try {
    const rows = await engine.readOnly((session) => session.query<Record<string, unknown>>(`EXPLAIN (ANALYZE, FORMAT JSON) ${target.sql}`))
    return { ok: true, plan: parsePlanJson(Object.values(rows[0])[0]), sql: target.sql }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

export function allNodes(n: PlanNode): PlanNode[] {
  return [n, ...n.children.flatMap(allNodes)]
}

const fmt = (n: number) => n.toLocaleString('pt-BR')

/** Observações didáticas sobre o plano, em português. */
export function planNotes(plan: PlanResult): string[] {
  const notes: string[] = []
  for (const n of allNodes(plan.root)) {
    if (n.type === 'Seq Scan' && (n.removedByFilter ?? 0) >= 1000) {
      notes.push(
        `⚠ Leitura **sequencial** de \`${n.relation}\`: leu ${fmt((n.removedByFilter ?? 0) + (n.actualRows ?? 0))} linhas só para devolver ${fmt(n.actualRows ?? 0)}. Um **índice** nas colunas do filtro (${n.filter ?? ''}) evitaria ler a tabela inteira.`,
      )
    }
    if (n.actualRows !== undefined && n.loops === 1 && n.planRows > 0) {
      const ratio = Math.max(n.planRows, n.actualRows) / Math.max(1, Math.min(n.planRows, n.actualRows))
      if (ratio >= 20 && Math.max(n.planRows, n.actualRows) >= 100) {
        notes.push(
          `O planejador **estimou ${fmt(n.planRows)}** linhas em \`${n.relation ?? n.type}\`, mas vieram **${fmt(n.actualRows)}**. Estatísticas desatualizadas levam a planos ruins: rode \`ANALYZE\`.`,
        )
      }
    }
    if (/^(Index Scan|Index Only Scan|Bitmap Index Scan)/.test(n.type) && n.index) {
      notes.push(`✔ Usou o índice \`${n.index}\` em vez de ler a tabela inteira.`)
    }
    if (n.type === 'Sort' && n.sortKey) notes.push(`Precisou **ordenar** as linhas (\`${n.sortKey.join(', ')}\`). Um índice nessa ordem poderia dispensar essa etapa.`)
  }
  return [...new Set(notes)]
}

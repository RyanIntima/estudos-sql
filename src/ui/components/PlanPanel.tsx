import { planNotes, type PlanNode, type PlanOutcome } from '../../explain/plan'
import { Markdown } from './Markdown'

const TITLE: Record<string, string> = {
  'Seq Scan': 'Leitura sequencial (lê a tabela inteira)',
  'Index Scan': 'Leitura por índice',
  'Index Only Scan': 'Leitura só pelo índice',
  'Bitmap Index Scan': 'Busca no índice (mapa de bits)',
  'Bitmap Heap Scan': 'Leitura das páginas indicadas pelo índice',
  Sort: 'Ordenação',
  Limit: 'Limite (LIMIT)',
  Aggregate: 'Agregação',
  HashAggregate: 'Agregação por grupos (hash)',
  GroupAggregate: 'Agregação por grupos (ordenada)',
  'Hash Join': 'Junção por hash (JOIN)',
  'Nested Loop': 'Junção por laços aninhados (JOIN)',
  'Merge Join': 'Junção por intercalação (JOIN)',
  Hash: 'Monta a tabela de hash',
  WindowAgg: 'Função de janela',
  Unique: 'Remove repetidas (DISTINCT)',
  Materialize: 'Guarda o resultado intermediário',
  'Subquery Scan': 'Subconsulta',
  Result: 'Resultado',
}

type Tone = 'warn' | 'good' | 'plain'

function toneOf(n: PlanNode): Tone {
  if (n.type === 'Seq Scan' && (n.removedByFilter ?? 0) >= 1000) return 'warn'
  if (/^(Index Scan|Index Only Scan|Bitmap Index Scan)/.test(n.type)) return 'good'
  return 'plain'
}

const TONE_CLASS: Record<Tone, string> = {
  warn: 'border-amber-500 bg-amber-950/30',
  good: 'border-emerald-600 bg-emerald-950/30',
  plain: 'border-slate-600 bg-slate-900/60',
}

const ms = (v: number) => (v < 1 ? `${v.toFixed(2)} ms` : v < 100 ? `${v.toFixed(1)} ms` : `${Math.round(v)} ms`)
const int = (v: number) => v.toLocaleString('pt-BR')

function NodeView({ node, total, depth }: { node: PlanNode; total: number; depth: number }) {
  const tone = toneOf(node)
  const share = total > 0 && node.selfTime !== undefined ? Math.max(2, (node.selfTime / total) * 100) : 0
  return (
    <li data-plan-node={node.type} data-tone={tone} style={{ marginLeft: depth ? 14 : 0 }}>
      <div className={`rounded border-l-4 border px-2 py-1.5 text-xs ${TONE_CLASS[tone]}`}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-white">{TITLE[node.type] ?? node.type}</span>
          <span className="font-mono text-[10px] text-slate-500">{node.type}</span>
          {node.relation && (
            <span className="text-slate-300">
              em <code className="text-cyan-300">{node.relation}</code>
            </span>
          )}
          {node.index && (
            <span className="text-slate-300">
              usando <code className="text-emerald-300">{node.index}</code>
            </span>
          )}
          {node.time !== undefined && <span className="ml-auto font-mono text-slate-300">{ms(node.time)}</span>}
        </div>
        {share > 0 && (
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800" title={`${ms(node.selfTime!)} só neste passo`}>
            <div className={`h-full ${tone === 'warn' ? 'bg-amber-400' : tone === 'good' ? 'bg-emerald-400' : 'bg-sky-500'}`} style={{ width: `${share}%` }} />
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
          <span>
            linhas: estimado <b className="text-slate-300">{int(node.planRows)}</b>
            {node.actualRows !== undefined && (
              <>
                {' '}
                · real <b className="text-slate-200">{int(node.actualRows)}</b>
              </>
            )}
          </span>
          {node.removedByFilter ? <span className="text-amber-300">{int(node.removedByFilter)} lidas e descartadas</span> : null}
          <span>custo {node.totalCost.toFixed(0)}</span>
        </div>
        {node.indexCond && <code className="mt-0.5 block truncate font-mono text-[11px] text-emerald-300/80" title={node.indexCond}>índice: {node.indexCond}</code>}
        {node.filter && <code className="mt-0.5 block truncate font-mono text-[11px] text-amber-200/80" title={node.filter}>filtro: {node.filter}</code>}
      </div>
      {node.children.length > 0 && (
        <ul className="mt-1 space-y-1 border-l border-slate-700 pl-1">
          {node.children.map((c, i) => (
            <NodeView key={i} node={c} total={total} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** O plano de execução do SELECT, como árvore: o que o Postgres faz, passo a passo, e quanto cada passo custa. */
export function PlanPanel({ outcome, loading }: { outcome: PlanOutcome | null; loading: boolean }) {
  if (!outcome) return <p className="p-4 text-sm text-slate-400">Analisando…</p>
  if (!outcome.ok) {
    return (
      <div className="p-4 text-sm text-slate-400">
        <Markdown>{outcome.reason}</Markdown>
      </div>
    )
  }
  const { plan } = outcome
  const notes = planNotes(plan)
  const total = plan.root.time ?? 0
  return (
    <div className={`p-3 ${loading ? 'opacity-60' : ''}`}>
      <p className="mb-2 rounded border border-sky-900 bg-sky-950/40 px-3 py-2 text-xs text-sky-100">
        O plano é lido <b>de dentro para fora</b>: o passo mais recuado roda primeiro e alimenta o de cima. A barra mostra quanto do tempo cada passo gasta{' '}
        <b>sozinho</b>.
      </p>
      <div data-plan-time className="mb-2 flex gap-4 text-xs text-slate-300">
        {plan.executionMs !== undefined && (
          <span>
            Execução: <b className="text-white">{ms(plan.executionMs)}</b>
          </span>
        )}
        {plan.planningMs !== undefined && <span>Planejamento: {ms(plan.planningMs)}</span>}
      </div>
      {notes.length > 0 && (
        <ul className="mb-3 space-y-1">
          {notes.map((n, i) => (
            <li key={i} data-plan-note className="rounded bg-slate-900 px-2 py-1 text-xs">
              <Markdown>{n}</Markdown>
            </li>
          ))}
        </ul>
      )}
      <ul>
        <NodeView node={plan.root} total={total} depth={0} />
      </ul>
    </div>
  )
}

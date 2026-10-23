import type { Range } from './SqlEditor'
import type { PipelineState } from '../usePipeline'
import { Markdown } from './Markdown'
import { ResultTable } from './ResultTable'

interface Props {
  state: PipelineState | null
  loading: boolean
  onHover: (range: Range | null) => void
}

const UNIT: Record<string, [string, string]> = {
  group: ['grupo', 'grupos'],
  having: ['grupo', 'grupos'],
}
const unit = (id: string, n: number) => (UNIT[id] ?? ['linha', 'linhas'])[n === 1 ? 0 : 1]

/** A ordem em que o banco executa o SELECT, com quantas linhas (ou grupos) sobram depois de cada etapa. */
export function ExecutionPanel({ state, loading, onHover }: Props) {
  if (!state) return <p className="p-4 text-sm text-slate-400">Analisando…</p>

  if (!state.pipeline.ok) {
    return (
      <div className="p-4 text-sm text-slate-400">
        <Markdown>{state.pipeline.reason}</Markdown>
      </div>
    )
  }

  const { stages } = state.pipeline
  return (
    <div className={`p-3 ${loading ? 'opacity-60' : ''}`} onMouseLeave={() => onHover(null)}>
      <p className="mb-3 rounded border border-sky-900 bg-sky-950/40 px-3 py-2 text-xs text-sky-100">
        Esta é a ordem em que o banco <b>executa</b> a sua consulta, que <b>não é</b> a ordem em que você a escreveu. O número de cada etapa é
        quantas linhas (ou grupos) <b>sobram depois dela</b>. Passe o mouse para ver o trecho no editor.
      </p>
      <ol className="space-y-1">
        {stages.map((s, i) => {
          const r = state.results[i]
          const prev = i > 0 ? state.results[i - 1]?.count : null
          const delta = r?.count != null && prev != null ? r.count - prev : 0
          return (
            <li key={s.id} data-stage={s.id}>
              {i > 0 && <div className="py-0.5 pl-5 text-slate-600">↓</div>}
              <div
                className="rounded border border-slate-700 bg-slate-900/60 p-2"
                onMouseEnter={() => onHover({ from: s.from, to: s.to })}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-700 text-[11px] font-bold">{i + 1}</span>
                  <span className="text-sm font-semibold">{s.title}</span>
                  <span className="ml-auto flex items-baseline gap-2">
                    {delta !== 0 && (
                      <span data-delta className={`text-xs ${delta < 0 ? 'text-red-300' : 'text-amber-300'}`}>
                        {delta > 0 ? '+' : '−'}
                        {Math.abs(delta)}
                      </span>
                    )}
                    <span data-count className="rounded bg-slate-800 px-2 py-0.5 text-sm font-bold text-emerald-300">
                      {r?.count ?? '…'} <span className="text-[11px] font-normal text-slate-400">{r?.count != null && unit(s.id, r.count)}</span>
                    </span>
                  </span>
                </div>
                <code className="mt-1 block truncate font-mono text-[11px] text-cyan-300" title={s.snippet}>
                  {s.snippet.replace(/\s+/g, ' ')}
                </code>
                <Markdown className="mt-1 text-xs">{s.what}</Markdown>
                {r?.error && <p className="mt-1 text-xs text-red-300">Não consegui contar esta etapa: {r.error}</p>}
                {r?.sample && r.sample.rows.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-slate-400 hover:text-white">
                      ver {r.sample.rows.length === 5 ? 'as primeiras 5' : r.sample.rows.length} {s.id === 'group' || s.id === 'having' ? 'grupos' : 'linhas'}
                    </summary>
                    <div className="mt-1">
                      <ResultTable result={r.sample} />
                    </div>
                  </details>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

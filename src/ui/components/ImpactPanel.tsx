import { summarizeImpact, type Change, type ImpactItem } from '../../db/impact'
import { Markdown } from './Markdown'

const ICON: Record<ImpactItem['kind'], string> = {
  structure: '🏗️',
  data: '📦',
  query: '🔍',
  info: 'ℹ️',
  error: '⛔',
}

/** "O que o meu último comando fez no banco?", em frases. */
export function ImpactPanel({ change }: { change: Change | null }) {
  if (!change) {
    return <p className="p-6 text-center text-sm text-slate-400">Execute um comando para ver aqui, em português, o que ele mudou no banco.</p>
  }
  const items = summarizeImpact(change)
  return (
    <div className="p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">O que a última execução fez</h3>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} data-kind={it.kind} className="flex gap-2 text-sm">
            <span>{ICON[it.kind]}</span>
            <Markdown>{it.text}</Markdown>
          </li>
        ))}
      </ul>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { translateError } from '../../db/errorTranslator'
import type { Explanation } from '../../explain/explainer'
import { Markdown } from './Markdown'

interface Props {
  explanation: Explanation | null
  code: string
  activeId: string | null
  /** Só rola até o item quando o destaque veio do editor (não ao passar o mouse no próprio painel). */
  scrollToActive: boolean
  onHoverItem: (id: string | null) => void
}

const shorten = (s: string) => {
  const oneLine = s.replace(/\s+/g, ' ').trim()
  return oneLine.length > 64 ? oneLine.slice(0, 61) + '…' : oneLine
}

export function ExplainPanel({ explanation, code, activeId, scrollToActive, onHoverItem }: Props) {
  const refs = useRef(new Map<string, HTMLLIElement>())

  useEffect(() => {
    if (scrollToActive && activeId) refs.current.get(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId, scrollToActive])

  if (!explanation) return <p className="p-4 text-sm text-slate-400">Analisando…</p>

  if (!explanation.ok) {
    const friendly = translateError({ code: '42601', message: explanation.message })
    return (
      <div className="p-4 text-sm text-slate-400">
        <p>Ainda não dá para explicar: o comando está incompleto ou tem um erro de escrita.</p>
        {friendly && <Markdown className="mt-1 text-xs">{friendly.explanation}</Markdown>}
      </div>
    )
  }

  if (explanation.annotations.length === 0) {
    return <p className="p-4 text-sm text-slate-400">Escreva um comando e eu explico cada parte dele aqui. Passe o mouse sobre o código para ver a explicação correspondente.</p>
  }

  return (
    <ol className="space-y-1 p-3" onMouseLeave={() => onHoverItem(null)}>
      {explanation.annotations.map((a) => (
        <li
          key={a.id}
          ref={(el) => {
            if (el) refs.current.set(a.id, el)
            else refs.current.delete(a.id)
          }}
          data-depth={a.depth}
          onMouseEnter={() => onHoverItem(a.id)}
          className={`rounded border-l-2 px-2 py-1 text-xs ${
            a.depth === 0 ? 'mt-2 first:mt-0' : ''
          } ${a.warn ? 'border-amber-400 bg-amber-950/40' : a.depth === 0 ? 'border-sky-500' : 'border-slate-700'} ${
            activeId === a.id ? 'bg-sky-900/50 ring-1 ring-sky-400' : ''
          }`}
          // Subconsultas aninhadas fundo demais não cabem no painel: a indentação para de crescer.
          style={{ marginLeft: Math.min(a.depth, 5) * 14 }}
        >
          {a.depth > 0 && <code className="mb-0.5 block truncate font-mono text-[11px] text-cyan-300">{shorten(code.slice(a.from, a.to))}</code>}
          <Markdown>{a.text}</Markdown>
        </li>
      ))}
    </ol>
  )
}

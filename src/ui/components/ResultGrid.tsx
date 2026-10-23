import type { RunOutcome } from '../../db/engine'
import { translateError } from '../../db/errorTranslator'
import { Markdown } from './Markdown'
import { ResultTable } from './ResultTable'

/** Linha do script onde o Postgres apontou o erro. */
function errorLine(sql: string, position?: number) {
  if (!position) return null
  const line = sql.slice(0, position - 1).split('\n').length
  return { line, text: sql.split('\n')[line - 1] ?? '' }
}

/** O script terminou com uma transação aberta: o motor a desfez. É a lição "sem COMMIT, nada fica gravado" em ação. */
function RolledBackNote() {
  return (
    <p data-rolled-back className="rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-xs text-amber-200">
      ⏪ O script terminou com uma <b>transação aberta</b> (um <code>BEGIN</code> sem <code>COMMIT</code>, ou uma transação com erro). O SQL Quest fez <code>ROLLBACK</code>: <b>nada foi gravado</b>. Num cliente real, a transação ficaria aberta, travando as linhas.
    </p>
  )
}

export function ResultGrid({ outcome, sql }: { outcome: RunOutcome | null; sql: string }) {
  if (!outcome) {
    return <p className="p-4 text-sm text-slate-400">Escreva um comando e pressione Ctrl+Enter para executar.</p>
  }

  if (!outcome.ok) {
    const { error } = outcome
    const friendly = translateError(error)
    const where = errorLine(sql, error.position)
    return (
      <div className="space-y-3 p-4 text-sm">
        {outcome.rolledBack && <RolledBackNote />}
        <div>
          <p className="font-semibold text-red-400">⛔ {friendly?.title ?? 'Erro'}</p>
          {friendly && <Markdown className="mt-1">{friendly.explanation}</Markdown>}
        </div>
        {friendly && friendly.tips.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-300">
            {friendly.tips.map((t, i) => (
              <li key={i}>
                <Markdown className="inline">{t}</Markdown>
              </li>
            ))}
          </ul>
        )}
        {where && (
          <pre className="rounded bg-slate-900 p-2 text-xs text-red-300">
            linha {where.line}: {where.text}
          </pre>
        )}
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer">Mensagem original do Postgres{error.code ? ` (${error.code})` : ''}</summary>
          <p className="mt-1 font-mono text-slate-400">{error.message}</p>
          {error.detail && <p className="font-mono text-slate-400">Detalhe: {error.detail}</p>}
          {error.hint && <p className="font-mono text-amber-300">Dica: {error.hint}</p>}
        </details>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {outcome.rolledBack && <RolledBackNote />}
      {outcome.results.map((r, i) => (
        <div key={i}>
          <p className="mb-1 text-xs text-slate-400">
            {r.command} · {r.rowCount} {r.rowCount === 1 ? 'linha' : 'linhas'} · {outcome.durationMs.toFixed(0)} ms
          </p>
          {r.columns.length > 0 && <ResultTable result={r} />}
        </div>
      ))}
    </div>
  )
}

import type { StatementResult } from '../../db/engine'

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (v instanceof Date) return v.toISOString().replace('T', ' ').replace(/\.000Z$/, '').replace(/ 00:00:00$/, '')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export interface RowDecoration {
  /** Classes da linha inteira. */
  row?: string
  /** Colunas cujo valor mudou (ganham destaque e mostram o valor de antes ao passar o mouse). */
  changed?: Record<string, unknown>
}

interface Props {
  result: StatementResult
  decorate?: (row: unknown[], index: number) => RowDecoration | undefined
  /** Linhas que não existem mais: aparecem no fim, riscadas. */
  ghostRows?: unknown[][]
}

export function ResultTable({ result, decorate, ghostRows = [] }: Props) {
  const body = (row: unknown[], key: string, deco?: RowDecoration, ghost = false) => (
    <tr key={key} className={`border-t border-slate-800 ${deco?.row ?? ''} ${ghost ? 'text-red-300 line-through' : ''}`}>
      {row.map((cell, ci) => {
        const col = result.columns[ci]
        const changed = deco?.changed && col in deco.changed
        return (
          <td
            key={ci}
            title={changed ? `antes: ${formatCell(deco!.changed![col])}` : undefined}
            className={`px-3 py-1 ${cell === null ? 'italic text-slate-500' : ''} ${changed ? 'bg-amber-500/30 font-semibold text-amber-100' : ''}`}
          >
            {formatCell(cell)}
          </td>
        )
      })}
    </tr>
  )

  return (
    <div className="overflow-auto rounded border border-slate-700">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-800 text-slate-300">
          <tr>
            {result.columns.map((c, ci) => (
              <th key={ci} className="px-3 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, ri) => body(row, `r${ri}`, decorate?.(row, ri)))}
          {ghostRows.map((row, ri) => body(row, `g${ri}`, { row: 'bg-red-500/15' }, true))}
        </tbody>
      </table>
    </div>
  )
}

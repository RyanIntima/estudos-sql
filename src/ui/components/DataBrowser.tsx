import { useEffect, useMemo, useState } from 'react'
import type { StatementResult } from '../../db/engine'
import { rowKey, type DataDiff, type Row } from '../../db/dataDiff'
import { getEngine, type DbName } from '../../db/instances'
import type { SchemaModel } from '../../db/introspect'
import { ResultTable, type RowDecoration } from './ResultTable'

const LIMIT = 200

interface Props {
  db: DbName
  schema: SchemaModel
  /** Muda a cada execução para recarregar as linhas. */
  version: number
  /** O que a última execução fez nas linhas: inseridas, alteradas e removidas. */
  diff?: DataDiff | null
}

const toRow = (columns: string[], row: unknown[]): Row => Object.fromEntries(columns.map((c, i) => [c, row[i]]))

/** Mostra as linhas reais de cada tabela do banco do aluno, destacando o que a última execução mexeu. */
export function DataBrowser({ db, schema, version, diff }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [data, setData] = useState<StatementResult | null>(null)

  const names = schema.tables.map((t) => t.name)
  const current = selected && names.includes(selected) ? selected : (names[0] ?? null)

  useEffect(() => {
    if (!current) return
    let stale = false
    getEngine(db)
      .then((engine) => engine.run(`SELECT * FROM "${current}" LIMIT ${LIMIT}`))
      .then((out) => {
        if (!stale) setData(out.ok ? out.results[0] : null)
      })
    return () => {
      stale = true
    }
  }, [db, current, version])

  const table = schema.tables.find((t) => t.name === current)
  const pk = useMemo(() => table?.constraints.find((c) => c.kind === 'primary')?.columns ?? [], [table])
  const tableDiff = current ? diff?.[current] : undefined

  // Chave da linha -> como foi mexida.
  const marks = useMemo(() => {
    const added = new Set<string>()
    const changed = new Map<string, Record<string, unknown>>()
    if (tableDiff?.comparable) {
      for (const r of tableDiff.added) added.add(rowKey(r, pk))
      for (const c of tableDiff.changed) {
        changed.set(rowKey(c.after, pk), Object.fromEntries(c.changedColumns.map((col) => [col, c.before[col]])))
      }
    }
    return { added, changed }
  }, [tableDiff, pk])

  const decorate = (row: unknown[]): RowDecoration | undefined => {
    if (!data || !tableDiff?.comparable) return undefined
    const key = rowKey(toRow(data.columns, row), pk)
    if (marks.added.has(key)) return { row: 'bg-emerald-500/20', changed: undefined }
    const before = marks.changed.get(key)
    if (before) return { row: 'bg-amber-500/10', changed: before }
    return undefined
  }

  const ghostRows = tableDiff?.comparable && data ? tableDiff.removed.map((r) => data.columns.map((c) => r[c])) : []

  if (!current) {
    return <p className="p-6 text-center text-sm text-slate-400">Nenhuma tabela ainda. Quando você criar uma, os dados aparecem aqui.</p>
  }

  const badge = (name: string) => {
    const d = diff?.[name]
    if (!d) return null
    const delta = d.countAfter - d.countBefore
    const label = d.comparable
      ? [d.added.length && `+${d.added.length}`, d.changed.length && `~${d.changed.length}`, d.removed.length && `−${d.removed.length}`].filter(Boolean).join(' ')
      : delta > 0 ? `+${delta}` : `${delta}`
    return label ? <span className="ml-1 text-[10px] opacity-90">{label}</span> : null
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-800 p-2">
        {names.map((n) => (
          <button
            key={n}
            onClick={() => setSelected(n)}
            className={`whitespace-nowrap rounded px-2 py-1 text-xs ${n === current ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} ${diff?.[n] && n !== current ? 'ring-1 ring-amber-400' : ''}`}
          >
            {n}
            {badge(n)}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {data && (
          <>
            <p className="mb-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
              <span>
                {data.rows.length === 0
                  ? 'Tabela vazia'
                  : `${data.rows.length}${data.rows.length === LIMIT ? '+' : ''} ${data.rows.length === 1 ? 'linha' : 'linhas'}`}
              </span>
              {tableDiff?.comparable && (
                <span>
                  <span className="text-emerald-400">■ nova</span> <span className="text-amber-400">■ alterada</span>{' '}
                  <span className="text-red-400">■ removida</span>
                </span>
              )}
              {tableDiff && !tableDiff.comparable && <span>Tabela grande: só o total é comparado ({tableDiff.countBefore} → {tableDiff.countAfter}).</span>}
            </p>
            {data.rows.length > 0 || ghostRows.length > 0 ? (
              <ResultTable result={data} decorate={decorate} ghostRows={ghostRows} />
            ) : (
              <p className="text-sm text-slate-500">Colunas: {data.columns.join(', ')}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

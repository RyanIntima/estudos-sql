import type { Engine } from './engine'
import type { SchemaModel } from './introspect'

export type Row = Record<string, unknown>

/** Acima disso a tabela não é comparada linha a linha (só a contagem). */
export const SNAPSHOT_ROW_LIMIT = 500

export interface TableSnapshot {
  count: number
  /** Colunas da chave primária; vazio se a tabela não tem. */
  pk: string[]
  /** null quando a tabela é grande demais para comparar. */
  rows: Row[] | null
}
export type DataSnapshot = Record<string, TableSnapshot>

export interface RowChange {
  before: Row
  after: Row
  changedColumns: string[]
}

export interface TableDataDiff {
  table: string
  countBefore: number
  countAfter: number
  /** false: tabela grande demais para comparar linha a linha: só os totais valem. */
  comparable: boolean
  added: Row[]
  removed: Row[]
  changed: RowChange[]
}
export type DataDiff = Record<string, TableDataDiff>

function norm(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Date) return v.toISOString()
  return v
}

const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b))

/** Chave estável de uma linha: valores da PK, ou a linha inteira quando não há PK. */
export function rowKey(row: Row, pk: string[]): string {
  const cols = pk.length ? pk : Object.keys(row).sort()
  return JSON.stringify(cols.map((c) => norm(row[c])))
}

export async function snapshotData(engine: Engine, schema: SchemaModel): Promise<DataSnapshot> {
  const out: DataSnapshot = {}
  for (const t of schema.tables) {
    const [{ n }] = await engine.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${t.name}"`)
    const pk = t.constraints.find((c) => c.kind === 'primary')?.columns ?? []
    const rows = n <= SNAPSHOT_ROW_LIMIT ? await engine.query<Row>(`SELECT * FROM "${t.name}"`) : null
    out[t.name] = { count: n, pk, rows }
  }
  return out
}

export function diffData(before: DataSnapshot, after: DataSnapshot): DataDiff {
  const out: DataDiff = {}
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[name]
    const b = after[name]
    // Tabela criada ou apagada: o diff de estrutura conta essa história; as linhas dela entram em added/removed.
    const countBefore = a?.count ?? 0
    const countAfter = b?.count ?? 0

    const d: TableDataDiff = { table: name, countBefore, countAfter, comparable: false, added: [], removed: [], changed: [] }
    if (b && !a && b.rows) {
      d.comparable = true
      d.added = b.rows
    } else if (a && !b && a.rows) {
      d.comparable = true
      d.removed = a.rows
    } else if (a?.rows && b?.rows) {
      d.comparable = true
      const pk = b.pk.length ? b.pk : a.pk
      const old = new Map(a.rows.map((r) => [rowKey(r, pk), r]))
      const seen = new Set<string>()
      for (const row of b.rows) {
        const key = rowKey(row, pk)
        const was = old.get(key)
        seen.add(key)
        if (!was) d.added.push(row)
        else {
          const cols = Object.keys(row).filter((c) => !same(was[c], row[c]))
          if (cols.length) d.changed.push({ before: was, after: row, changedColumns: cols })
        }
      }
      d.removed = a.rows.filter((r) => !seen.has(rowKey(r, pk)))
    }

    const touched = d.added.length || d.removed.length || d.changed.length || countBefore !== countAfter
    if (touched) out[name] = d
  }
  return out
}

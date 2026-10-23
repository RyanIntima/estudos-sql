import type {
  ColumnModel,
  ConstraintModel,
  FunctionModel,
  GrantModel,
  IndexModel,
  SchemaModel,
  TableModel,
  TriggerModel,
  ViewModel,
} from './introspect'

export type ColumnAspect = 'type' | 'nullable' | 'default' | 'auto' | 'primaryKey' | 'unique' | 'foreignKey'

export interface ColumnChange {
  name: string
  before: ColumnModel
  after: ColumnModel
  aspects: ColumnAspect[]
}

export interface TableChange {
  name: string
  status: 'added' | 'removed' | 'changed'
  /** Estado depois da execução; para tabelas removidas, o estado de antes. */
  table: TableModel
  addedColumns: string[]
  removedColumns: ColumnModel[]
  changedColumns: ColumnChange[]
  addedConstraints: ConstraintModel[]
  removedConstraints: ConstraintModel[]
  addedIndexes: IndexModel[]
  removedIndexes: IndexModel[]
}

/** O que mudou fora das tabelas e das suas colunas. */
export type ObjectChange =
  | { kind: 'view'; id: string; status: Status; view: ViewModel }
  | { kind: 'function'; id: string; status: Status; fn: FunctionModel }
  | { kind: 'trigger'; id: string; status: Status; table: string; trigger: TriggerModel }
  | { kind: 'role'; id: string; status: Status }
  | { kind: 'schema'; id: string; status: Status }
  | { kind: 'grant'; id: string; status: Status; grant: GrantModel }

type Status = 'added' | 'removed' | 'changed'

export interface SchemaDiff {
  tables: TableChange[]
  objects: ObjectChange[]
}

export const isSchemaDiffEmpty = (d: SchemaDiff) => d.tables.length === 0 && d.objects.length === 0

const auto = (c: ColumnModel) => c.identity || c.serial

function changedAspects(a: ColumnModel, b: ColumnModel): ColumnAspect[] {
  const out: ColumnAspect[] = []
  if (a.type !== b.type) out.push('type')
  if (a.nullable !== b.nullable) out.push('nullable')
  // Com SERIAL o default é nextval(...): só importa se o default mudou de fato, não o fato de ser automático.
  if (a.default !== b.default && !(a.serial && b.serial)) out.push('default')
  if (auto(a) !== auto(b)) out.push('auto')
  if (a.isPrimaryKey !== b.isPrimaryKey) out.push('primaryKey')
  if (a.isUnique !== b.isUnique) out.push('unique')
  if (a.isForeignKey !== b.isForeignKey) out.push('foreignKey')
  return out
}

// O nome da constraint pode ser gerado pelo banco: a definição é a identidade.
const constraintKey = (c: ConstraintModel) => `${c.kind}:${c.definition}`
const indexKey = (i: IndexModel) => i.definition

const empty = (name: string, status: TableChange['status'], table: TableModel): TableChange => ({
  name,
  status,
  table,
  addedColumns: [],
  removedColumns: [],
  changedColumns: [],
  addedConstraints: [],
  removedConstraints: [],
  addedIndexes: [],
  removedIndexes: [],
})

/** Compara dois conjuntos de objetos pela identidade `key`; mesmo id com `same` falso = alterado. */
function diffById<T>(
  before: T[],
  after: T[],
  key: (x: T) => string,
  same: (a: T, b: T) => boolean,
  make: (id: string, status: Status, item: T) => ObjectChange,
): ObjectChange[] {
  const prev = new Map(before.map((x) => [key(x), x]))
  const next = new Map(after.map((x) => [key(x), x]))
  const out: ObjectChange[] = []
  for (const [id, item] of next) {
    const was = prev.get(id)
    if (!was) out.push(make(id, 'added', item))
    else if (!same(was, item)) out.push(make(id, 'changed', item))
  }
  for (const [id, item] of prev) if (!next.has(id)) out.push(make(id, 'removed', item))
  return out
}

function diffObjects(before: SchemaModel, after: SchemaModel): ObjectChange[] {
  const triggers = (m: SchemaModel) => m.tables.flatMap((t) => t.triggers.map((trigger) => ({ table: t.name, trigger })))
  return [
    ...diffById(before.views, after.views, (v) => v.id, (a, b) => a.definition === b.definition && a.materialized === b.materialized, (id, status, view) => ({ kind: 'view', id, status, view })),
    ...diffById(before.functions, after.functions, (f) => f.id, (a, b) => a.definition === b.definition, (id, status, fn) => ({ kind: 'function', id, status, fn })),
    ...diffById(triggers(before), triggers(after), (t) => `${t.table}.${t.trigger.name}`, (a, b) => a.trigger.definition === b.trigger.definition, (id, status, t) => ({ kind: 'trigger', id, status, table: t.table, trigger: t.trigger })),
    ...diffById(before.roles, after.roles, (r) => r, () => true, (id, status) => ({ kind: 'role', id, status })),
    ...diffById(before.schemas, after.schemas, (s) => s, () => true, (id, status) => ({ kind: 'schema', id, status })),
    ...diffById(before.grants, after.grants, (g) => `${g.privilege} ON ${g.object} TO ${g.grantee}`, () => true, (id, status, grant) => ({ kind: 'grant', id, status, grant })),
  ]
}

export function diffSchemas(before: SchemaModel, after: SchemaModel): SchemaDiff {
  const prev = new Map(before.tables.map((t) => [t.name, t]))
  const next = new Map(after.tables.map((t) => [t.name, t]))
  const tables: TableChange[] = []

  for (const t of after.tables) {
    const old = prev.get(t.name)
    if (!old) {
      const c = empty(t.name, 'added', t)
      c.addedColumns = t.columns.map((col) => col.name)
      c.addedConstraints = t.constraints
      c.addedIndexes = t.indexes
      tables.push(c)
      continue
    }

    const change = empty(t.name, 'changed', t)
    const oldCols = new Map(old.columns.map((c) => [c.name, c]))
    for (const col of t.columns) {
      const was = oldCols.get(col.name)
      if (!was) change.addedColumns.push(col.name)
      else {
        const aspects = changedAspects(was, col)
        if (aspects.length) change.changedColumns.push({ name: col.name, before: was, after: col, aspects })
      }
    }
    const newCols = new Set(t.columns.map((c) => c.name))
    change.removedColumns = old.columns.filter((c) => !newCols.has(c.name))

    const oldCons = new Set(old.constraints.map(constraintKey))
    const newCons = new Set(t.constraints.map(constraintKey))
    change.addedConstraints = t.constraints.filter((c) => !oldCons.has(constraintKey(c)))
    change.removedConstraints = old.constraints.filter((c) => !newCons.has(constraintKey(c)))

    const oldIdx = new Set(old.indexes.map(indexKey))
    const newIdx = new Set(t.indexes.map(indexKey))
    change.addedIndexes = t.indexes.filter((i) => !oldIdx.has(indexKey(i)))
    change.removedIndexes = old.indexes.filter((i) => !newIdx.has(indexKey(i)))

    const touched =
      change.addedColumns.length ||
      change.removedColumns.length ||
      change.changedColumns.length ||
      change.addedConstraints.length ||
      change.removedConstraints.length ||
      change.addedIndexes.length ||
      change.removedIndexes.length
    if (touched) tables.push(change)
  }

  for (const t of before.tables) {
    if (!next.has(t.name)) {
      const c = empty(t.name, 'removed', t)
      c.removedColumns = t.columns
      c.removedConstraints = t.constraints
      c.removedIndexes = t.indexes
      tables.push(c)
    }
  }
  return { tables, objects: diffObjects(before, after) }
}

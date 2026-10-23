import type { Engine } from './engine'

export type ConstraintKind = 'primary' | 'unique' | 'foreign' | 'check'
export type ReferentialAction = 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT'

export interface ColumnModel {
  name: string
  /** Tipo como o Postgres mostra, ex.: "numeric(10,2)", "character varying(120)". */
  type: string
  nullable: boolean
  default: string | null
  /** GENERATED ... AS IDENTITY */
  identity: boolean
  /** 'a' = ALWAYS, 'd' = BY DEFAULT; vazio se não é identity. */
  identityKind: 'always' | 'by default' | null
  /** Default baseado em sequence (SERIAL). */
  serial: boolean
  isPrimaryKey: boolean
  /** Coluna única sozinha (UNIQUE de uma coluna só). */
  isUnique: boolean
  isForeignKey: boolean
}

export interface ConstraintModel {
  name: string
  kind: ConstraintKind
  columns: string[]
  /** Definição legível, ex.: "CHECK ((preco > 0))". */
  definition: string
  refTable?: string
  refColumns?: string[]
  onDelete?: ReferentialAction
  onUpdate?: ReferentialAction
}

export interface IndexModel {
  name: string
  unique: boolean
  primary: boolean
  definition: string
  /** Método de acesso: btree, hash, gin… */
  method: string
  /** Colunas (ou expressões) indexadas, na ordem. */
  columns: string[]
  /** Condição de um índice parcial, ou null. */
  predicate: string | null
}

export type TriggerEvent = 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE'

export interface TriggerModel {
  name: string
  timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF'
  events: TriggerEvent[]
  level: 'ROW' | 'STATEMENT'
  /** Função que o trigger executa. */
  function: string
  definition: string
}

export interface TableModel {
  name: string
  columns: ColumnModel[]
  constraints: ConstraintModel[]
  indexes: IndexModel[]
  triggers: TriggerModel[]
}

export interface ViewModel {
  schema: string
  name: string
  /** "nome" no schema public; "schema.nome" nos demais. */
  id: string
  materialized: boolean
  definition: string
  columns: string[]
  /** Tabelas e views de que ela depende (ids), para desenhar as ligações no diagrama. */
  dependsOn: string[]
}

export interface FunctionModel {
  schema: string
  name: string
  /** "nome(tipos dos argumentos)" qualificado se estiver fora do public. */
  id: string
  args: string
  returns: string
  language: string
  definition: string
}

export interface GrantModel {
  /** Tabela, view ou schema, qualificado. */
  object: string
  objectKind: 'table' | 'schema'
  grantee: string
  privilege: string
}

export interface SchemaModel {
  tables: TableModel[]
  views: ViewModel[]
  functions: FunctionModel[]
  /** Papéis criados pelo aluno (sem os do sistema). */
  roles: string[]
  /** Schemas criados pelo aluno além do public. */
  schemas: string[]
  grants: GrantModel[]
}

export const EMPTY_SCHEMA: SchemaModel = { tables: [], views: [], functions: [], roles: [], schemas: [], grants: [] }

const qualified = (schema: string, name: string) => (schema === 'public' ? name : `${schema}.${name}`)

const ACTIONS: Record<string, ReferentialAction> = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
}
const KINDS: Record<string, ConstraintKind> = { p: 'primary', u: 'unique', f: 'foreign', c: 'check' }

interface ColumnRow {
  table_name: string
  name: string
  type: string
  nullable: boolean
  default: string | null
  identity: string
}
interface ConstraintRow {
  table_name: string
  name: string
  kind: string
  columns: string[]
  definition: string
  ref_table: string | null
  ref_columns: string[]
  on_delete: string
  on_update: string
}
interface IndexRow {
  table_name: string
  name: string
  is_unique: boolean
  is_primary: boolean
  definition: string
  method: string
  columns: string[]
  predicate: string | null
}
interface TriggerRow {
  table_name: string
  name: string
  tgtype: number
  function: string
  definition: string
}

// attname é do tipo `name`; o cast para text garante que o PGlite devolva arrays JS.
const COLUMNS_SQL = `
  SELECT c.relname::text AS table_name, a.attname::text AS name,
         format_type(a.atttypid, a.atttypmod) AS type,
         NOT a.attnotnull AS nullable,
         pg_get_expr(d.adbin, d.adrelid) AS "default",
         a.attidentity::text AS identity
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
     AND a.attnum > 0 AND NOT a.attisdropped
   ORDER BY c.relname, a.attnum`

const CONSTRAINTS_SQL = `
  SELECT c.relname::text AS table_name, con.conname::text AS name, con.contype::text AS kind,
         ARRAY(SELECT a.attname::text
                 FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
                ORDER BY k.ord) AS columns,
         pg_get_constraintdef(con.oid) AS definition,
         ref.relname::text AS ref_table,
         ARRAY(SELECT a.attname::text
                 FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
                ORDER BY k.ord) AS ref_columns,
         con.confdeltype::text AS on_delete, con.confupdtype::text AS on_update
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_class ref ON ref.oid = con.confrelid
   WHERE n.nspname = $1 AND con.contype IN ('p', 'u', 'f', 'c')
   ORDER BY c.relname, con.conname`

const INDEXES_SQL = `
  SELECT t.relname::text AS table_name, i.relname::text AS name,
         ix.indisunique AS is_unique, ix.indisprimary AS is_primary,
         pg_get_indexdef(ix.indexrelid) AS definition,
         am.amname::text AS method,
         ARRAY(SELECT pg_get_indexdef(ix.indexrelid, k, true)
                 FROM generate_series(1, ix.indnkeyatts::int) k ORDER BY k) AS columns,
         pg_get_expr(ix.indpred, ix.indrelid) AS predicate
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_am am ON am.oid = i.relam
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = $1 AND t.relkind IN ('r', 'p')
   ORDER BY t.relname, i.relname`

const TRIGGERS_SQL = `
  SELECT c.relname::text AS table_name, t.tgname::text AS name, t.tgtype::int AS tgtype,
         p.proname::text AS "function", pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE n.nspname = $1 AND NOT t.tgisinternal
   ORDER BY c.relname, t.tgname`

// Objetos fora do schema "public" também contam (views em relatorios, por exemplo); só os do sistema ficam de fora.
const USER_SCHEMA = `left(n.nspname, 3) <> 'pg_' AND n.nspname <> 'information_schema'`

const VIEWS_SQL = `
  SELECT n.nspname::text AS schema, c.relname::text AS name, c.relkind::text AS kind,
         pg_get_viewdef(c.oid, true) AS definition,
         ARRAY(SELECT a.attname::text FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind IN ('v', 'm') AND ${USER_SCHEMA}
   ORDER BY n.nspname, c.relname`

const VIEW_DEPS_SQL = `
  SELECT DISTINCT n.nspname::text AS schema, v.relname::text AS view,
         nt.nspname::text AS dep_schema, t.relname::text AS dep
    FROM pg_rewrite r
    JOIN pg_depend d ON d.objid = r.oid AND d.classid = 'pg_rewrite'::regclass AND d.refclassid = 'pg_class'::regclass
    JOIN pg_class v ON v.oid = r.ev_class
    JOIN pg_namespace n ON n.oid = v.relnamespace
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace nt ON nt.oid = t.relnamespace
   WHERE v.relkind IN ('v', 'm') AND t.oid <> v.oid AND t.relkind IN ('r', 'p', 'v', 'm') AND ${USER_SCHEMA}`

const FUNCTIONS_SQL = `
  SELECT n.nspname::text AS schema, p.proname::text AS name,
         pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS returns,
         l.lanname::text AS language, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE p.prokind = 'f' AND ${USER_SCHEMA}
   ORDER BY n.nspname, p.proname, 3`

const ROLES_SQL = `SELECT rolname::text AS name FROM pg_roles WHERE left(rolname, 3) <> 'pg_' AND rolname <> current_user ORDER BY 1`

const SCHEMAS_SQL = `SELECT n.nspname::text AS name FROM pg_namespace n WHERE ${USER_SCHEMA} AND n.nspname <> 'public' ORDER BY 1`

// Permissões de tabelas/views e de schemas dadas a papéis (as dadas a PUBLIC e ao dono ficam de fora).
const GRANTS_SQL = `
  SELECT n.nspname::text AS schema, c.relname::text AS name, 'table' AS kind, r.rolname::text AS grantee, a.privilege_type::text AS privilege
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles r ON r.oid = a.grantee
   WHERE c.relkind IN ('r', 'p', 'v', 'm') AND a.grantee <> c.relowner AND ${USER_SCHEMA}
  UNION ALL
  SELECT n.nspname::text, n.nspname::text, 'schema', r.rolname::text, a.privilege_type::text
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(n.nspacl) a
    JOIN pg_roles r ON r.oid = a.grantee
   WHERE a.grantee <> n.nspowner AND ${USER_SCHEMA}
  ORDER BY 1, 2, 4, 5`

/** tgtype é um conjunto de bits: ROW=1, BEFORE=2, INSERT=4, DELETE=8, UPDATE=16, TRUNCATE=32, INSTEAD OF=64. */
function decodeTrigger(r: TriggerRow): TriggerModel {
  const events: TriggerEvent[] = []
  if (r.tgtype & 4) events.push('INSERT')
  if (r.tgtype & 16) events.push('UPDATE')
  if (r.tgtype & 8) events.push('DELETE')
  if (r.tgtype & 32) events.push('TRUNCATE')
  return {
    name: r.name,
    timing: r.tgtype & 64 ? 'INSTEAD OF' : r.tgtype & 2 ? 'BEFORE' : 'AFTER',
    events,
    level: r.tgtype & 1 ? 'ROW' : 'STATEMENT',
    function: r.function,
    definition: r.definition,
  }
}

/** `schema` é o schema das TABELAS; views, funções, papéis e permissões vêm de todos os schemas do aluno. */
export async function introspect(engine: Engine, schema = 'public'): Promise<SchemaModel> {
  const [columnRows, constraintRows, indexRows, triggerRows, viewRows, depRows, functionRows, roleRows, schemaRows, grantRows] = await Promise.all([
    engine.query<ColumnRow>(COLUMNS_SQL, [schema]),
    engine.query<ConstraintRow>(CONSTRAINTS_SQL, [schema]),
    engine.query<IndexRow>(INDEXES_SQL, [schema]),
    engine.query<TriggerRow>(TRIGGERS_SQL, [schema]),
    engine.query<{ schema: string; name: string; kind: string; definition: string; columns: string[] }>(VIEWS_SQL),
    engine.query<{ schema: string; view: string; dep_schema: string; dep: string }>(VIEW_DEPS_SQL),
    engine.query<{ schema: string; name: string; args: string; returns: string; language: string; definition: string }>(FUNCTIONS_SQL),
    engine.query<{ name: string }>(ROLES_SQL),
    engine.query<{ name: string }>(SCHEMAS_SQL),
    engine.query<{ schema: string; name: string; kind: 'table' | 'schema'; grantee: string; privilege: string }>(GRANTS_SQL),
  ])

  const tables = new Map<string, TableModel>()
  const table = (name: string) => {
    let t = tables.get(name)
    if (!t) tables.set(name, (t = { name, columns: [], constraints: [], indexes: [], triggers: [] }))
    return t
  }

  for (const c of constraintRows) {
    const kind = KINDS[c.kind]
    table(c.table_name).constraints.push({
      name: c.name,
      kind,
      columns: c.columns,
      definition: c.definition,
      ...(kind === 'foreign' && {
        refTable: c.ref_table ?? undefined,
        refColumns: c.ref_columns,
        onDelete: ACTIONS[c.on_delete],
        onUpdate: ACTIONS[c.on_update],
      }),
    })
  }

  for (const c of columnRows) {
    const t = table(c.table_name)
    const inKind = (kind: ConstraintKind, onlyOne = false) =>
      t.constraints.some(
        (k) => k.kind === kind && k.columns.includes(c.name) && (!onlyOne || k.columns.length === 1),
      )
    t.columns.push({
      name: c.name,
      type: c.type,
      nullable: c.nullable,
      default: c.default,
      identity: c.identity !== '',
      identityKind: c.identity === 'a' ? 'always' : c.identity === 'd' ? 'by default' : null,
      serial: c.default?.startsWith('nextval(') ?? false,
      isPrimaryKey: inKind('primary'),
      isUnique: inKind('unique', true),
      isForeignKey: inKind('foreign'),
    })
  }

  for (const i of indexRows) {
    table(i.table_name).indexes.push({
      name: i.name,
      unique: i.is_unique,
      primary: i.is_primary,
      definition: i.definition,
      method: i.method,
      columns: i.columns,
      predicate: i.predicate,
    })
  }

  for (const t of triggerRows) table(t.table_name).triggers.push(decodeTrigger(t))

  const deps = new Map<string, string[]>()
  for (const d of depRows) {
    const key = qualified(d.schema, d.view)
    deps.set(key, [...(deps.get(key) ?? []), qualified(d.dep_schema, d.dep)])
  }
  const views: ViewModel[] = viewRows.map((v) => ({
    schema: v.schema,
    name: v.name,
    id: qualified(v.schema, v.name),
    materialized: v.kind === 'm',
    definition: v.definition.trim(),
    columns: v.columns,
    dependsOn: (deps.get(qualified(v.schema, v.name)) ?? []).sort(),
  }))

  const functions: FunctionModel[] = functionRows.map((f) => ({
    schema: f.schema,
    name: f.name,
    id: `${qualified(f.schema, f.name)}(${f.args})`,
    args: f.args,
    returns: f.returns,
    language: f.language,
    definition: f.definition,
  }))

  const grants: GrantModel[] = grantRows.map((g) => ({
    object: g.kind === 'schema' ? g.schema : qualified(g.schema, g.name),
    objectKind: g.kind,
    grantee: g.grantee,
    privilege: g.privilege,
  }))

  return {
    tables: [...tables.values()].sort((a, b) => a.name.localeCompare(b.name)),
    views,
    functions,
    roles: roleRows.map((r) => r.name),
    schemas: schemaRows.map((s) => s.name),
    grants,
  }
}

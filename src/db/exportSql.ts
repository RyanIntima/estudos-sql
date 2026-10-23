import type { Engine } from './engine'
import { introspect, type TableModel, type ViewModel } from './introspect'

const q = (name: string) => `"${name.replace(/"/g, '""')}"`
const BATCH = 500

/** `schema.nome` quando não é do public, entre aspas. */
const qualified = (id: string) =>
  id
    .split('.')
    .map(q)
    .join('.')

function columnDef(t: TableModel, c: TableModel['columns'][number]): string {
  if (c.serial) {
    // Uma coluna SERIAL é um inteiro com default nextval(...): recria-se como SERIAL, que reconstrói a sequência.
    const kind = c.type === 'bigint' ? 'BIGSERIAL' : c.type === 'smallint' ? 'SMALLSERIAL' : 'SERIAL'
    return `${q(c.name)} ${kind}`
  }
  const parts = [q(c.name), c.type]
  if (c.identityKind) parts.push(`GENERATED ${c.identityKind === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`)
  else if (c.default !== null) parts.push(`DEFAULT ${c.default}`)
  if (!c.nullable) parts.push('NOT NULL')
  void t
  return parts.join(' ')
}

/** Views que dependem de outras views vêm depois delas. */
function sortViews(views: ViewModel[]): ViewModel[] {
  const done = new Set<string>()
  const out: ViewModel[] = []
  const ids = new Set(views.map((v) => v.id))
  let pending = [...views]
  while (pending.length) {
    const ready = pending.filter((v) => v.dependsOn.every((d) => !ids.has(d) || done.has(d)))
    const batch = ready.length ? ready : pending // ciclo impossível em views; evita laço infinito mesmo assim
    for (const v of batch) {
      out.push(v)
      done.add(v.id)
    }
    pending = pending.filter((v) => !batch.includes(v))
  }
  return out
}

async function rows(engine: Engine, table: TableModel): Promise<string[]> {
  const cols = table.columns.map((c) => c.name)
  const pk = table.constraints.find((c) => c.kind === 'primary')?.columns
  // Cada valor vira um literal de texto (NULL quando vazio): o Postgres converte para o tipo da coluna ao inserir.
  const literal = cols.map((c) => `quote_nullable(${q(c)}::text)`).join(` || ', ' || `)
  const order = pk?.length ? pk.map(q).join(', ') : 'ctid'
  const res = await engine.query<{ r: string }>(`SELECT '(' || ${literal} || ')' AS r FROM ${q(table.name)} ORDER BY ${order}`)
  return res.map((x) => x.r)
}

/**
 * Gera um script SQL que recria o banco: estrutura, dados e objetos.
 * Ordem pensada para dispensar o cálculo de dependências: tabelas → dados → chaves estrangeiras → índices →
 * funções → views → triggers (depois dos dados, para não dispararem na carga) → sequências → permissões.
 */
export async function exportSql(engine: Engine, now = new Date()): Promise<string> {
  const schema = await introspect(engine)
  const out: string[] = []
  const section = (title: string) => out.push('', `-- ${'='.repeat(60)}`, `-- ${title}`, `-- ${'='.repeat(60)}`)

  out.push(
    '-- LojaDB: exportado pelo SQL Quest',
    `-- Gerado em ${now.toISOString()}`,
    '-- Para recriar o banco, rode este arquivo inteiro num PostgreSQL vazio.',
  )

  if (schema.schemas.length) {
    section('Schemas')
    for (const s of schema.schemas) out.push(`CREATE SCHEMA ${q(s)};`)
  }

  if (schema.roles.length) {
    section('Papéis')
    const attrs = await engine.query<{ rolname: string; rolcanlogin: boolean }>(
      `SELECT rolname::text, rolcanlogin FROM pg_roles WHERE left(rolname, 3) <> 'pg_' AND rolname <> current_user ORDER BY 1`,
    )
    for (const r of attrs) out.push(`CREATE ROLE ${q(r.rolname)} ${r.rolcanlogin ? 'LOGIN' : 'NOLOGIN'};`)
  }

  section('Tabelas')
  for (const t of schema.tables) {
    const lines = t.columns.map((c) => '  ' + columnDef(t, c))
    for (const k of t.constraints.filter((c) => c.kind !== 'foreign')) lines.push(`  CONSTRAINT ${q(k.name)} ${k.definition}`)
    out.push(`CREATE TABLE ${q(t.name)} (\n${lines.join(',\n')}\n);`)
  }

  section('Dados')
  for (const t of schema.tables) {
    const data = await rows(engine, t)
    if (!data.length) continue
    const override = t.columns.some((c) => c.identityKind === 'always') ? ' OVERRIDING SYSTEM VALUE' : ''
    const cols = t.columns.map((c) => q(c.name)).join(', ')
    for (let i = 0; i < data.length; i += BATCH) {
      out.push(`INSERT INTO ${q(t.name)} (${cols})${override} VALUES\n  ${data.slice(i, i + BATCH).join(',\n  ')};`)
    }
  }

  const fks = schema.tables.flatMap((t) => t.constraints.filter((c) => c.kind === 'foreign').map((c) => ({ t, c })))
  if (fks.length) {
    section('Chaves estrangeiras (depois dos dados: a ordem de carga deixa de importar)')
    for (const { t, c } of fks) out.push(`ALTER TABLE ${q(t.name)} ADD CONSTRAINT ${q(c.name)} ${c.definition};`)
  }

  const indexes = schema.tables.flatMap((t) =>
    t.indexes.filter((i) => !i.primary && !t.constraints.some((k) => k.name === i.name)).map((i) => i.definition),
  )
  if (indexes.length) {
    section('Índices')
    for (const d of indexes) out.push(`${d};`)
  }

  if (schema.functions.length) {
    section('Funções')
    for (const f of schema.functions) out.push(`${f.definition.trim().replace(/;$/, '')};`)
  }

  if (schema.views.length) {
    section('Views')
    for (const v of sortViews(schema.views)) {
      const body = v.definition.replace(/;\s*$/, '')
      out.push(`CREATE ${v.materialized ? 'MATERIALIZED ' : ''}VIEW ${qualified(v.id)} AS\n${body};`)
    }
    // Índices das views materializadas não aparecem no modelo de tabelas.
    const mvIdx = await engine.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE (schemaname, tablename) IN (
         SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'm')`,
    )
    for (const i of mvIdx) out.push(`${i.indexdef};`)
  }

  const triggers = schema.tables.flatMap((t) => t.triggers)
  if (triggers.length) {
    section('Triggers (criados depois dos dados, para não dispararem durante a carga)')
    for (const t of triggers) out.push(`${t.definition};`)
  }

  const serials = schema.tables.flatMap((t) => t.columns.filter((c) => c.serial || c.identity).map((c) => ({ t, c })))
  if (serials.length) {
    section('Contadores automáticos: continuam do último valor')
    for (const { t, c } of serials) {
      out.push(
        `SELECT setval(pg_get_serial_sequence('${q(t.name)}', '${c.name}'), COALESCE((SELECT max(${q(c.name)}) FROM ${q(t.name)}), 1), (SELECT max(${q(c.name)}) IS NOT NULL FROM ${q(t.name)}));`,
      )
    }
  }

  if (schema.grants.length) {
    section('Permissões')
    const byKey = new Map<string, { kind: string; object: string; grantee: string; privileges: string[] }>()
    for (const g of schema.grants) {
      const key = `${g.objectKind}|${g.object}|${g.grantee}`
      const e = byKey.get(key) ?? { kind: g.objectKind, object: g.object, grantee: g.grantee, privileges: [] }
      e.privileges.push(g.privilege)
      byKey.set(key, e)
    }
    for (const e of byKey.values()) out.push(`GRANT ${e.privileges.join(', ')} ON ${e.kind === 'schema' ? 'SCHEMA ' : ''}${qualified(e.object)} TO ${q(e.grantee)};`)
  }

  return out.join('\n') + '\n'
}

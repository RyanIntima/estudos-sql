import type { Engine } from './engine'
import { introspect } from './introspect'

/** Resumo comparável do estado do banco: estrutura, quantidade de linhas por tabela e objetos avulsos. */
export interface Fingerprint {
  tables: Record<
    string,
    {
      columns: Record<string, string>
      /** Regra normalizada → texto original (a normalizada compara; a original aparece nas mensagens). */
      constraints: Record<string, string>
      indexes: string[]
      triggers: string[]
      rows: number
    }
  >
  /** Views, funções, papéis e permissões: identidade → assinatura (para notar também as redefinidas). */
  objects: Record<'view' | 'function' | 'role' | 'schema' | 'grant', Record<string, string>>
}

/**
 * Forma comparável de uma regra: sem casts, parênteses e espaços. O Postgres reescreve o texto de um CHECK ao
 * recriá-lo (`ANY ((ARRAY[...])::text[])` vira `ANY (ARRAY[(...)::text, ...])`), e duas regras equivalentes
 * escritas de jeitos diferentes não podem aparecer como "divergência".
 */
export function normalizeConstraint(definition: string): string {
  return definition
    .replace(/::[a-z_ ]+(\[\])?/gi, '')
    .replace(/[()\s]+/g, '')
    .toLowerCase()
}

export async function fingerprint(engine: Engine): Promise<Fingerprint> {
  const schema = await introspect(engine)
  const tables: Fingerprint['tables'] = {}
  for (const t of schema.tables) {
    const [{ n }] = await engine.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${t.name}"`)
    tables[t.name] = {
      columns: Object.fromEntries(
        t.columns.map((c) => [
          c.name,
          `${c.type}${c.nullable ? '' : ' NOT NULL'}${c.identity || c.serial ? ' (auto)' : ''}`,
        ]),
      ),
      // O nome da constraint é ignorado: o aluno pode ter escolhido outro nome.
      constraints: Object.fromEntries(t.constraints.map((c) => [normalizeConstraint(c.definition), c.definition])),
      // O nome do índice conta (é o que o aluno escolhe); o resto vem da definição.
      indexes: t.indexes.filter((i) => !i.primary && !i.unique).map((i) => i.definition).sort(),
      triggers: t.triggers.map((x) => `${x.name}: ${x.timing} ${x.events.join('/')} ${x.level}`).sort(),
      rows: n,
    }
  }
  return {
    tables,
    objects: {
      view: Object.fromEntries(schema.views.map((v) => [v.id, `${v.materialized ? 'materializada: ' : ''}${v.definition}`])),
      function: Object.fromEntries(schema.functions.map((f) => [f.id, f.definition])),
      role: Object.fromEntries(schema.roles.map((r) => [r, r])),
      schema: Object.fromEntries(schema.schemas.map((s) => [s, s])),
      grant: Object.fromEntries(schema.grants.map((g) => [`${g.privilege} em ${g.object} para ${g.grantee}`, ''])),
    },
  }
}

const OBJECT_LABEL: Record<keyof Fingerprint['objects'], [string, string]> = {
  view: ['a view', 'view'],
  function: ['a função', 'função'],
  role: ['o papel', 'papel'],
  schema: ['o schema', 'schema'],
  grant: ['a permissão', 'permissão'],
}

/** Diferenças em português, do ponto de vista de "o que falta/sobra no banco do aluno". */
export function diffFingerprints(expected: Fingerprint, actual: Fingerprint): string[] {
  const out: string[] = []
  for (const name of Object.keys(expected.tables)) {
    const e = expected.tables[name]
    const a = actual.tables[name]
    if (!a) {
      out.push(`Falta a tabela \`${name}\`.`)
      continue
    }
    for (const [col, type] of Object.entries(e.columns)) {
      if (!(col in a.columns)) out.push(`\`${name}\`: falta a coluna \`${col}\` (${type}).`)
      else if (a.columns[col] !== type) {
        out.push(`\`${name}.${col}\`: esperado ${type}, encontrado ${a.columns[col]}.`)
      }
    }
    for (const col of Object.keys(a.columns)) {
      if (!(col in e.columns)) out.push(`\`${name}\`: a coluna \`${col}\` ainda não deveria existir.`)
    }
    for (const [key, shown] of Object.entries(e.constraints)) {
      if (!(key in a.constraints)) out.push(`\`${name}\`: falta a regra ${shown}.`)
    }
    for (const [key, shown] of Object.entries(a.constraints)) {
      if (!(key in e.constraints)) out.push(`\`${name}\`: a regra ${shown} ainda não deveria existir.`)
    }
    for (const i of e.indexes) if (!a.indexes.includes(i)) out.push(`\`${name}\`: falta o índice \`${i.match(/INDEX (\S+)/)?.[1] ?? i}\`.`)
    for (const i of a.indexes) if (!e.indexes.includes(i)) out.push(`\`${name}\`: o índice \`${i.match(/INDEX (\S+)/)?.[1] ?? i}\` ainda não deveria existir.`)
    for (const t of e.triggers) if (!a.triggers.includes(t)) out.push(`\`${name}\`: falta o trigger \`${t.split(':')[0]}\`.`)
    for (const t of a.triggers) if (!e.triggers.includes(t)) out.push(`\`${name}\`: o trigger \`${t.split(':')[0]}\` ainda não deveria existir.`)
    if (a.rows !== e.rows) out.push(`\`${name}\` tem ${a.rows} linha(s); o esperado era ${e.rows}.`)
  }
  for (const name of Object.keys(actual.tables)) {
    if (!(name in expected.tables)) out.push(`A tabela \`${name}\` ainda não deveria existir.`)
  }

  for (const kind of Object.keys(expected.objects) as (keyof Fingerprint['objects'])[]) {
    const [article, noun] = OBJECT_LABEL[kind]
    const e = expected.objects[kind]
    const a = actual.objects[kind]
    for (const id of Object.keys(e)) {
      if (!(id in a)) out.push(`Falta ${article} \`${id}\`.`)
      else if (a[id] !== e[id]) out.push(`${article[0].toUpperCase()}${article.slice(1)} \`${id}\` está diferente do esperado.`)
    }
    for (const id of Object.keys(a)) if (!(id in e)) out.push(`${noun[0].toUpperCase()}${noun.slice(1)} \`${id}\` ainda não deveria existir.`)
  }
  return out
}

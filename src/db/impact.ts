import type { RunOutcome } from './engine'
import type { DataDiff } from './dataDiff'
import type { IndexModel } from './introspect'
import type { ObjectChange, SchemaDiff, TableChange } from './schemaDiff'

export interface ImpactItem {
  kind: 'structure' | 'data' | 'query' | 'info' | 'error'
  /** Markdown curto. */
  text: string
}

export interface Change {
  schema: SchemaDiff
  data: DataDiff
  outcome: RunOutcome
}

const s = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const c = (x: string) => `\`${x}\``

function describeConstraint(t: string, k: TableChange['addedConstraints'][number]): string {
  switch (k.kind) {
    case 'primary':
      return `Definiu a chave primária de ${c(t)}: ${c(k.columns.join(', '))} (única e nunca vazia).`
    case 'unique':
      return `Nova regra em ${c(t)}: ${c(k.columns.join(', '))} não pode se repetir (UNIQUE).`
    case 'foreign': {
      const del = k.onDelete && k.onDelete !== 'NO ACTION' ? ` Ao apagar o pai: ${k.onDelete}.` : ''
      return `${c(`${t}.${k.columns.join(', ')}`)} agora aponta para ${c(`${k.refTable}.${k.refColumns?.join(', ')}`)} (chave estrangeira).${del}`
    }
    case 'check':
      return `Nova regra em ${c(t)}: ${c(k.definition)}.`
  }
}

function describeIndex(table: string, i: IndexModel): string {
  const kind = i.unique ? 'índice **único**' : 'índice'
  const partial = i.predicate ? `, **só** para as linhas onde ${c(i.predicate)}` : ''
  const method = i.method === 'btree' ? 'B-tree' : i.method
  return `Criou o ${kind} ${c(i.name)} em ${c(`${table} (${i.columns.join(', ')})`)} (${method})${partial}. Buscas por essas colunas ficam mais rápidas; em troca, cada escrita na tabela custa um pouco mais.`
}

const EVENTS: Record<string, string> = { INSERT: 'um INSERT', UPDATE: 'um UPDATE', DELETE: 'um DELETE', TRUNCATE: 'um TRUNCATE' }

/** Objetos fora das tabelas: views, funções, triggers, papéis e permissões. */
function objectItems(objects: ObjectChange[]): ImpactItem[] {
  const items: ImpactItem[] = []
  const add = (text: string) => items.push({ kind: 'structure', text })
  const grants = new Map<string, { to: string; object: string; privileges: string[]; status: string }>()

  for (const o of objects) {
    switch (o.kind) {
      case 'view': {
        const what = o.view.materialized ? 'a view **materializada**' : 'a view'
        if (o.status === 'added') {
          add(
            o.view.materialized
              ? `Criou ${what} ${c(o.id)}: ela **guarda o resultado** da consulta; para atualizá-lo é preciso \`REFRESH MATERIALIZED VIEW\`.`
              : `Criou ${what} ${c(o.id)}: uma consulta com nome. Ela **não guarda dados**: roda a consulta toda vez que é lida.`,
          )
        } else if (o.status === 'changed') add(`Redefiniu ${what} ${c(o.id)}.`)
        else add(`Apagou ${what} ${c(o.id)}.`)
        break
      }
      case 'function':
        add(
          o.status === 'removed'
            ? `Apagou a função ${c(o.id)}.`
            : `${o.status === 'added' ? 'Criou' : 'Redefiniu'} a função ${c(o.id)}: devolve ${c(o.fn.returns)} (linguagem ${o.fn.language}).`,
        )
        break
      case 'trigger': {
        const when = `${o.trigger.timing} ${o.trigger.events.map((e) => EVENTS[e] ?? e).join(' ou ')}`
        add(
          o.status === 'removed'
            ? `Apagou o trigger ${c(o.trigger.name)} de ${c(o.table)}.`
            : `${o.status === 'added' ? 'Criou' : 'Redefiniu'} o trigger ${c(o.trigger.name)} em ${c(o.table)}: ${when}, ${o.trigger.level === 'ROW' ? 'para **cada linha**' : 'uma vez por comando'}, ele executa ${c(o.trigger.function + '()')} sozinho.`,
        )
        break
      }
      case 'role':
        add(o.status === 'removed' ? `Apagou o papel ${c(o.id)}.` : `Criou o papel ${c(o.id)} (um usuário ou grupo; por si só ele ainda não pode nada).`)
        break
      case 'schema':
        add(o.status === 'removed' ? `Apagou o schema ${c(o.id)} e tudo o que havia nele.` : `Criou o schema ${c(o.id)}: uma "pasta" para organizar objetos. Para usar um objeto dele, escreva \`${o.id}.nome\`.`)
        break
      case 'grant': {
        const key = `${o.status}|${o.grant.object}|${o.grant.grantee}`
        const g = grants.get(key) ?? { to: o.grant.grantee, object: o.grant.object, privileges: [], status: o.status }
        g.privileges.push(o.grant.privilege)
        grants.set(key, g)
        break
      }
    }
  }
  for (const g of grants.values()) {
    add(`${g.status === 'removed' ? 'Retirou' : 'Concedeu'} ${g.privileges.map(c).join(', ')} sobre ${c(g.object)} ${g.status === 'removed' ? 'do' : 'ao'} papel ${c(g.to)}.`)
  }
  return items
}

function structureItems(t: TableChange): ImpactItem[] {
  const items: ImpactItem[] = []
  const add = (text: string) => items.push({ kind: 'structure', text })

  if (t.status === 'added') {
    add(`Criou a tabela ${c(t.name)} com ${s(t.table.columns.length, 'coluna', 'colunas')}.`)
    // PK/FK/UNIQUE de uma tabela nova são parte da criação: detalha só o que é regra.
    for (const k of t.addedConstraints) add(describeConstraint(t.name, k))
    return items
  }
  if (t.status === 'removed') {
    add(`Apagou a tabela ${c(t.name)} e todos os dados dela.`)
    return items
  }

  for (const col of t.addedColumns) {
    const m = t.table.columns.find((x) => x.name === col)!
    add(`Acrescentou a coluna ${c(`${t.name}.${col}`)} (${m.type}${m.nullable ? '' : ', obrigatória'}).`)
  }
  for (const col of t.removedColumns) add(`Apagou a coluna ${c(`${t.name}.${col.name}`)} e os dados dela.`)

  for (const ch of t.changedColumns) {
    const ref = c(`${t.name}.${ch.name}`)
    for (const a of ch.aspects) {
      switch (a) {
        case 'type':
          add(`Mudou o tipo de ${ref}: ${ch.before.type} → ${ch.after.type}.`)
          break
        case 'nullable':
          add(ch.after.nullable ? `${ref} agora aceita valores vazios (NULL).` : `${ref} agora é obrigatória (NOT NULL).`)
          break
        case 'default':
          add(ch.after.default === null ? `${ref} perdeu o valor padrão.` : `${ref} ganhou o valor padrão ${c(ch.after.default)}.`)
          break
        case 'auto':
          add(
            ch.after.identity || ch.after.serial
              ? `${ref} agora gera o próprio valor automaticamente.`
              : `${ref} deixou de gerar valores automaticamente.`,
          )
          break
        // PK/UNIQUE/FK aparecem pelas constraints abaixo, com a explicação completa.
      }
    }
  }
  for (const k of t.addedConstraints) add(describeConstraint(t.name, k))
  for (const k of t.removedConstraints) add(`Removeu a regra ${c(k.definition)} de ${c(t.name)}.`)
  for (const i of t.addedIndexes.filter((i) => !i.primary && !t.addedConstraints.some((k) => k.kind === 'unique' && i.unique))) {
    add(describeIndex(t.name, i))
  }
  for (const i of t.removedIndexes.filter((i) => !i.primary && !i.unique)) add(`Apagou o índice ${c(i.name)}.`)
  return items
}

/** Resumo, em português, do que a última execução fez no banco. */
export function summarizeImpact({ schema, data, outcome }: Change): ImpactItem[] {
  if (!outcome.ok) {
    return [
      {
        kind: 'error',
        text: 'O comando deu **erro**. Quando um script falha, o Postgres desfaz o script inteiro: **nada mudou** no banco.',
      },
    ]
  }

  const items: ImpactItem[] = []
  for (const t of schema.tables) items.push(...structureItems(t))
  items.push(...objectItems(schema.objects))

  for (const d of Object.values(data)) {
    const tableIsNew = schema.tables.some((t) => t.name === d.table && t.status === 'added')
    const tableGone = schema.tables.some((t) => t.name === d.table && t.status === 'removed')
    if (tableGone) continue
    if (!d.comparable) {
      const delta = d.countAfter - d.countBefore
      if (delta !== 0) {
        items.push({
          kind: 'data',
          text: `${c(d.table)} ${delta > 0 ? 'ganhou' : 'perdeu'} ${s(Math.abs(delta), 'linha', 'linhas')} (agora ${d.countAfter}).`,
        })
      }
      continue
    }
    if (d.added.length) {
      items.push({ kind: 'data', text: `Inseriu ${s(d.added.length, 'linha', 'linhas')} em ${c(d.table)}${tableIsNew ? '' : ` (total: ${d.countAfter})`}.` })
    }
    if (d.changed.length) {
      const cols = [...new Set(d.changed.flatMap((x) => x.changedColumns))]
      items.push({
        kind: 'data',
        text: `Alterou ${s(d.changed.length, 'linha', 'linhas')} de ${c(d.table)} (coluna${cols.length > 1 ? 's' : ''} ${cols.map(c).join(', ')}).`,
      })
    }
    if (d.removed.length) {
      items.push({ kind: 'data', text: `Removeu ${s(d.removed.length, 'linha', 'linhas')} de ${c(d.table)} (total: ${d.countAfter}).` })
    }
  }

  const queries = outcome.results.filter((r) => r.command === 'SELECT')
  for (const r of queries) {
    items.push({ kind: 'query', text: `A consulta devolveu ${s(r.rowCount, 'linha', 'linhas')}. Consultar **não altera** nada no banco.` })
  }

  if (items.length === 0) items.push({ kind: 'info', text: 'Nada mudou no banco.' })
  return items
}

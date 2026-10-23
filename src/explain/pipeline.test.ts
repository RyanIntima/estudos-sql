import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createEngine, type Engine } from '../db/engine'
import { replaySolutions } from '../lessons/checkpoint'
import { stepRefs, stepsBefore } from '../lessons/registry'
import { buildPipeline, runPipeline } from './pipeline'

let engine: Engine
beforeAll(async () => {
  engine = await createEngine()
  // O banco do aluno ao fim do módulo 7 (antes das transações mexerem em pedidos e estoque):
  // 4 clientes, 5 pedidos, 8 produtos, 5 categorias. Fixar o ponto evita que aulas novas desatualizem as contagens.
  const m08 = stepRefs.find((r) => r.step.id === 'm08-l1-s1')!.globalIndex
  await replaySolutions(engine, stepsBefore(m08))
})
afterAll(() => engine.close())

async function stagesOf(sql: string) {
  const p = await buildPipeline(sql)
  if (!p.ok) throw new Error(p.reason)
  const results = await runPipeline(engine, p.stages)
  return Object.fromEntries(p.stages.map((s, i) => [s.id, results[i]])) as Record<string, (typeof results)[number]>
}

describe('buildPipeline / runPipeline', () => {
  it('JOIN + WHERE + GROUP BY + HAVING + ORDER BY + LIMIT: linhas em cada etapa', async () => {
    const sql = `SELECT c.nome, count(*) AS n
      FROM clientes c JOIN pedidos p ON p.cliente_id = c.id
      WHERE p.status <> 'cancelado'
      GROUP BY c.nome
      HAVING count(*) >= 1
      ORDER BY c.nome
      LIMIT 2;`
    const p = await buildPipeline(sql)
    if (!p.ok) throw new Error(p.reason)
    // A ordem é a de EXECUÇÃO, não a que o aluno escreveu.
    expect(p.stages.map((s) => s.id)).toEqual(['from', 'where', 'group', 'having', 'select', 'order', 'limit'])
    expect(p.stages[0].title).toBe('FROM + JOIN')

    const r = await stagesOf(sql)
    expect(Object.values(r).map((x) => [x.id, x.count])).toEqual([
      ['from', 5], // 5 pedidos, cada um com o seu cliente
      ['where', 4], // sem o cancelado
      ['group', 3], // Ana, Bruno e Carla
      ['having', 3],
      ['select', 3],
      ['order', 3],
      ['limit', 2],
    ])
    expect(Object.values(r).every((x) => !x.error)).toBe(true)
  })

  it('o trecho de cada etapa aponta para o texto certo no editor', async () => {
    const sql = "SELECT nome FROM produtos WHERE preco > 50 ORDER BY nome LIMIT 3;"
    const p = await buildPipeline(sql)
    if (!p.ok) throw new Error(p.reason)
    expect(p.stages.map((s) => sql.slice(s.from, s.to))).toEqual(['FROM produtos', 'WHERE preco > 50', 'SELECT nome', 'ORDER BY nome', 'LIMIT 3'])
  })

  it('agregação sem GROUP BY vira um único grupo', async () => {
    const r = await stagesOf('SELECT count(*) AS n FROM produtos WHERE preco > 50')
    expect([r.from.count, r.where.count, r.group.count, r.select.count]).toEqual([8, 5, 1, 1])
  })

  it('DISTINCT mostra quantas linhas repetidas saíram', async () => {
    const r = await stagesOf('SELECT DISTINCT status FROM pedidos ORDER BY status')
    expect([r.from.count, r.select.count, r.distinct.count, r.order.count]).toEqual([5, 5, 4, 4])
  })

  it('CTE: o WITH acompanha cada consulta de contagem', async () => {
    const r = await stagesOf('WITH t AS (SELECT * FROM produtos) SELECT nome FROM t WHERE preco > 100')
    expect([r.from.count, r.where.count, r.select.count]).toEqual([8, 2, 2])
  })

  it('amostras: linhas da etapa (JOIN com colunas de mesmo nome) e grupos com a contagem', async () => {
    const r = await stagesOf('SELECT c.nome FROM clientes c JOIN pedidos p ON p.cliente_id = c.id GROUP BY c.nome')
    expect(r.from.sample?.rows).toHaveLength(5)
    // `SELECT *` de um JOIN repete `id`: as colunas continuam todas lá.
    expect(r.from.sample!.columns.filter((c) => c === 'id')).toHaveLength(2)
    expect(r.group.sample!.columns).toEqual(['nome', 'linhas'])
    expect(Math.max(...r.group.sample!.rows.map((row) => Number(row[1])))).toBe(2)
  })

  it('o texto do aluno não vira consulta se não for um SELECT com FROM', async () => {
    const reasons = await Promise.all(
      ['SELEC 1', 'UPDATE produtos SET preco = 1', 'SELECT 1', 'SELECT 1 FROM produtos UNION SELECT 2 FROM produtos', "VALUES (1)"].map(async (sql) => {
        const p = await buildPipeline(sql)
        return p.ok ? 'ok' : p.reason
      }),
    )
    expect(reasons.every((x) => x !== 'ok')).toBe(true)
  })

  it('com vários comandos, usa o último SELECT e nunca altera dados', async () => {
    const before = await engine.query<{ n: number }>('SELECT count(*)::int AS n FROM produtos')
    const r = await stagesOf("UPDATE produtos SET preco = 1; SELECT nome FROM produtos WHERE preco > 50")
    expect(r.where.count).toBe(5) // o UPDATE não foi executado: só o SELECT virou etapas
    const after = await engine.query<{ n: number }>('SELECT count(*)::int AS n FROM produtos')
    expect(after).toEqual(before)
  })

  it('rede de segurança: uma função que grava dados é recusada, não executada a cada tecla', async () => {
    await engine.run("CREATE FUNCTION zerar_estoque() RETURNS int LANGUAGE sql AS 'UPDATE produtos SET estoque = 0 RETURNING 1'")
    const total = () => engine.query<{ n: number }>('SELECT sum(estoque)::int AS n FROM produtos')
    const before = await total()
    const p = await buildPipeline('SELECT zerar_estoque() FROM produtos')
    if (!p.ok) throw new Error(p.reason)
    const results = await runPipeline(engine, p.stages)
    expect(results.some((r) => r.error?.includes('read-only'))).toBe(true)
    expect(await total()).toEqual(before) // nada foi alterado
    // e a sessão continua utilizável depois do erro
    expect((await engine.query('SELECT 1 AS ok'))[0]).toEqual({ ok: 1 })
    await engine.run('DROP FUNCTION zerar_estoque()')
  })
})

describe('etapa de funções de janela', () => {
  it('aparece entre HAVING/GROUP e SELECT e não muda o número de linhas', async () => {
    const sql = 'SELECT nome, row_number() OVER (ORDER BY preco DESC) AS pos FROM produtos WHERE preco > 50'
    const p = await buildPipeline(sql)
    if (!p.ok) throw new Error(p.reason)
    expect(p.stages.map((s) => s.id)).toEqual(['from', 'where', 'window', 'select'])
    const r = await stagesOf(sql)
    expect([r.where.count, r.window.count, r.select.count]).toEqual([5, 5, 5])
  })
})

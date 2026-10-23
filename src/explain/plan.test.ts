import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createEngine, type Engine } from '../db/engine'
import { allNodes, explainPlan, parsePlanJson, planNotes, planTarget } from './plan'

let engine: Engine
beforeAll(async () => {
  engine = await createEngine()
  await engine.run(`
    CREATE TABLE visitas (id INT, sessao INT, texto TEXT);
    INSERT INTO visitas SELECT g, g % 5000, 'x' FROM generate_series(1, 30000) g;
    ANALYZE visitas;`)
})
afterAll(() => engine.close())

describe('planTarget', () => {
  it('pega o último SELECT, ou o SELECT dentro de um EXPLAIN', async () => {
    expect(await planTarget("UPDATE t SET a = 1; SELECT * FROM visitas WHERE sessao = 1;")).toEqual({ ok: true, sql: 'SELECT * FROM visitas WHERE sessao = 1' })
    expect(await planTarget('EXPLAIN ANALYZE SELECT 1 FROM visitas;')).toEqual({ ok: true, sql: 'SELECT 1 FROM visitas' })
    expect((await planTarget('UPDATE t SET a = 1')).ok).toBe(false)
    expect((await planTarget('SELEC 1')).ok).toBe(false)
  })
})

describe('explainPlan', () => {
  const q = 'SELECT * FROM visitas WHERE sessao = 1234'

  it('sem índice: leitura sequencial, com aviso didático', async () => {
    const out = await explainPlan(engine, q)
    if (!out.ok) throw new Error(out.reason)
    expect(out.plan.root.type).toBe('Seq Scan')
    expect(out.plan.root.relation).toBe('visitas')
    expect(out.plan.root.removedByFilter).toBeGreaterThan(20000)
    expect(out.plan.root.actualRows).toBe(6)
    expect(out.plan.executionMs).toBeGreaterThan(0)
    const notes = planNotes(out.plan).join('\n')
    expect(notes).toContain('Leitura **sequencial** de `visitas`')
    expect(notes).toContain('índice')
  })

  it('com índice: o plano usa o índice e o aviso vira confirmação', async () => {
    await engine.run('CREATE INDEX idx_visitas_sessao ON visitas (sessao)')
    const out = await explainPlan(engine, q)
    if (!out.ok) throw new Error(out.reason)
    const types = allNodes(out.plan.root).map((n) => n.type)
    expect(types.some((t) => /Index/.test(t))).toBe(true)
    expect(types).not.toContain('Seq Scan')
    const notes = planNotes(out.plan).join('\n')
    expect(notes).toContain('Usou o índice `idx_visitas_sessao`')
    expect(notes).not.toContain('sequencial')
  })

  it('árvore: nó de cima com filhos, tempo próprio menor ou igual ao total', async () => {
    const out = await explainPlan(engine, 'SELECT sessao, count(*) FROM visitas GROUP BY sessao ORDER BY sessao LIMIT 3')
    if (!out.ok) throw new Error(out.reason)
    expect(out.plan.root.children.length).toBeGreaterThan(0)
    for (const n of allNodes(out.plan.root)) expect(n.selfTime ?? 0).toBeLessThanOrEqual((n.time ?? 0) + 1e-6)
  })

  it('JSON do Postgres: estrutura mínima', () => {
    const r = parsePlanJson([{ Plan: { 'Node Type': 'Limit', 'Total Cost': 5, 'Plan Rows': 2, Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 't', 'Plan Rows': 9 }] }, 'Execution Time': 1.5 }])
    expect(r.root.children[0].relation).toBe('t')
    expect(r.executionMs).toBe(1.5)
  })

  it('rede de segurança: ANALYZE de uma função que grava é recusado e não altera nada', async () => {
    await engine.run("CREATE FUNCTION zerar() RETURNS int LANGUAGE sql AS 'UPDATE visitas SET sessao = 0 RETURNING 1'")
    const before = await engine.query('SELECT count(*)::int AS n FROM visitas WHERE sessao = 0')
    const out = await explainPlan(engine, 'SELECT zerar()')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('read-only')
    expect(await engine.query('SELECT count(*)::int AS n FROM visitas WHERE sessao = 0')).toEqual(before)
    await engine.run('DROP FUNCTION zerar()')
  })
})

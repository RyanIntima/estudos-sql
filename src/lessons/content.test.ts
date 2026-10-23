import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createEngine, type Engine } from '../db/engine'
import { diffFingerprints, fingerprint } from '../db/fingerprint'
import { buildFingerprints, replaySolutions } from './checkpoint'
import { lessons, modules, stepRefs, stepsBefore } from './registry'
import { runChecks } from './validate'

let engine: Engine
beforeAll(async () => {
  engine = await createEngine()
})
afterAll(() => engine.close())

describe('estrutura do currículo', () => {
  it('ids de módulos, lições e passos são únicos', () => {
    const ids = [...modules.map((m) => m.id), ...lessons.map((l) => l.id), ...stepRefs.map((r) => r.step.id)]
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  it('toda lição tem teoria e passos; todo passo tem dicas, solução e checks', () => {
    for (const lesson of lessons) {
      expect(lesson.theory.trim().length, `${lesson.id}: teoria vazia`).toBeGreaterThan(50)
      expect(lesson.steps.length, `${lesson.id}: sem passos`).toBeGreaterThan(0)
      for (const step of lesson.steps) {
        expect(step.hints.length, `${step.id}: sem dicas`).toBeGreaterThan(0)
        expect(step.solution.trim(), `${step.id}: sem solução`).not.toBe('')
        expect(step.checks.length, `${step.id}: sem checks`).toBeGreaterThan(0)
      }
    }
  })

  it('o último passo de cada módulo é um chefão', () => {
    for (const m of modules) expect(m.lessons.at(-1)?.boss, `${m.id}: falta chefão`).toBe(true)
  })
})

describe('conteúdo executado de verdade, do início ao fim', () => {
  it('cada passo falha antes, rejeita respostas erradas e passa com a solução', async () => {
    for (const { step } of stepRefs) {
      const before = await runChecks(engine, step.checks, { sql: '', lastOutcome: null })
      expect(
        before.some((r) => !r.ok),
        `${step.id}: os checks já passam antes de qualquer resposta`,
      ).toBe(true)

      // Respostas erradas rodam em `trial`: dentro de uma transação que é desfeita, para não contaminar o passo seguinte.
      for (const wrong of step.wrong ?? []) {
        await engine.trial(wrong, async (out, session) => {
          if (!out.ok) return // um erro de SQL também rejeita a resposta; nada a inspecionar no banco
          const res = await runChecks({ ...engine, ...session }, step.checks, { sql: wrong, lastOutcome: out })
          expect(
            res.every((r) => r.ok),
            `${step.id}: uma resposta errada foi aceita:
${wrong}`,
          ).toBe(false)
        })
      }

      const out = await engine.run(step.solution)
      expect(out.ok, `${step.id}: a solução ${step.expectError ? 'devia dar erro' : 'falhou'}`).toBe(!step.expectError)
      const after = await runChecks(engine, step.checks, { sql: step.solution, lastOutcome: out })
      expect(
        after.filter((r) => !r.ok).map((r) => `${r.label}: ${r.message}`),
        `${step.id}: a solução de referência não passa nos próprios checks`,
      ).toEqual([])
    }
  })
})

describe('checkpoints', () => {
  it('sincronizar o banco do aluno reproduz exatamente o estado esperado', async () => {
    const scratch = await createEngine()
    const student = await createEngine()
    try {
      const steps = stepRefs.map((r) => r.step)
      const expected = await buildFingerprints(scratch, steps)
      expect(expected).toHaveLength(steps.length + 1)

      for (const k of new Set([0, 1, 5, Math.floor(steps.length / 2), steps.length - 1, steps.length])) {
        await student.reset()
        await replaySolutions(student, stepsBefore(k))
        expect(diffFingerprints(expected[k], await fingerprint(student)), `checkpoint ${k}`).toEqual([])
      }
    } finally {
      await scratch.close()
      await student.close()
    }
  })

  it('detecta um banco fora do esperado em linguagem clara', async () => {
    const scratch = await createEngine()
    try {
      const expected = await buildFingerprints(scratch, stepRefs.map((r) => r.step))
      await scratch.reset()
      // Antes do passo m01-l2-s2 já existe `clientes` com a coluna email.
      const k = stepRefs.findIndex((r) => r.step.id === 'm01-l2-s2')
      const diffs = diffFingerprints(expected[k], await fingerprint(scratch))
      expect(diffs.length).toBeGreaterThan(0)
      expect(diffs[0]).toContain('Falta a tabela')
    } finally {
      await scratch.close()
    }
  })
})

/** Os dados de todas as tabelas, em forma comparável. Colunas preenchidas por now() mudam a cada replay e ficam de fora. */
async function dumpData(e: Engine): Promise<Record<string, unknown>> {
  const volatile: Record<string, string[]> = {
    clientes: ['criado_em'],
    produtos: ['atualizado_em'],
    pagamentos: ['pago_em'],
    auditoria_precos: ['alterado_em'],
  }
  const tables = await e.query<{ t: string }>(`SELECT tablename::text AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)
  const out: Record<string, unknown> = {}
  for (const { t } of tables) {
    const drop = (volatile[t] ?? []).map((c) => `'${c}'`).join(', ')
    const [row] = await e.query<{ d: unknown }>(
      `SELECT coalesce(jsonb_agg(j ORDER BY j::text), '[]'::jsonb) AS d FROM (SELECT to_jsonb(x) ${drop ? `- ARRAY[${drop}]` : ''} AS j FROM "${t}" x) q`,
    )
    out[t] = row.d
  }
  return out
}

describe('sincronizar com o gabarito (reset + replay)', () => {
  it('sobre um banco "adiantado" e sujo dá exatamente os mesmos DADOS de um replay limpo, não só as mesmas contagens', async () => {
    const clean = await createEngine()
    const dirty = await createEngine()
    try {
      const all = stepRefs.map((r) => r.step)
      await replaySolutions(dirty, all) // o aluno terminou o currículo...
      for (const k of [3, 20, 34, 60, 85, all.length]) {
        await clean.reset()
        await replaySolutions(clean, stepsBefore(k))
        // ...e volta atrás: o banco sujo é reconstruído até o passo k.
        await dirty.reset()
        await replaySolutions(dirty, stepsBefore(k))
        expect(await dumpData(dirty), `dados divergem no passo ${k}`).toEqual(await dumpData(clean))
        // E, como quem enfrenta um passo em andamento, sobra de outra execução não pode vazar.
        await dirty.run('BEGIN; UPDATE produtos SET estoque = 0;')
      }
    } finally {
      await clean.close()
      await dirty.close()
    }
  })
})

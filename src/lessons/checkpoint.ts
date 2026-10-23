import type { Engine } from '../db/engine'
import { fingerprint, type Fingerprint } from '../db/fingerprint'
import { getEngine } from '../db/instances'
import { stepRefs, stepsBefore } from './registry'
import type { Step } from './types'

/** Executa as soluções de referência em ordem. É assim que o banco "esperado" é montado. */
export async function replaySolutions(engine: Engine, steps: Step[]): Promise<void> {
  for (const step of steps) {
    const out = await engine.run(step.solution)
    if (!out.ok && !step.expectError) {
      throw new Error(`A solução do passo ${step.id} falhou: ${out.error.message}`)
    }
  }
}

/**
 * Impressão digital do banco esperado ANTES de cada passo (índice i) e ao final (índice n).
 * Zera o engine recebido: use um banco de rascunho.
 */
export async function buildFingerprints(engine: Engine, steps: Step[]): Promise<Fingerprint[]> {
  await engine.reset()
  const prints: Fingerprint[] = []
  for (const step of steps) {
    prints.push(await fingerprint(engine))
    await replaySolutions(engine, [step])
  }
  prints.push(await fingerprint(engine))
  return prints
}

/** Deixa o banco do aluno exatamente como estaria ao começar o passo `globalIndex`. */
export async function syncToStep(engine: Engine, globalIndex: number): Promise<void> {
  await engine.reset()
  await replaySolutions(engine, stepsBefore(globalIndex))
}

let cached: Promise<Fingerprint[]> | null = null

/** Banco esperado no início do passo, calculado uma vez num PGlite em memória. */
export async function expectedFingerprint(globalIndex: number): Promise<Fingerprint> {
  cached ??= getEngine('scratch').then((scratch) =>
    buildFingerprints(
      scratch,
      stepRefs.map((r) => r.step),
    ),
  )
  return (await cached)[globalIndex]
}

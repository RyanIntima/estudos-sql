import { createEngine, type Engine } from './engine'

/** `scratch` vive só em memória: serve para calcular o banco esperado sem tocar no do aluno. */
export type DbName = 'lojadb' | 'playground' | 'scratch'

const cache = new Map<DbName, Promise<Engine>>()

/**
 * Um engine por banco, criado sob demanda. Guardar a Promise (e não o resultado)
 * evita abrir o mesmo IndexedDB duas vezes quando o React monta o componente em dobro (StrictMode).
 */
export function getEngine(name: DbName): Promise<Engine> {
  let engine = cache.get(name)
  if (!engine) {
    engine = createEngine(name === 'scratch' ? undefined : `idb://${name}`)
    cache.set(name, engine)
  }
  return engine
}

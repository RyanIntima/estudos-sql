import { useEffect, useState } from 'react'
import { getEngine, type DbName } from '../db/instances'
import { buildPipeline, runPipeline, type Pipeline, type StageResult } from '../explain/pipeline'

export interface PipelineState {
  pipeline: Pipeline
  results: StageResult[]
}

/**
 * Etapas de execução do SELECT do editor, com a contagem de linhas de cada uma.
 * Só roda com a aba aberta (`active`): são várias consultas de leitura por vez.
 * `version` muda quando o banco muda, para recontar.
 */
export function usePipeline(code: string, db: DbName, active: boolean, version: number) {
  const [state, setState] = useState<PipelineState | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!active) return
    let stale = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const pipeline = await buildPipeline(code)
        if (stale) return
        if (!pipeline.ok) {
          setState({ pipeline, results: [] })
          return
        }
        const results = await runPipeline(await getEngine(db), pipeline.stages)
        if (!stale) setState({ pipeline, results })
      } finally {
        if (!stale) setLoading(false)
      }
    }, 400)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [code, db, active, version])

  return { state, loading }
}

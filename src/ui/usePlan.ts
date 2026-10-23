import { useEffect, useState } from 'react'
import { getEngine, type DbName } from '../db/instances'
import { explainPlan, type PlanOutcome } from '../explain/plan'

/**
 * Plano de execução (EXPLAIN ANALYZE) do SELECT do editor. Só roda com a aba aberta e em transação somente leitura.
 * `version` muda quando o banco muda, para medir de novo (por exemplo, depois de criar um índice).
 */
export function usePlan(code: string, db: DbName, active: boolean, version: number) {
  const [outcome, setOutcome] = useState<PlanOutcome | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!active) return
    let stale = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const result = await explainPlan(await getEngine(db), code)
        if (!stale) setOutcome(result)
      } finally {
        if (!stale) setLoading(false)
      }
    }, 500)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [code, db, active, version])

  return { outcome, loading }
}

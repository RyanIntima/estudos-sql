import { useCallback, useEffect, useState } from 'react'
import { diffData, snapshotData } from '../db/dataDiff'
import type { RunOutcome } from '../db/engine'
import type { Change } from '../db/impact'
import { getEngine, type DbName } from '../db/instances'
import { EMPTY_SCHEMA, introspect, type SchemaModel } from '../db/introspect'
import { diffSchemas } from '../db/schemaDiff'

export interface Workbench {
  db: DbName
  ready: boolean
  running: boolean
  schema: SchemaModel
  /** Resultado da última execução. */
  outcome: RunOutcome | null
  /** O que a última execução mudou (estrutura e linhas). */
  change: Change | null
  /** Muda a cada execução, para as telas relerem as linhas. */
  dataVersion: number
  run: (code: string) => Promise<RunOutcome>
  /** Relê o banco (após sincronizar/desfazer) e esquece o resultado e o destaque da execução anterior. */
  reload: () => Promise<void>
}

/**
 * Executa SQL no banco do aluno e compara o "antes" com o "depois":
 * é daí que saem os destaques do diagrama, das linhas e o resumo de impacto.
 */
export function useWorkbench(db: DbName): Workbench {
  const [ready, setReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [schema, setSchema] = useState<SchemaModel>(EMPTY_SCHEMA)
  const [outcome, setOutcome] = useState<RunOutcome | null>(null)
  const [change, setChange] = useState<Change | null>(null)
  const [dataVersion, setDataVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    getEngine(db)
      .then((engine) => introspect(engine))
      .then((s) => {
        if (!cancelled) {
          setSchema(s)
          setReady(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [db])

  const run = useCallback(
    async (code: string) => {
      setRunning(true)
      try {
        const engine = await getEngine(db)
        const before = await introspect(engine)
        const dataBefore = await snapshotData(engine, before)
        const out = await engine.run(code)
        // Relido mesmo após erro: scripts com BEGIN/COMMIT podem ter aplicado uma parte.
        const after = await introspect(engine)
        const dataAfter = await snapshotData(engine, after)
        setOutcome(out)
        setChange({ schema: diffSchemas(before, after), data: diffData(dataBefore, dataAfter), outcome: out })
        setSchema(after)
        setDataVersion((v) => v + 1)
        return out
      } finally {
        setRunning(false)
      }
    },
    [db],
  )

  const reload = useCallback(async () => {
    const engine = await getEngine(db)
    setOutcome(null)
    setChange(null)
    setSchema(await introspect(engine))
    setDataVersion((v) => v + 1)
  }, [db])

  return { db, ready, running, schema, outcome, change, dataVersion, run, reload }
}

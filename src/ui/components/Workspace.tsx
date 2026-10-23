import { useState, type ReactNode } from 'react'
import { summarizeImpact } from '../../db/impact'
import type { Workbench } from '../useWorkbench'
import { useExplainLink, useExplanation } from '../useExplanation'
import { usePipeline } from '../usePipeline'
import { usePlan } from '../usePlan'
import { DataBrowser } from './DataBrowser'
import { ErDiagram } from './ErDiagram'
import { ExecutionPanel } from './ExecutionPanel'
import { ExplainPanel } from './ExplainPanel'
import { ImpactPanel } from './ImpactPanel'
import { PlanPanel } from './PlanPanel'
import { ResultGrid } from './ResultGrid'
import { SqlEditor, type Range } from './SqlEditor'

interface Props {
  code: string
  onCodeChange: (code: string) => void
  onRun: () => void
  wb: Workbench
  /** Acima da barra de ferramentas (ex.: o enunciado do passo). */
  header?: ReactNode
  /** Botões ao lado de "Executar". */
  toolbar?: ReactNode
  /** A tela está fazendo outra operação no banco (verificar, sincronizar, desfazer): não deixa executar por cima. */
  busy?: boolean
}

const tabClass = (active: boolean) =>
  `rounded px-3 py-1 text-sm ${active ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`

/**
 * O ambiente de trabalho: editor, resultado/explicação embaixo e, ao lado, o banco em diagrama, dados e impacto.
 * Compartilhado pelo Playground e pelas aulas.
 */
export function Workspace({ code, onCodeChange, onRun, wb, header, toolbar, busy = false }: Props) {
  const [bottom, setBottom] = useState<'result' | 'explain'>('result')
  const [side, setSide] = useState<'er' | 'dados' | 'impacto' | 'exec' | 'plano'>('er')
  /** Trecho que a etapa de execução sob o mouse ocupa no código. */
  const [execHover, setExecHover] = useState<Range | null>(null)

  const explanation = useExplanation(code)
  const link = useExplainLink(explanation)
  const pipeline = usePipeline(code, wb.db, side === 'exec', wb.dataVersion)
  const plan = usePlan(code, wb.db, side === 'plano', wb.dataVersion)

  const error = wb.outcome && !wb.outcome.ok ? wb.outcome.error.position : undefined
  const impactCount = wb.change ? summarizeImpact(wb.change).length : 0

  const blocked = !wb.ready || wb.running || busy
  const run = () => {
    // Ctrl+Enter chega aqui também: o bloqueio vale para o atalho, não só para o botão.
    if (blocked) return
    setBottom('result')
    onRun()
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
      <section className="flex min-h-0 flex-col border-r border-slate-800">
        {header}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-1.5 text-sm">
          <button
            onClick={run}
            disabled={blocked}
            className="rounded bg-sky-600 px-3 py-1 font-medium hover:bg-sky-500 disabled:opacity-50"
          >
            ▶ Executar
          </button>
          {toolbar}
        </div>

        <div className="min-h-[120px] flex-1">
          <SqlEditor
            value={code}
            onChange={onCodeChange}
            onRun={run}
            schema={wb.schema}
            highlight={execHover ?? link.highlight}
            errorAt={error ?? null}
            errorToken={wb.outcome}
            onHoverPos={link.hoverPos}
          />
        </div>

        {/* A explicação precisa de mais espaço que o resultado: é onde o aluno lê. */}
        <div className={`flex shrink-0 flex-col border-t border-slate-800 ${bottom === 'explain' ? 'h-[48%]' : 'h-[30%]'}`}>
          <div className="flex shrink-0 gap-1 border-b border-slate-800 px-2 py-1">
            <button onClick={() => setBottom('result')} className={tabClass(bottom === 'result')}>
              Resultado
            </button>
            <button onClick={() => setBottom('explain')} className={tabClass(bottom === 'explain')}>
              Explicação do código
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {bottom === 'result' ? (
              <ResultGrid outcome={wb.outcome} sql={code} />
            ) : (
              <ExplainPanel
                explanation={explanation}
                code={code}
                activeId={link.activeId}
                scrollToActive={link.fromEditor}
                onHoverItem={link.hoverItem}
              />
            )}
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-col">
        <div className="flex shrink-0 gap-1 border-b border-slate-800 p-2">
          <button onClick={() => setSide('er')} className={tabClass(side === 'er')}>
            Diagrama
          </button>
          <button onClick={() => setSide('dados')} className={tabClass(side === 'dados')}>
            Dados
          </button>
          <button onClick={() => setSide('exec')} className={tabClass(side === 'exec')}>
            Execução
          </button>
          <button onClick={() => setSide('plano')} className={tabClass(side === 'plano')}>
            Plano
          </button>
          <button onClick={() => setSide('impacto')} className={tabClass(side === 'impacto')}>
            Impacto{impactCount > 0 && <span className="ml-1 rounded-full bg-sky-700 px-1.5 text-[10px]">{impactCount}</span>}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {!wb.ready ? (
            <p className="p-6 text-sm text-slate-400">Carregando PostgreSQL…</p>
          ) : side === 'er' ? (
            <ErDiagram schema={wb.schema} diff={wb.change?.schema} />
          ) : side === 'dados' ? (
            <DataBrowser db={wb.db} schema={wb.schema} version={wb.dataVersion} diff={wb.change?.data} />
          ) : side === 'exec' ? (
            <ExecutionPanel state={pipeline.state} loading={pipeline.loading} onHover={setExecHover} />
          ) : side === 'plano' ? (
            <PlanPanel outcome={plan.outcome} loading={plan.loading} />
          ) : (
            <ImpactPanel change={wb.change} />
          )}
        </div>
      </section>
    </div>
  )
}

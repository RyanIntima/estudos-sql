import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { diffFingerprints, fingerprint } from '../../db/fingerprint'
import { getEngine } from '../../db/instances'
import { achievementById } from '../../game/achievements'
import { useProgress } from '../../game/store'
import { useToasts } from '../../game/toasts'
import { HINT_COST, STEP_BASE_XP } from '../../game/xp'
import { expectedFingerprint, syncToStep } from '../../lessons/checkpoint'
import { firstStepIndex, nextLesson, stepRefs } from '../../lessons/registry'
import type { Lesson } from '../../lessons/types'
import { runChecks, type CheckResult } from '../../lessons/validate'
import { useWorkbench } from '../useWorkbench'
import { Markdown } from './Markdown'
import { Workspace } from './Workspace'

const DEFAULT_STARTER = '-- Escreva seu SQL aqui. Ctrl+Enter executa.\n'

interface Props {
  lesson: Lesson
  onBackToTheory: () => void
}

export function PracticeView({ lesson, onBackToTheory }: Props) {
  const stepsDone = useProgress((s) => s.steps)
  const hintsShown = useProgress((s) => s.hints)
  const solutionShown = useProgress((s) => s.solutionShown)
  const wb = useWorkbench('lojadb')

  const [idx, setIdx] = useState(() => {
    const open = lesson.steps.findIndex((s) => !useProgress.getState().steps[s.id])
    return open === -1 ? 0 : open
  })
  const step = lesson.steps[idx]
  const globalIndex = stepRefs.find((r) => r.step.id === step.id)!.globalIndex

  const [codes, setCodes] = useState<Record<string, string>>({})
  const code = codes[step.id] ?? step.starter ?? DEFAULT_STARTER

  const [results, setResults] = useState<CheckResult[] | null>(null)
  const [gain, setGain] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [drift, setDrift] = useState<string[] | null>(null)
  const [summary, setSummary] = useState<{ stars: number } | null>(null)
  /** SQL executado com sucesso neste passo: alimenta os checks sqlMatches e o "Desfazer". */
  const runs = useRef<string[]>([])
  const [runCount, setRunCount] = useState(0)
  const setRuns = (next: string[]) => {
    runs.current = next
    setRunCount(next.length)
  }

  const stepDone = !!stepsDone[step.id]
  const hintCount = hintsShown[step.id] ?? 0
  const showingSolution = !!solutionShown[step.id]
  const openStep = lesson.steps.findIndex((s) => !stepsDone[s.id])

  // Se a lição ainda não começou, confere se o banco está como ela espera.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const fresh = lesson.steps.every((st) => !useProgress.getState().steps[st.id])
      if (!fresh) return
      const engine = await getEngine('lojadb')
      const [expected, actual] = await Promise.all([expectedFingerprint(firstStepIndex(lesson)), fingerprint(engine)])
      const d = diffFingerprints(expected, actual)
      if (!cancelled && d.length) setDrift(d)
    })()
    return () => {
      cancelled = true
    }
  }, [lesson])

  // Cada passo começa limpo: o reset acontece no evento de troca, não num efeito.
  const goToStep = (i: number) => {
    setRuns([])
    setResults(null)
    setGain(null)
    setIdx(i)
    void wb.reload()
  }

  const run = async () => {
    const out = await wb.run(code)
    if (out.ok) setRuns([...runs.current, code])
  }

  const verify = async () => {
    setBusy(true)
    try {
      const engine = await getEngine('lojadb')
      const progress = useProgress.getState()
      progress.recordAttempt(step.id)
      const res = await runChecks(engine, step.checks, { sql: runs.current.join('\n'), lastOutcome: wb.outcome })
      setResults(res)
      if (res.every((r) => r.ok)) {
        const done = progress.completeStep({
          stepId: step.id,
          baseXp: step.xp ?? STEP_BASE_XP,
          lessonId: lesson.id,
          lessonStepIds: lesson.steps.map((s) => s.id),
        })
        setGain(done.xpGained)
        if (done.lessonJustCompleted) setSummary({ stars: done.stars })
        const toast = useToasts.getState().push
        if (done.xpGained) toast({ kind: 'xp', title: `+${done.xpGained} XP`, text: step.title })
        if (done.levelUp) toast({ kind: 'level', title: `Nível ${done.levelUp}!`, text: 'Você subiu de nível.' })
        for (const id of done.newAchievements) {
          const a = achievementById(id)
          if (a) toast({ kind: 'achievement', title: `Conquista: ${a.title}`, text: a.description })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  /** Reconstrói o banco como estaria ao começar o passo `target`, replayando as soluções de referência. */
  const syncTo = async (target: number, message: string) => {
    if (!window.confirm(message)) return
    setBusy(true)
    try {
      await syncToStep(await getEngine('lojadb'), target)
      setRuns([])
      setResults(null)
      setDrift(null)
      await wb.reload()
    } finally {
      setBusy(false)
    }
  }

  /** Desfaz a última execução: volta ao início do passo e repete as anteriores (o SQL é seu, então o resultado é o mesmo). */
  const undo = async () => {
    if (!runs.current.length) return
    if (!window.confirm('Desfazer a última execução? O banco volta ao início do passo e repete as suas execuções anteriores.')) return
    setBusy(true)
    try {
      const keep = runs.current.slice(0, -1)
      const engine = await getEngine('lojadb')
      await syncToStep(engine, globalIndex)
      for (const sql of keep) await engine.run(sql)
      setRuns(keep)
      setResults(null)
      await wb.reload()
    } finally {
      setBusy(false)
    }
  }

  const revealSolution = () => {
    if (!window.confirm('Ver a solução? O passo vai render só 10 XP e você perde as estrelas desta aula.')) return
    useProgress.getState().revealSolution(step.id)
  }

  const allOk = results?.every((r) => r.ok) ?? false
  const next = nextLesson(lesson.id)
  const locked = !wb.ready || busy || wb.running

  const header = (
    <div className="max-h-[46%] shrink-0 overflow-auto border-b border-slate-800 p-4 text-sm">
      <p className="text-xs uppercase tracking-wide text-sky-400">
        Passo {idx + 1}/{lesson.steps.length}
        {lesson.boss && ' · Chefão'}
      </p>
      <h2 className="mb-1 text-base font-semibold">{step.title}</h2>
      <Markdown>{step.goal}</Markdown>
      {step.context && (
        <div className="mt-2 text-xs text-slate-400">
          💡 <Markdown className="inline">{step.context}</Markdown>
        </div>
      )}

      {hintCount > 0 && (
        <ol className="mt-3 space-y-1 text-xs text-amber-200">
          {step.hints.slice(0, hintCount).map((h, i) => (
            <li key={i}>
              <b>Dica {i + 1}:</b> <Markdown className="inline">{h}</Markdown>
            </li>
          ))}
        </ol>
      )}

      {showingSolution && (
        <div className="mt-3 rounded border border-slate-700 bg-slate-900 p-2">
          <p className="mb-1 text-xs text-slate-400">Solução de referência:</p>
          <pre className="whitespace-pre-wrap text-xs text-emerald-300">{step.solution}</pre>
          <button onClick={() => setCodes((c) => ({ ...c, [step.id]: step.solution }))} className="mt-1 text-xs underline">
            Colocar no editor
          </button>
        </div>
      )}

      {results && (
        <ul className="mt-3 space-y-1">
          {results.map((r, i) => (
            <li key={i} className={`text-xs ${r.ok ? 'text-emerald-400' : 'text-red-300'}`}>
              {r.ok ? '✔' : '✘'} {r.label}
              {!r.ok && r.message && <span className="block pl-4 text-slate-400">{r.message}</span>}
            </li>
          ))}
        </ul>
      )}

      {allOk && (
        <div className="mt-3 rounded border border-emerald-700 bg-emerald-950/50 p-2 text-emerald-200">
          🎉 Passo concluído{gain ? ` · +${gain} XP` : ' (revisão: sem XP novo)'}
          {idx < lesson.steps.length - 1 && (
            <button onClick={() => goToStep(idx + 1)} className="ml-3 rounded bg-emerald-600 px-2 py-0.5 text-white hover:bg-emerald-500">
              Próximo passo →
            </button>
          )}
        </div>
      )}
    </div>
  )

  const ghost = 'rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-40'
  const toolbar = (
    <>
      <button onClick={verify} disabled={locked} className="rounded bg-emerald-600 px-3 py-1 font-medium hover:bg-emerald-500 disabled:opacity-50">
        ✔ Verificar
      </button>
      <span className="mx-1 h-4 w-px bg-slate-700" />
      <button onClick={() => useProgress.getState().revealHint(step.id, step.hints.length)} disabled={stepDone || hintCount >= step.hints.length} className={ghost}>
        💡 Dica ({hintCount}/{step.hints.length}) −{HINT_COST} XP
      </button>
      <button onClick={revealSolution} disabled={stepDone || showingSolution} className={ghost}>
        Ver solução
      </button>
      <span className="ml-auto flex gap-2">
        <button onClick={undo} disabled={locked || runCount === 0} className={ghost} title="Desfaz a última execução bem-sucedida deste passo">
          ↶ Desfazer
        </button>
        <button
          onClick={() => syncTo(globalIndex, 'Voltar o banco ao estado de início deste passo? Tudo o que você executou nele será desfeito.')}
          disabled={locked}
          className={ghost}
        >
          ↺ Reiniciar passo
        </button>
      </span>
    </>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-800 px-4 py-1.5 text-sm">
        <button onClick={onBackToTheory} className="text-slate-400 hover:text-white">
          ← Teoria
        </button>
        <span className="font-semibold">{lesson.title}</span>
        <div className="ml-auto flex items-center gap-1">
          {lesson.steps.map((s, i) => (
            <button
              key={s.id}
              disabled={i > (openStep === -1 ? lesson.steps.length : openStep)}
              onClick={() => goToStep(i)}
              title={s.title}
              className={`h-6 w-6 rounded-full text-xs ${i === idx ? 'ring-2 ring-sky-400' : ''} ${stepsDone[s.id] ? 'bg-emerald-600' : 'bg-slate-700'} disabled:opacity-40`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {drift && (
        <div className="shrink-0 border-b border-amber-700 bg-amber-950/60 px-4 py-2 text-sm text-amber-200">
          <p className="font-semibold">Seu banco não está como esta aula espera:</p>
          <ul className="ml-5 list-disc text-xs">
            {drift.slice(0, 5).map((d, i) => (
              <li key={i}>
                <Markdown className="inline">{d}</Markdown>
              </li>
            ))}
            {drift.length > 5 && <li>…e mais {drift.length - 5}.</li>}
          </ul>
          <div className="mt-1 flex gap-3 text-xs">
            <button
              onClick={() => syncTo(firstStepIndex(lesson), 'Reconstruir o LojaDB com as soluções de referência até aqui? O que está no banco agora será substituído.')}
              className="rounded bg-amber-600 px-2 py-1 font-medium text-black hover:bg-amber-500"
            >
              Sincronizar com o gabarito
            </button>
            <button onClick={() => setDrift(null)} className="underline">
              Continuar assim mesmo
            </button>
          </div>
        </div>
      )}

      <Workspace code={code} onCodeChange={(v) => setCodes((c) => ({ ...c, [step.id]: v }))} onRun={run} wb={wb} header={header} toolbar={toolbar} busy={busy} />

      {summary && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-6 text-center">
            <p className="text-4xl">{lesson.boss ? '👹💥' : '🏁'}</p>
            <h2 className="mt-2 text-xl font-bold">{lesson.boss ? 'Chefão derrotado!' : 'Aula concluída!'}</h2>
            <p className="mt-1 text-2xl text-amber-300">
              {'★'.repeat(summary.stars)}
              {'☆'.repeat(3 - summary.stars)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {summary.stars === 3 ? 'Sem ajuda: nota máxima.' : summary.stars === 2 ? 'Com dicas. Dá para chegar às 3 estrelas na revisão.' : 'Você viu a solução. Refaça para ganhar mais estrelas.'}
            </p>
            <div className="mt-5 flex justify-center gap-2 text-sm">
              <Link to="/" className="rounded border border-slate-600 px-3 py-1.5 hover:bg-slate-800">
                Voltar ao mapa
              </Link>
              {next && (
                <Link to={`/aula/${next.id}`} className="rounded bg-emerald-600 px-3 py-1.5 font-medium hover:bg-emerald-500">
                  Próxima aula →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

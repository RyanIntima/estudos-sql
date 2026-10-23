import { Link } from 'react-router-dom'
import { useProgress } from '../../game/store'
import { isLessonUnlocked, modules } from '../../lessons/registry'
import { getEngine } from '../../db/instances'

export function MapPage() {
  const completed = useProgress((s) => s.lessons)
  const stepsDone = useProgress((s) => s.steps)
  const resetProgress = useProgress((s) => s.resetProgress)

  const resetAll = async () => {
    if (!window.confirm('Apagar TODO o progresso e o banco LojaDB? Isso não pode ser desfeito.')) return
    resetProgress()
    await (await getEngine('lojadb')).reset()
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <div>
          <h1 className="text-2xl font-bold">Mapa de fases</h1>
          <p className="mt-1 text-sm text-slate-400">
            Cada aula tem teoria curta e prática imediata. Tudo o que você escreve constrói o mesmo banco: o <b>LojaDB</b>.
          </p>
        </div>

        {modules.map((m, mi) => {
          const done = m.lessons.filter((l) => l.id in completed).length
          return (
            <section key={m.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl">{m.emoji}</span>
                <div>
                  <h2 className="font-semibold">
                    Módulo {mi} · {m.title}
                  </h2>
                  <p className="text-xs text-slate-400">{m.subtitle}</p>
                </div>
                <span className="ml-auto text-xs text-slate-400">
                  {done}/{m.lessons.length}
                </span>
              </div>

              <ol className="mt-3 space-y-1.5">
                {m.lessons.map((l) => {
                  const unlocked = isLessonUnlocked(l.id, completed)
                  const result = completed[l.id]
                  const started = l.steps.some((s) => stepsDone[s.id])
                  const body = (
                    <>
                      <span className="w-6 text-center">{result ? '✅' : !unlocked ? '🔒' : l.boss ? '👹' : started ? '▶️' : '○'}</span>
                      <span className="flex-1">
                        {l.title}
                        <span className="block text-xs text-slate-400">{l.summary}</span>
                      </span>
                      {result && <span className="text-amber-300">{'★'.repeat(result.stars)}{'☆'.repeat(3 - result.stars)}</span>}
                    </>
                  )
                  return (
                    <li key={l.id}>
                      {unlocked ? (
                        <Link
                          to={`/aula/${l.id}`}
                          className="flex items-center gap-2 rounded px-3 py-2 text-sm hover:bg-slate-800"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex cursor-not-allowed items-center gap-2 rounded px-3 py-2 text-sm text-slate-600" title="Conclua a aula anterior">
                          {body}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}

        <p className="pb-6 text-xs text-slate-600">
          Aulas liberadas: {Object.keys(completed).length}/{modules.flatMap((m) => m.lessons).length}
          {' · '}
          <button onClick={resetAll} className="underline hover:text-red-400">
            reiniciar tudo
          </button>
        </p>
      </div>
    </div>
  )
}

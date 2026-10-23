import { ACHIEVEMENTS } from '../../game/achievements'
import { useProgress } from '../../game/store'

/** O que o aluno já conquistou e o que ainda falta. */
export function AchievementsPage() {
  const unlocked = useProgress((s) => s.achievements)
  const total = Object.keys(unlocked).length

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold">Conquistas</h1>
        <p className="mt-1 text-sm text-slate-400">
          {total} de {ACHIEVEMENTS.length} desbloqueadas.
        </p>
        <div className="mt-1 h-1.5 w-64 overflow-hidden rounded bg-slate-800">
          <div className="h-full bg-amber-400" style={{ width: `${(total / ACHIEVEMENTS.length) * 100}%` }} />
        </div>

        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {ACHIEVEMENTS.map((a) => {
            const at = unlocked[a.id]
            return (
              <li
                key={a.id}
                data-achievement={a.id}
                data-unlocked={at ? 'true' : 'false'}
                className={`flex gap-3 rounded-lg border p-3 ${at ? 'border-amber-600 bg-amber-950/30' : 'border-slate-800 bg-slate-900/40 opacity-70'}`}
              >
                <span className={`text-3xl ${at ? '' : 'grayscale'}`}>{at ? a.emoji : '🔒'}</span>
                <div>
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-xs text-slate-400">{a.description}</p>
                  {at && <p className="mt-1 text-[11px] text-amber-300">Desbloqueada em {new Date(at).toLocaleDateString('pt-BR')}</p>}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

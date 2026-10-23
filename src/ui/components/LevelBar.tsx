import { useProgress } from '../../game/store'
import { activeStreak, levelFor } from '../../game/xp'

export function LevelBar() {
  const xp = useProgress((s) => s.xp)
  const streak = useProgress((s) => s.streak)
  const lv = levelFor(xp)
  const days = activeStreak(streak)

  return (
    <div className="flex items-center gap-3 text-xs" title={`${xp} XP no total`}>
      {days > 0 && <span className="text-amber-300">🔥 {days} {days === 1 ? 'dia' : 'dias'}</span>}
      <div className="w-44">
        <div className="flex justify-between">
          <span className="font-semibold text-sky-300">
            Nv. {lv.level} · {lv.title}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${(lv.xpInto / lv.xpForNext) * 100}%` }} />
        </div>
        <div className="mt-0.5 text-right text-[10px] text-slate-500">
          {lv.xpInto} / {lv.xpForNext} XP
        </div>
      </div>
    </div>
  )
}

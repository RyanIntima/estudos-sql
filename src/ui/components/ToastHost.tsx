import { useEffect } from 'react'
import { useToasts, type Toast } from '../../game/toasts'

const STYLE: Record<Toast['kind'], string> = {
  xp: 'border-emerald-600 bg-emerald-950/90',
  level: 'border-sky-500 bg-sky-950/90',
  achievement: 'border-amber-500 bg-amber-950/90',
}
const ICON: Record<Toast['kind'], string> = { xp: '✨', level: '⬆️', achievement: '🏆' }

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss)
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), 5000)
    return () => clearTimeout(t)
  }, [toast.id, dismiss])
  return (
    <div
      role="status"
      data-toast={toast.kind}
      onClick={() => dismiss(toast.id)}
      className={`pointer-events-auto cursor-pointer rounded-lg border px-4 py-2 shadow-xl ${STYLE[toast.kind]}`}
    >
      <p className="text-sm font-semibold">
        {ICON[toast.kind]} {toast.title}
      </p>
      {toast.text && <p className="text-xs text-slate-300">{toast.text}</p>}
    </div>
  )
}

/** Canto da tela onde XP, nível e conquistas aparecem por alguns segundos. */
export function ToastHost() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-20 flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}

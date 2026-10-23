import { create } from 'zustand'

export interface Toast {
  id: number
  kind: 'xp' | 'level' | 'achievement'
  title: string
  text?: string
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
}

let next = 1

/** Avisos passageiros (XP, nível, conquista). Não são salvos: valem só para esta sessão. */
export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: next++ }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

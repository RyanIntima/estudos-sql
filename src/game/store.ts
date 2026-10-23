import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { newlyEarned } from './achievements'
import { levelFor, lessonStars, nextStreak, stepXp, type StepStat } from './xp'

export interface CompleteResult {
  xpGained: number
  /** A lição ficou completa agora (não numa revisão). */
  lessonJustCompleted: boolean
  stars: number
  /** Conquistas desbloqueadas por este passo. */
  newAchievements: string[]
  /** O novo nível, se este passo fez o aluno subir de nível. */
  levelUp: number | null
}

interface ProgressState {
  xp: number
  /** Passos concluídos. */
  steps: Record<string, StepStat>
  lessons: Record<string, { stars: number }>
  /** Estado do passo em andamento (dicas reveladas, solução vista, tentativas). */
  hints: Record<string, number>
  solutionShown: Record<string, boolean>
  attempts: Record<string, number>
  streak: { count: number; lastDay: string | null }
  /** Comandos que o aluno rodou no Playground por conta própria. */
  playgroundRuns: number
  /** Conquistas desbloqueadas → quando. */
  achievements: Record<string, number>

  revealHint(stepId: string, max: number): void
  revealSolution(stepId: string): void
  recordAttempt(stepId: string): void
  completeStep(args: { stepId: string; baseXp: number; lessonId: string; lessonStepIds: string[] }): CompleteResult
  /** Devolve as conquistas desbloqueadas por esta execução. */
  recordPlaygroundRun(): string[]
  resetProgress(): void
}

const initial = {
  xp: 0,
  steps: {},
  lessons: {},
  hints: {},
  solutionShown: {},
  attempts: {},
  streak: { count: 0, lastDay: null },
  playgroundRuns: 0,
  achievements: {},
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...initial,

      revealHint: (stepId, max) =>
        set((s) => ({ hints: { ...s.hints, [stepId]: Math.min(max, (s.hints[stepId] ?? 0) + 1) } })),

      revealSolution: (stepId) => set((s) => ({ solutionShown: { ...s.solutionShown, [stepId]: true } })),

      recordAttempt: (stepId) => set((s) => ({ attempts: { ...s.attempts, [stepId]: (s.attempts[stepId] ?? 0) + 1 } })),

      completeStep: ({ stepId, baseXp, lessonId, lessonStepIds }) => {
        const s = get()
        // Refazer um passo já concluído não rende XP de novo.
        if (s.steps[stepId]) {
          return { xpGained: 0, lessonJustCompleted: false, stars: s.lessons[lessonId]?.stars ?? 0, newAchievements: [], levelUp: null }
        }
        const stat: StepStat = {
          xp: stepXp({ baseXp, hints: s.hints[stepId] ?? 0, solutionShown: s.solutionShown[stepId] ?? false }),
          hints: s.hints[stepId] ?? 0,
          solution: s.solutionShown[stepId] ?? false,
          attempts: s.attempts[stepId] ?? 0,
          at: Date.now(),
        }
        const steps = { ...s.steps, [stepId]: stat }
        const lessonDone = lessonStepIds.every((id) => steps[id])
        const stars = lessonDone ? lessonStars(lessonStepIds.map((id) => steps[id])) : 0
        const next = {
          xp: s.xp + stat.xp,
          steps,
          lessons: lessonDone ? { ...s.lessons, [lessonId]: { stars } } : s.lessons,
          streak: nextStreak(s.streak),
        }
        const earned = newlyEarned({ ...next, playgroundRuns: s.playgroundRuns }, s.achievements)
        const now = Date.now()
        set({ ...next, achievements: { ...s.achievements, ...Object.fromEntries(earned.map((id) => [id, now])) } })
        const before = levelFor(s.xp).level
        const after = levelFor(next.xp).level
        return { xpGained: stat.xp, lessonJustCompleted: lessonDone, stars, newAchievements: earned, levelUp: after > before ? after : null }
      },

      recordPlaygroundRun: () => {
        const s = get()
        const playgroundRuns = s.playgroundRuns + 1
        const earned = newlyEarned({ ...s, playgroundRuns }, s.achievements)
        const now = Date.now()
        set({ playgroundRuns, achievements: { ...s.achievements, ...Object.fromEntries(earned.map((id) => [id, now])) } })
        return earned
      },

      resetProgress: () => set({ ...initial }),
    }),
    { name: 'sqlquest-progress' },
  ),
)

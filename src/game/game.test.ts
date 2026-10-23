import { beforeAll, describe, expect, it, vi } from 'vitest'
import { lessons, stepRefs } from '../lessons/registry'
import { ACHIEVEMENTS, newlyEarned, type AchievementState } from './achievements'
import { dayKey, levelFor, nextStreak, stepXp } from './xp'

const empty: AchievementState = { xp: 0, steps: {}, lessons: {}, streak: { count: 0, lastDay: null }, playgroundRuns: 0 }
const done = (attempts = 1, hints = 0) => ({ xp: 50, hints, solution: false, attempts })

describe('conquistas', () => {
  it('ids únicos e nenhuma conquista é concedida de graça', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(newlyEarned(empty, {})).toEqual([])
  })

  it('todas são alcançáveis: com o curso inteiro concluído, nenhuma fica de fora (pega ids de passos errados)', () => {
    const state: AchievementState = {
      xp: 99999,
      steps: Object.fromEntries(stepRefs.map((r) => [r.step.id, done()])),
      lessons: Object.fromEntries(lessons.map((l) => [l.id, { stars: 3 }])),
      streak: nextStreak({ count: 6, lastDay: dayKey(new Date(Date.now() - 86_400_000)) }),
      playgroundRuns: 10,
    }
    expect(ACHIEVEMENTS.filter((a) => !a.earned(state)).map((a) => a.id)).toEqual([])
  })

  it('cada uma depende do que o nome promete', () => {
    const at = (steps: Record<string, ReturnType<typeof done>>): AchievementState => ({ ...empty, steps })
    expect(newlyEarned(at({ 'm01-l1-s1': done() }), {})).toEqual(['primeira-tabela'])
    expect(newlyEarned(at({ 'm01-l1-s1': done() }), { 'primeira-tabela': 1 })).toEqual([]) // já tem
    // "Sem WHERE não!": os dois passos, em até 2 tentativas cada.
    expect(newlyEarned(at({ 'm02-l5-s1': done(2), 'm02-l6-s2': done(2) }), {})).toContain('sem-where-nao')
    expect(newlyEarned(at({ 'm02-l5-s1': done(2), 'm02-l6-s2': done(5) }), {})).not.toContain('sem-where-nao')
    // "Speedrun do índice": chefão em até 2 tentativas E sem dicas.
    expect(newlyEarned(at({ 'm11-boss-s1': done(2, 0) }), {})).toContain('speedrun-do-indice')
    expect(newlyEarned(at({ 'm11-boss-s1': done(2, 1) }), {})).not.toContain('speedrun-do-indice')
    expect(newlyEarned(at({ 'm11-boss-s1': done(3, 0) }), {})).not.toContain('speedrun-do-indice')
    // "Explorador": só com o uso do Playground.
    expect(newlyEarned({ ...empty, playgroundRuns: 9 }, {})).toEqual([])
    expect(newlyEarned({ ...empty, playgroundRuns: 10 }, {})).toEqual(['explorador'])
  })
})

describe('xp, níveis e sequência', () => {
  it('dica custa XP, com piso; ver a solução rende pouco', () => {
    expect(stepXp({ baseXp: 50, hints: 0, solutionShown: false })).toBe(50)
    expect(stepXp({ baseXp: 50, hints: 2, solutionShown: false })).toBe(30)
    expect(stepXp({ baseXp: 50, hints: 9, solutionShown: false })).toBe(20)
    expect(stepXp({ baseXp: 150, hints: 0, solutionShown: true })).toBe(10)
  })

  it('níveis crescem em degraus cada vez maiores', () => {
    expect(levelFor(0).level).toBe(1)
    expect(levelFor(149).level).toBe(1)
    expect(levelFor(150).level).toBe(2)
    expect(levelFor(450).level).toBe(3)
    expect(levelFor(450).xpInto).toBe(0)
  })

  it('a sequência só conta dias seguidos', () => {
    const d = (n: number) => new Date(2026, 0, n, 12)
    const day1 = nextStreak({ count: 0, lastDay: null }, d(1))
    expect(day1.count).toBe(1)
    expect(nextStreak(day1, d(1))).toEqual(day1) // mesmo dia: não soma
    expect(nextStreak(day1, d(2)).count).toBe(2)
    expect(nextStreak(day1, d(4)).count).toBe(1) // pulou dias: recomeça
  })
})

describe('store do jogo', () => {
  beforeAll(() => {
    // O estado é salvo em localStorage, que o Node não tem.
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) })
  })

  it('concluir um passo rende XP, registra a conquista e a data; refazer não rende de novo', async () => {
    const { useProgress } = await import('./store')
    useProgress.getState().resetProgress()
    const lesson = stepRefs.find((r) => r.step.id === 'm01-l1-s1')!.lesson
    const args = { stepId: 'm01-l1-s1', baseXp: 50, lessonId: lesson.id, lessonStepIds: lesson.steps.map((s) => s.id) }

    const first = useProgress.getState().completeStep(args)
    expect(first.xpGained).toBe(50)
    expect(first.newAchievements).toEqual(['primeira-tabela'])
    expect(useProgress.getState().steps['m01-l1-s1'].at).toBeGreaterThan(0)
    expect(useProgress.getState().achievements['primeira-tabela']).toBeGreaterThan(0)

    const again = useProgress.getState().completeStep(args)
    expect(again).toMatchObject({ xpGained: 0, newAchievements: [], levelUp: null })
    expect(useProgress.getState().xp).toBe(50)
  })

  it('avisa quando o passo faz subir de nível', async () => {
    const { useProgress } = await import('./store')
    useProgress.getState().resetProgress()
    useProgress.setState({ xp: 120 }) // faltam 30 para o nível 2 (150)
    const lesson = stepRefs.find((r) => r.step.id === 'm00-l1-s1')!.lesson
    const r = useProgress.getState().completeStep({ stepId: 'm00-l1-s1', baseXp: 50, lessonId: lesson.id, lessonStepIds: lesson.steps.map((s) => s.id) })
    expect(r.levelUp).toBe(2)
  })

  it('o Playground conta execuções e desbloqueia "Explorador" na décima', async () => {
    const { useProgress } = await import('./store')
    useProgress.getState().resetProgress()
    for (let i = 1; i < 10; i++) expect(useProgress.getState().recordPlaygroundRun()).toEqual([])
    expect(useProgress.getState().recordPlaygroundRun()).toEqual(['explorador'])
    expect(useProgress.getState().recordPlaygroundRun()).toEqual([]) // só desbloqueia uma vez
  })
})

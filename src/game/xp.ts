export const STEP_BASE_XP = 50
export const BOSS_STEP_XP = 150
export const HINT_COST = 10
const MIN_XP = 20
const SOLUTION_XP = 10

export interface StepStat {
  xp: number
  hints: number
  solution: boolean
  attempts: number
  /** Quando o passo foi concluído (ms desde 1970). Ausente em progresso salvo antes desta versão. */
  at?: number
}

/** Cada dica custa XP até um piso; ver a solução deixa só uma recompensa simbólica. */
export function stepXp(args: { baseXp: number; hints: number; solutionShown: boolean }): number {
  if (args.solutionShown) return SOLUTION_XP
  return Math.max(MIN_XP, args.baseXp - HINT_COST * args.hints)
}

/** 3 estrelas: sem ajuda; 2: com dicas; 1: viu alguma solução. */
export function lessonStars(stats: StepStat[]): 1 | 2 | 3 {
  if (stats.some((s) => s.solution)) return 1
  return stats.every((s) => s.hints === 0) ? 3 : 2
}

const LEVEL_TITLES = [
  'Estagiário de Dados',
  'Aprendiz de SQL',
  'Analista Júnior',
  'Analista de Dados',
  'Analista Pleno',
  'Engenheiro de Dados',
  'Modelador de Dados',
  'Arquiteto de Dados',
  'DBA Sênior',
  'Mestre do Banco',
]

/** XP acumulado necessário para ALCANÇAR o nível (nível 1 = 0). */
export const xpToReach = (level: number) => 75 * (level - 1) * level

export function levelFor(xp: number) {
  let level = 1
  while (xp >= xpToReach(level + 1)) level++
  const start = xpToReach(level)
  return {
    level,
    title: LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1],
    xpInto: xp - start,
    xpForNext: xpToReach(level + 1) - start,
  }
}

/** Dia local no formato YYYY-MM-DD. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A sequência só vale se o último dia de estudo foi hoje ou ontem. */
export function activeStreak(streak: { count: number; lastDay: string | null }, now = new Date()): number {
  if (!streak.lastDay) return 0
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return streak.lastDay === dayKey(now) || streak.lastDay === dayKey(yesterday) ? streak.count : 0
}

export function nextStreak(streak: { count: number; lastDay: string | null }, now = new Date()) {
  const today = dayKey(now)
  if (streak.lastDay === today) return streak
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return { count: streak.lastDay === dayKey(yesterday) ? streak.count + 1 : 1, lastDay: today }
}

import { lessons, stepRefs } from '../lessons/registry'
import { activeStreak, levelFor, type StepStat } from './xp'

/** O que as conquistas enxergam do progresso (um recorte do estado do jogo). */
export interface AchievementState {
  xp: number
  steps: Record<string, StepStat>
  lessons: Record<string, { stars: number }>
  streak: { count: number; lastDay: string | null }
  playgroundRuns: number
}

export interface Achievement {
  id: string
  emoji: string
  title: string
  description: string
  earned: (s: AchievementState) => boolean
}

const stepDone = (s: AchievementState, id: string) => id in s.steps
const lessonDone = (s: AchievementState, id: string) => id in s.lessons
const threeStars = (s: AchievementState) => Object.values(s.lessons).filter((l) => l.stars === 3).length
const bossIds = lessons.filter((l) => l.boss).map((l) => l.id)
const errorStepIds = stepRefs.filter((r) => r.step.expectError).map((r) => r.step.id)
const lessonsOfModule = (prefix: string) => lessons.filter((l) => l.id.startsWith(prefix + '-')).map((l) => l.id)
const everyLesson = (s: AchievementState, ids: string[]) => ids.every((id) => lessonDone(s, id))

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'primeira-tabela', emoji: '🏗️', title: 'Primeira tabela', description: 'Criou a sua primeira tabela com CREATE TABLE.', earned: (s) => stepDone(s, 'm01-l1-s1') },
  { id: 'dados-em-cena', emoji: '📦', title: 'Dados em cena', description: 'Cadastrou a primeira linha com INSERT.', earned: (s) => stepDone(s, 'm02-l1-s1') },
  {
    id: 'sem-where-nao',
    emoji: '🎯',
    title: 'Sem WHERE não!',
    description: 'Fez o UPDATE e o DELETE com WHERE, cada um em até 2 tentativas.',
    earned: (s) => ['m02-l5-s1', 'm02-l6-s2'].every((id) => (s.steps[id]?.attempts ?? 99) <= 2),
  },
  { id: 'integridade-garantida', emoji: '🛡️', title: 'Integridade garantida', description: 'Ligou duas tabelas com a sua primeira chave estrangeira.', earned: (s) => stepDone(s, 'm03-l3-s3') },
  {
    id: 'errar-e-aprender',
    emoji: '🧯',
    title: 'Errar é aprender',
    description: `Provocou de propósito ${Math.min(5, errorStepIds.length)} erros do banco e aprendeu a lê-los.`,
    earned: (s) => errorStepIds.filter((id) => stepDone(s, id)).length >= 5,
  },
  { id: 'mestre-dos-joins', emoji: '🔗', title: 'Mestre dos JOINs', description: 'Derrotou o chefão dos JOINs.', earned: (s) => lessonDone(s, 'm05-boss') },
  { id: 'relatorista', emoji: '📊', title: 'Relatorista', description: 'Derrotou o chefão da agregação.', earned: (s) => lessonDone(s, 'm06-boss') },
  { id: 'janela-aberta', emoji: '🪟', title: 'Janela aberta', description: 'Concluiu o módulo de window functions.', earned: (s) => everyLesson(s, lessonsOfModule('m08')) },
  { id: 'transacao-atomica', emoji: '🔒', title: 'Transação atômica', description: 'Fechou um pedido inteiro numa única transação.', earned: (s) => stepDone(s, 'm09-l2-s1') },
  { id: 'gatilho-certeiro', emoji: '⚡', title: 'Gatilho certeiro', description: 'Criou o seu primeiro trigger.', earned: (s) => stepDone(s, 'm10-l3-s2') },
  {
    id: 'speedrun-do-indice',
    emoji: '🚀',
    title: 'Speedrun do índice',
    description: 'Derrotou o chefão do índice em até 2 tentativas e sem usar dicas.',
    earned: (s) => {
      const st = s.steps['m11-boss-s1']
      return !!st && st.attempts <= 2 && st.hints === 0 && !st.solution
    },
  },
  { id: 'sem-muletas', emoji: '🦯', title: 'Sem muletas', description: 'Completou 5 aulas com 3 estrelas (sem dicas e sem ver a solução).', earned: (s) => threeStars(s) >= 5 },
  { id: 'perfeccionista', emoji: '⭐', title: 'Perfeccionista', description: 'Completou 20 aulas com 3 estrelas.', earned: (s) => threeStars(s) >= 20 },
  { id: 'cacador-de-chefoes', emoji: '👹', title: 'Caçador de chefões', description: 'Derrotou todos os chefões.', earned: (s) => everyLesson(s, bossIds) },
  { id: 'semana-de-fogo', emoji: '🔥', title: 'Semana de fogo', description: 'Estudou 7 dias seguidos.', earned: (s) => activeStreak(s.streak) >= 7 },
  { id: 'explorador', emoji: '🧪', title: 'Explorador', description: 'Rodou 10 comandos no Playground, por conta própria.', earned: (s) => s.playgroundRuns >= 10 },
  { id: 'analista-pleno', emoji: '🎓', title: 'Analista Pleno', description: 'Chegou ao nível 5.', earned: (s) => levelFor(s.xp).level >= 5 },
  { id: 'lojadb-completo', emoji: '🏆', title: 'LojaDB completo', description: 'Concluiu todas as aulas do curso.', earned: (s) => everyLesson(s, lessons.map((l) => l.id)) },
]

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)

/** Ids das conquistas que o estado já merece e ainda não estão em `unlocked`. */
export function newlyEarned(state: AchievementState, unlocked: Record<string, number>): string[] {
  return ACHIEVEMENTS.filter((a) => !(a.id in unlocked) && a.earned(state)).map((a) => a.id)
}

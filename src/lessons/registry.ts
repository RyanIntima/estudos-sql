import { m00 } from '../content/m00-fundamentos'
import { m01 } from '../content/m01-ddl'
import { m02 } from '../content/m02-dml'
import { m03 } from '../content/m03-integridade'
import { m04 } from '../content/m04-modelagem'
import { m05 } from '../content/m05-joins'
import { m06 } from '../content/m06-agregacao'
import { m07 } from '../content/m07-consultas-avancadas'
import { m08 } from '../content/m08-window-functions'
import { m09 } from '../content/m09-transacoes'
import { m10 } from '../content/m10-views-funcoes-triggers'
import { m11 } from '../content/m11-indices'
import { m12 } from '../content/m12-final'
import type { Lesson, Module, Step } from './types'

/** Ordem do currículo: cada módulo parte do banco deixado pelo anterior. */
export const modules: Module[] = [m00, m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12]

export interface StepRef {
  module: Module
  lesson: Lesson
  step: Step
  /** Posição do passo dentro da lição. */
  stepIndex: number
  /** Posição do passo em todo o currículo (define o checkpoint do banco). */
  globalIndex: number
}

export const lessons: Lesson[] = modules.flatMap((m) => m.lessons)

export const stepRefs: StepRef[] = (() => {
  const refs: StepRef[] = []
  for (const module of modules) {
    for (const lesson of module.lessons) {
      lesson.steps.forEach((step, stepIndex) => refs.push({ module, lesson, step, stepIndex, globalIndex: refs.length }))
    }
  }
  return refs
})()

export const getLesson = (id: string) => lessons.find((l) => l.id === id)
export const getModule = (lessonId: string) => modules.find((m) => m.lessons.some((l) => l.id === lessonId))
export const getStepRef = (stepId: string) => stepRefs.find((r) => r.step.id === stepId)

/** Índice global do primeiro passo da lição. */
export const firstStepIndex = (lesson: Lesson) => stepRefs.find((r) => r.lesson.id === lesson.id)!.globalIndex

/** Passos cujas soluções compõem o banco esperado no início do passo `globalIndex`. */
export const stepsBefore = (globalIndex: number): Step[] => stepRefs.slice(0, globalIndex).map((r) => r.step)

export const nextLesson = (lessonId: string): Lesson | undefined => lessons[lessons.findIndex((l) => l.id === lessonId) + 1]

/** Uma lição libera quando a anterior (na ordem do currículo) está concluída. */
export function isLessonUnlocked(lessonId: string, completed: Record<string, unknown>): boolean {
  const i = lessons.findIndex((l) => l.id === lessonId)
  return i === 0 || (i > 0 && lessons[i - 1].id in completed)
}

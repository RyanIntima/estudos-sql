import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useProgress } from '../../game/store'
import { getLesson, getModule, isLessonUnlocked } from '../../lessons/registry'
import type { Lesson } from '../../lessons/types'
import { Markdown } from '../components/Markdown'
import { PracticeView } from '../components/PracticeView'

function LessonView({ lesson }: { lesson: Lesson }) {
  const [phase, setPhase] = useState<'theory' | 'practice'>('theory')

  if (phase === 'practice') {
    return <PracticeView lesson={lesson} onBackToTheory={() => setPhase('theory')} />
  }

  const module = getModule(lesson.id)
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl p-6">
        <Link to="/" className="text-sm text-slate-400 hover:text-white">
          ← Mapa
        </Link>
        <p className="mt-3 text-xs uppercase tracking-wide text-sky-400">
          {module?.emoji} {module?.title}
          {lesson.boss && ' · Chefão'}
        </p>
        <Markdown className="mt-2">{lesson.theory}</Markdown>
        <div className="mt-8 flex items-center gap-4 border-t border-slate-800 pt-4">
          <button onClick={() => setPhase('practice')} className="rounded bg-emerald-600 px-5 py-2 font-medium hover:bg-emerald-500">
            Praticar →
          </button>
          <span className="text-sm text-slate-400">
            {lesson.steps.length} {lesson.steps.length === 1 ? 'passo' : 'passos'} de prática
          </span>
        </div>
      </div>
    </div>
  )
}

export function LessonPage() {
  const { lessonId = '' } = useParams()
  const lesson = getLesson(lessonId)
  const completed = useProgress((s) => s.lessons)

  if (!lesson || !isLessonUnlocked(lesson.id, completed)) return <Navigate to="/" replace />
  // key: cada aula começa de novo pela teoria, inclusive ao seguir de uma para a próxima.
  return <LessonView key={lesson.id} lesson={lesson} />
}

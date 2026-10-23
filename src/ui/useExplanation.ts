import { useEffect, useMemo, useState } from 'react'
import { explainSql, type Annotation, type Explanation } from '../explain/explainer'

/** Explicação do texto do editor, recalculada pouco depois de o aluno parar de digitar. */
export function useExplanation(code: string): Explanation | null {
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  useEffect(() => {
    let stale = false
    const timer = setTimeout(async () => {
      const result = await explainSql(code)
      if (!stale) setExplanation(result)
    }, 250)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [code])
  return explanation
}

/** A anotação mais específica (a de menor trecho) que cobre a posição do cursor. */
export function annotationAt(annotations: Annotation[], pos: number | null): Annotation | undefined {
  if (pos === null) return undefined
  return annotations
    .filter((a) => a.from <= pos && pos <= a.to)
    .sort((a, b) => b.depth - a.depth || a.to - a.from - (b.to - b.from))[0]
}

/**
 * Liga o código à explicação nos dois sentidos: passar o mouse num trecho do editor acende o item no painel,
 * e passar o mouse num item do painel destaca o trecho no editor.
 */
export function useExplainLink(explanation: Explanation | null) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [fromEditor, setFromEditor] = useState(false)
  const annotations = useMemo(() => (explanation?.ok ? explanation.annotations : []), [explanation])

  const highlight = useMemo(() => {
    const a = annotations.find((x) => x.id === activeId)
    return a ? { from: a.from, to: a.to } : null
  }, [annotations, activeId])

  return {
    annotations,
    activeId,
    fromEditor,
    highlight,
    /** Mouse no editor. */
    hoverPos: (pos: number | null) => {
      setFromEditor(true)
      setActiveId(annotationAt(annotations, pos)?.id ?? null)
    },
    /** Mouse num item do painel. */
    hoverItem: (id: string | null) => {
      setFromEditor(false)
      setActiveId(id)
    },
  }
}

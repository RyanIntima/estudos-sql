import { useEffect, useRef } from 'react'
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, highlightActiveLine, keymap, lineNumbers, type DecorationSet } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { PostgreSQL, sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { autocompletion } from '@codemirror/autocomplete'
import type { SchemaModel } from '../../db/introspect'

export interface Range {
  from: number
  to: number
}

interface Props {
  value: string
  onChange: (value: string) => void
  /** Chamado com Ctrl/Cmd+Enter. */
  onRun: () => void
  /** Alimenta o autocomplete com as tabelas/colunas que o aluno já criou. */
  schema?: SchemaModel
  /** Trecho destacado (ex.: o que o aluno está lendo no painel de explicação). */
  highlight?: Range | null
  /** Posição (1-based, do Postgres) onde sublinhar um erro. Some assim que o aluno edita o texto. */
  errorAt?: number | null
  /** Muda a cada execução: refaz o sublinhado mesmo quando o erro cai na mesma posição de antes. */
  errorToken?: unknown
  /** Posição do mouse no texto (null ao sair), para ligar o código à explicação. */
  onHoverPos?: (pos: number | null) => void
}

interface Marks {
  highlight: Range | null
  error: number | null
}

const setMarks = StateEffect.define<Marks>()

const highlightMark = Decoration.mark({ class: 'cm-explain-hl' })
const errorMark = Decoration.mark({ class: 'cm-error-at' })

/** Marcas visuais controladas de fora. Qualquer edição as descarta: elas se referem ao texto de antes. */
const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (!e.is(setMarks)) continue
      const len = tr.state.doc.length
      const ranges = []
      const { highlight, error } = e.value
      if (error !== null && error >= 1 && error <= len) {
        const from = error - 1
        const word = tr.state.sliceDoc(from, Math.min(len, from + 60)).match(/^\w+|^\S/)?.[0].length ?? 1
        ranges.push(errorMark.range(from, from + word))
      }
      if (highlight && highlight.to > highlight.from && highlight.to <= len) {
        ranges.push(highlightMark.range(highlight.from, highlight.to))
      }
      return Decoration.set(ranges, true)
    }
    return tr.docChanged ? Decoration.none : deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

function toCompletionSchema(schema?: SchemaModel) {
  return Object.fromEntries((schema?.tables ?? []).map((t) => [t.name, t.columns.map((c) => c.name)]))
}

export function SqlEditor({ value, onChange, onRun, schema, highlight = null, errorAt = null, errorToken, onHoverPos }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const sqlLang = useRef(new Compartment())
  // Callbacks em ref: o editor é criado uma única vez e não pode capturar props velhas.
  const handlers = useRef({ onChange, onRun, onHoverPos })
  handlers.current = { onChange, onRun, onHoverPos }
  /** Último erro pedido pela tela; zerado quando o aluno digita, para não ressuscitar o sublinhado. */
  const errorRef = useRef<number | null>(errorAt)

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          autocompletion(),
          marksField,
          sqlLang.current.of(sql({ dialect: PostgreSQL, schema: toCompletionSchema(schema) })),
          oneDark,
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                handlers.current.onRun()
                return true
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              errorRef.current = null
              handlers.current.onChange(u.state.doc.toString())
            }
          }),
          EditorView.domEventHandlers({
            mousemove(e, v) {
              handlers.current.onHoverPos?.(v.posAtCoords({ x: e.clientX, y: e.clientY }))
              return false
            },
            mouseleave() {
              handlers.current.onHoverPos?.(null)
              return false
            },
          }),
        ],
      }),
    })
    view.current = v
    return () => v.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- criado uma única vez
  }, [])

  // Valor controlado vindo de fora (ex.: "colocar solução no editor").
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  useEffect(() => {
    view.current?.dispatch({
      effects: sqlLang.current.reconfigure(sql({ dialect: PostgreSQL, schema: toCompletionSchema(schema) })),
    })
  }, [schema])

  useEffect(() => {
    errorRef.current = errorAt
    view.current?.dispatch({ effects: setMarks.of({ highlight, error: errorAt }) })
    // `highlight` fica de fora de propósito: mudar só o destaque não deve ressuscitar um erro já apagado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorAt, errorToken])

  useEffect(() => {
    view.current?.dispatch({ effects: setMarks.of({ highlight, error: errorRef.current }) })
  }, [highlight])

  return <div ref={host} className="h-full overflow-hidden" />
}

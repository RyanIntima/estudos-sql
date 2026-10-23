import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { exportSql } from '../../db/exportSql'
import { getEngine } from '../../db/instances'
import { EMPTY_SCHEMA, introspect, type SchemaModel } from '../../db/introspect'
import { ACHIEVEMENTS } from '../../game/achievements'
import { useProgress } from '../../game/store'
import { lessons, modules } from '../../lessons/registry'
import { downloadDataUrl, downloadText } from '../download'
import { ErDiagram } from '../components/ErDiagram'

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('pt-BR')

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div data-stat={label} className="rounded border border-slate-800 bg-slate-900/60 px-3 py-2 text-center">
      <div className="text-xl font-bold text-sky-300">{value}</div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  )
}

/** O LojaDB que o aluno construiu: diagrama completo, números, o que foi feito e a exportação. */
export function ProjectPage() {
  const [schema, setSchema] = useState<SchemaModel>(EMPTY_SCHEMA)
  const [rows, setRows] = useState<Record<string, number>>({})
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState<'sql' | 'png' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const diagram = useRef<HTMLDivElement>(null)

  const steps = useProgress((s) => s.steps)
  const completed = useProgress((s) => s.lessons)
  const unlocked = useProgress((s) => s.achievements)
  const xp = useProgress((s) => s.xp)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const engine = await getEngine('lojadb')
      const s = await introspect(engine)
      const counts: Record<string, number> = {}
      for (const t of s.tables) {
        const [{ n }] = await engine.query<{ n: number }>(`SELECT count(*)::int AS n FROM "${t.name}"`)
        counts[t.name] = n
      }
      if (!cancelled) {
        setSchema(s)
        setRows(counts)
        setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(
    () => ({
      tabelas: schema.tables.length,
      colunas: schema.tables.reduce((n, t) => n + t.columns.length, 0),
      relacoes: schema.tables.reduce((n, t) => n + t.constraints.filter((c) => c.kind === 'foreign').length, 0),
      regras: schema.tables.reduce((n, t) => n + t.constraints.length, 0),
      indices: schema.tables.reduce((n, t) => n + t.indexes.filter((i) => !i.primary).length, 0),
      views: schema.views.length,
      funcoes: schema.functions.length,
      triggers: schema.tables.reduce((n, t) => n + t.triggers.length, 0),
      linhas: Object.values(rows).reduce((a, b) => a + b, 0),
    }),
    [schema, rows],
  )

  const doneLessons = Object.keys(completed).length
  const bossesDone = lessons.filter((l) => l.boss && l.id in completed).length
  const bossesTotal = lessons.filter((l) => l.boss).length

  const exportDb = async () => {
    setBusy('sql')
    setError(null)
    try {
      downloadText('lojadb.sql', await exportSql(await getEngine('lojadb')), 'text/sql')
    } catch (e) {
      setError(`Não consegui exportar o banco: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const exportPng = async () => {
    if (!diagram.current) return
    setBusy('png')
    setError(null)
    try {
      const url = await toPng(diagram.current, {
        backgroundColor: '#0b1020',
        pixelRatio: 2,
        // Os botões de zoom não fazem parte do desenho.
        filter: (node) => !(node instanceof HTMLElement && node.classList.contains('react-flow__controls')),
      })
      downloadDataUrl('lojadb-diagrama.png', url)
    } catch (e) {
      setError(`Não consegui gerar a imagem: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">O seu LojaDB</h1>
            <p className="mt-1 text-sm text-slate-400">
              O banco de dados que você construiu, aula a aula, só com SQL.
            </p>
          </div>
          <div className="ml-auto flex gap-2 text-sm">
            <button
              onClick={exportPng}
              disabled={!ready || busy !== null || stats.tabelas === 0}
              className="rounded border border-slate-600 px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50"
            >
              {busy === 'png' ? 'Gerando…' : '🖼️ Baixar diagrama (PNG)'}
            </button>
            <button
              onClick={exportDb}
              disabled={!ready || busy !== null}
              className="rounded bg-emerald-600 px-3 py-1.5 font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === 'sql' ? 'Exportando…' : '⬇ Baixar lojadb.sql'}
            </button>
          </div>
        </div>

        {error && <p className="rounded border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p>}

        {doneLessons < lessons.length && (
          <p className="rounded border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
            🚧 O seu LojaDB ainda está <b>em construção</b>: {doneLessons} de {lessons.length} aulas concluídas.{' '}
            <Link to="/" className="underline">
              Continuar no mapa
            </Link>
          </p>
        )}

        <section className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          <Stat value={stats.tabelas} label="tabelas" />
          <Stat value={stats.colunas} label="colunas" />
          <Stat value={stats.relacoes} label="relações (FK)" />
          <Stat value={stats.regras} label="regras" />
          <Stat value={stats.indices} label="índices" />
          <Stat value={stats.views} label="views" />
          <Stat value={stats.funcoes} label="funções" />
          <Stat value={stats.triggers} label="triggers" />
          <Stat value={stats.linhas.toLocaleString('pt-BR')} label="linhas" />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Diagrama completo</h2>
          <div ref={diagram} className="h-[480px] overflow-hidden rounded-lg border border-slate-800 bg-[#0b1020]">
            {ready ? <ErDiagram schema={schema} /> : <p className="p-6 text-sm text-slate-400">Carregando o banco…</p>}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">O que você construiu</h2>
            <ol className="space-y-2">
              {modules.map((m) => {
                const mine = m.lessons.filter((l) => l.id in completed)
                const when = m.lessons.flatMap((l) => l.steps.map((s) => steps[s.id]?.at)).filter((x): x is number => !!x)
                return (
                  <li key={m.id} data-module={m.id} className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm">
                    <div className="flex items-baseline gap-2">
                      <span>{m.emoji}</span>
                      <span className="font-medium">{m.title}</span>
                      <span className="ml-auto text-xs text-slate-400">
                        {mine.length}/{m.lessons.length}
                      </span>
                    </div>
                    <div className="mt-0.5 flex justify-between text-xs text-slate-500">
                      <span>{m.subtitle}</span>
                      {when.length > 0 && <span>{fmtDate(Math.min(...when))}</span>}
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded bg-slate-800">
                      <div className="h-full bg-emerald-500" style={{ width: `${(mine.length / m.lessons.length) * 100}%` }} />
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Resumo</h2>
              <ul className="space-y-1 text-sm text-slate-300">
                <li>
                  Aulas concluídas: <b>{doneLessons}</b> de {lessons.length}
                </li>
                <li>
                  Chefões derrotados: <b>{bossesDone}</b> de {bossesTotal}
                </li>
                <li>
                  XP total: <b>{xp}</b>
                </li>
                <li>
                  Conquistas:{' '}
                  <b>
                    {Object.keys(unlocked).length} de {ACHIEVEMENTS.length}
                  </b>{' '}
                  <Link to="/conquistas" className="text-sky-400 underline">
                    ver todas
                  </Link>
                </li>
              </ul>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-400">
              <p className="mb-1 font-semibold text-slate-300">Sobre o arquivo lojadb.sql</p>
              <p>
                Ele contém <b>toda a estrutura e os dados</b>: tabelas, regras, índices, funções, views, triggers e permissões. Rodando-o num PostgreSQL vazio, o seu
                banco é recriado. É um <b>backup lógico</b>, parente do que a ferramenta <code>pg_dump</code> gera.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

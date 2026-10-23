import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ColumnModel, SchemaModel, TableModel, TriggerModel, ViewModel } from '../../db/introspect'
import type { ColumnAspect, ObjectChange, SchemaDiff, TableChange } from '../../db/schemaDiff'

const elk = new ELK()
const NODE_WIDTH = 250
const HEADER_H = 32
const ROW_H = 24

const ASPECT_LABEL: Record<ColumnAspect, string> = {
  type: 'tipo',
  nullable: 'obrigatoriedade',
  default: 'padrão',
  auto: 'automática',
  primaryKey: 'PK',
  unique: 'única',
  foreignKey: 'FK',
}

type Status = 'added' | 'changed' | 'removed'

interface TableData extends Record<string, unknown> {
  table: TableModel
  status?: TableChange['status']
  added: string[]
  changed: Record<string, ColumnAspect[]>
  removed: ColumnModel[]
  /** Status de cada trigger da tabela (pelo nome), conforme a última execução. */
  triggerStatus: Record<string, Status>
  /** Triggers apagados pela última execução (aparecem riscados). */
  removedTriggers: TriggerModel[]
}
interface ViewData extends Record<string, unknown> {
  view: ViewModel
  status?: Status
}
type TableNode = Node<TableData, 'table'>
type ViewNode = Node<ViewData, 'view'>
type DiagramNode = TableNode | ViewNode

const STATUS_STYLE = {
  added: { border: 'border-emerald-500', head: 'bg-emerald-700', badge: 'novo' },
  changed: { border: 'border-amber-500', head: 'bg-amber-700', badge: 'alterado' },
  removed: { border: 'border-red-500', head: 'bg-red-800', badge: 'removido' },
} as const

const triggerLabel = (t: TriggerModel) => `${t.name} · ${t.timing} ${t.events.join('/')}`

function TableCard({ data }: NodeProps<TableNode>) {
  const { table, status, added, changed, removed, triggerStatus, removedTriggers } = data
  const style = status ? STATUS_STYLE[status] : null
  const ghost = status === 'removed'
  return (
    <div
      data-status={status ?? 'none'}
      data-table={table.name}
      className={`rounded-md border bg-slate-900 text-xs shadow-lg ${style?.border ?? 'border-slate-600'} ${ghost ? 'opacity-80' : ''}`}
      style={{ width: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Left} className="!bg-sky-400" />
      <div
        className={`flex items-center justify-between rounded-t-md px-2 font-semibold text-white ${style?.head ?? 'bg-sky-800'}`}
        style={{ height: HEADER_H }}
      >
        <span className={ghost ? 'line-through' : ''}>{table.name}</span>
        {style && <span className="rounded bg-black/30 px-1.5 text-[10px] font-medium">{style.badge}</span>}
      </div>
      {!ghost &&
        table.columns.map((c) => {
          const isNew = status === 'changed' && added.includes(c.name)
          const aspects = changed[c.name]
          return (
            <div
              key={c.name}
              data-col={c.name}
              data-col-status={isNew ? 'added' : aspects ? 'changed' : 'none'}
              title={aspects ? `Mudou: ${aspects.map((a) => ASPECT_LABEL[a]).join(', ')}` : c.isForeignKey ? 'Chave estrangeira' : undefined}
              className={`flex items-center gap-1 border-t border-slate-800 px-2 ${isNew ? 'bg-emerald-500/25' : aspects ? 'bg-amber-500/25' : ''}`}
              style={{ height: ROW_H }}
            >
              <span className="w-8 shrink-0 text-[10px] font-bold text-amber-300">
                {c.isPrimaryKey && 'PK'}
                {c.isPrimaryKey && c.isForeignKey && ' '}
                {c.isForeignKey && <span className="text-sky-300">FK</span>}
              </span>
              <span className={`truncate ${c.nullable ? 'text-slate-300' : 'font-medium text-white'}`}>{c.name}</span>
              <span className="ml-auto truncate text-slate-500">
                {c.serial || c.identity ? `${c.type} · auto` : c.type}
                {c.isUnique && ' · uniq'}
              </span>
            </div>
          )
        })}
      {removed.map((c) => (
        <div
          key={`removed-${c.name}`}
          data-col={c.name}
          data-col-status="removed"
          className="flex items-center gap-1 border-t border-slate-800 bg-red-500/20 px-2 text-red-300 line-through"
          style={{ height: ROW_H }}
        >
          <span className="w-8 shrink-0" />
          <span className="truncate">{c.name}</span>
          <span className="ml-auto truncate opacity-70">{c.type}</span>
        </div>
      ))}
      {!ghost &&
        table.triggers.map((t) => {
          const s = triggerStatus[t.name]
          return (
            <div
              key={`trg-${t.name}`}
              data-trigger={t.name}
              data-trigger-status={s ?? 'none'}
              title={t.definition}
              className={`flex items-center gap-1 border-t border-slate-800 px-2 text-violet-300 ${s === 'added' ? 'bg-emerald-500/25' : s === 'changed' ? 'bg-amber-500/25' : ''}`}
              style={{ height: ROW_H }}
            >
              <span>⚡</span>
              <span className="truncate">{triggerLabel(t)}</span>
            </div>
          )
        })}
      {removedTriggers.map((t) => (
        <div
          key={`trg-removed-${t.name}`}
          data-trigger={t.name}
          data-trigger-status="removed"
          className="flex items-center gap-1 border-t border-slate-800 bg-red-500/20 px-2 text-red-300 line-through"
          style={{ height: ROW_H }}
        >
          <span>⚡</span>
          <span className="truncate">{triggerLabel(t)}</span>
        </div>
      ))}
      <Handle type="source" position={Position.Right} className="!bg-sky-400" />
    </div>
  )
}

function ViewCard({ data }: NodeProps<ViewNode>) {
  const { view, status } = data
  const style = status ? STATUS_STYLE[status] : null
  return (
    <div
      data-view={view.id}
      data-view-status={status ?? 'none'}
      className={`rounded-md border-2 border-dashed bg-slate-900/80 text-xs ${style?.border ?? 'border-violet-500'} ${status === 'removed' ? 'opacity-80' : ''}`}
      style={{ width: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Left} className="!bg-violet-400" />
      <div className={`flex items-center justify-between rounded-t px-2 font-semibold text-white ${style?.head ?? 'bg-violet-800'}`} style={{ height: HEADER_H }}>
        <span className={status === 'removed' ? 'line-through' : ''}>{view.id}</span>
        <span className="rounded bg-black/30 px-1.5 text-[10px] font-medium">{style?.badge ?? (view.materialized ? 'view materializada' : 'view')}</span>
      </div>
      {view.columns.map((c) => (
        <div key={c} className="flex items-center border-t border-slate-800 px-2 text-slate-300" style={{ height: ROW_H }}>
          <span className="truncate">{c}</span>
        </div>
      ))}
      <Handle type="source" position={Position.Right} className="!bg-violet-400" />
    </div>
  )
}

const nodeTypes = { table: TableCard, view: ViewCard }

const objects = (diff: SchemaDiff | null | undefined) => diff?.objects ?? []

/** Tabelas a desenhar: as atuais mais as removidas pela última execução (aparecem riscadas, como fantasmas). */
function tableNodes(schema: SchemaModel, diff?: SchemaDiff | null): TableNode[] {
  const byName = new Map((diff?.tables ?? []).map((t) => [t.name, t]))
  const triggerChanges = objects(diff).filter((o): o is Extract<ObjectChange, { kind: 'trigger' }> => o.kind === 'trigger')
  const triggersOf = (table: string) => triggerChanges.filter((o) => o.table === table)

  const nodes: TableNode[] = schema.tables.map((t) => {
    const change = byName.get(t.name)
    const tc = triggersOf(t.name)
    return {
      id: t.name,
      type: 'table',
      position: { x: 0, y: 0 },
      data: {
        table: t,
        status: change?.status,
        added: change?.status === 'changed' ? change.addedColumns : [],
        changed: Object.fromEntries((change?.changedColumns ?? []).map((c) => [c.name, c.aspects])),
        removed: change?.status === 'changed' ? change.removedColumns : [],
        triggerStatus: Object.fromEntries(tc.filter((o) => o.status !== 'removed').map((o) => [o.trigger.name, o.status])),
        removedTriggers: tc.filter((o) => o.status === 'removed').map((o) => o.trigger),
      },
    }
  })
  for (const change of diff?.tables ?? []) {
    if (change.status === 'removed') {
      nodes.push({
        id: change.name,
        type: 'table',
        position: { x: 0, y: 0 },
        data: { table: change.table, status: 'removed', added: [], changed: {}, removed: change.removedColumns, triggerStatus: {}, removedTriggers: [] },
      })
    }
  }
  return nodes
}

function viewNodes(schema: SchemaModel, diff?: SchemaDiff | null): ViewNode[] {
  const status = new Map(objects(diff).filter((o) => o.kind === 'view').map((o) => [o.id, o.status]))
  const nodes: ViewNode[] = schema.views.map((v) => ({ id: `view:${v.id}`, type: 'view', position: { x: 0, y: 0 }, data: { view: v, status: status.get(v.id) } }))
  for (const o of objects(diff)) {
    if (o.kind === 'view' && o.status === 'removed') {
      nodes.push({ id: `view:${o.id}`, type: 'view', position: { x: 0, y: 0 }, data: { view: o.view, status: 'removed' } })
    }
  }
  return nodes
}

const nodeHeight = (n: DiagramNode) =>
  n.type === 'view'
    ? HEADER_H + ROW_H * n.data.view.columns.length
    : HEADER_H +
      ROW_H *
        ((n.data.status === 'removed' ? 0 : n.data.table.columns.length) +
          n.data.removed.length +
          (n.data.status === 'removed' ? 0 : n.data.table.triggers.length) +
          n.data.removedTriggers.length)

async function layout(schema: SchemaModel, diff?: SchemaDiff | null): Promise<{ nodes: DiagramNode[]; edges: Edge[] }> {
  const nodes: DiagramNode[] = [...tableNodes(schema, diff), ...viewNodes(schema, diff)]
  const tableNames = new Set(schema.tables.map((t) => t.name))
  const nodeIds = new Set(nodes.map((n) => n.id))
  const newFks = new Set((diff?.tables ?? []).flatMap((t) => t.addedConstraints.filter((c) => c.kind === 'foreign').map((c) => `${t.name}:${c.definition}`)))

  const fkEdges: Edge[] = schema.tables.flatMap((t) =>
    t.constraints
      // Chave estrangeira para a própria tabela (categoria pai): sem seta, ela cruzaria o próprio cartão. O selo FK da coluna basta.
      .filter((c) => c.kind === 'foreign' && c.refTable && c.refTable !== t.name && tableNames.has(c.refTable))
      .map((c) => {
        const isNew = newFks.has(`${t.name}:${c.definition}`)
        const color = isNew ? '#34d399' : '#38bdf8'
        return {
          id: `${t.name}.${c.name}`,
          // A seta vai do lado "N" (tabela com a FK) para o lado "1" (tabela referenciada).
          source: t.name,
          target: c.refTable!,
          label: `${c.columns.join(', ')} → ${c.refColumns?.join(', ')}`,
          labelStyle: { fontSize: 10, fill: '#94a3b8' },
          labelBgStyle: { fill: '#0b1020' },
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: { stroke: color, strokeWidth: isNew ? 2.5 : 1 },
          animated: isNew,
        }
      }),
  )

  // Uma view aponta para as tabelas e views de que depende (tracejado).
  const viewEdges: Edge[] = nodes
    .filter((n): n is ViewNode => n.type === 'view')
    .flatMap((n) =>
      n.data.view.dependsOn
        .map((dep) => (nodeIds.has(dep) ? dep : `view:${dep}`))
        .filter((target) => nodeIds.has(target) && target !== n.id)
        .map((target) => ({
          id: `${n.id}->${target}`,
          source: n.id,
          target,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#a78bfa' },
          style: { stroke: '#a78bfa', strokeDasharray: '4 3' },
        })),
    )
  const edges = [...fkEdges, ...viewEdges]

  const laid = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
    },
    children: nodes.map((n) => ({ id: n.id, width: NODE_WIDTH, height: nodeHeight(n) })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  })

  for (const n of nodes) {
    const pos = laid.children?.find((c) => c.id === n.id)
    n.position = { x: pos?.x ?? 0, y: pos?.y ?? 0 }
  }
  return { nodes, edges }
}

interface Props {
  schema: SchemaModel
  /** O que a última execução mudou: colore tabelas, colunas, views, triggers e relações. */
  diff?: SchemaDiff | null
}

export function ErDiagram({ schema, diff }: Props) {
  const [graph, setGraph] = useState<{ nodes: DiagramNode[]; edges: Edge[] }>({ nodes: [], edges: [] })

  useEffect(() => {
    let stale = false
    layout(schema, diff).then((g) => {
      if (!stale) setGraph(g)
    })
    return () => {
      stale = true
    }
  }, [schema, diff])

  const hasDiff = !!diff && (diff.tables.length > 0 || diff.objects.some((o) => o.kind === 'view' || o.kind === 'trigger'))
  // O fitView só roda de novo quando o conjunto de nós muda.
  const flowKey = useMemo(() => [...graph.nodes.map((n) => n.id)].sort().join('|'), [graph.nodes])

  if (schema.tables.length === 0 && schema.views.length === 0 && !hasDiff) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-400">
        Nenhuma tabela ainda. Crie uma com CREATE TABLE e ela aparece aqui.
      </div>
    )
  }

  return (
    <div className="relative h-full" data-diagram>
      <ReactFlow
        key={flowKey}
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        colorMode="dark"
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
      {hasDiff && (
        <div className="pointer-events-none absolute left-2 top-2 flex gap-3 rounded bg-slate-950/80 px-2 py-1 text-[11px] text-slate-300">
          <span>🟩 novo</span>
          <span>🟨 alterado</span>
          <span>🟥 removido</span>
          <span className="text-slate-500">· da última execução</span>
        </div>
      )}
    </div>
  )
}

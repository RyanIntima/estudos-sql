import {
  matchingParen,
  nodeFirstChar,
  nodeTokenRange,
  parseSql,
  splitCommas,
  topKeywords,
  type AstNode,
  type Stmt,
} from './parse'

export interface Annotation {
  id: string
  statement: number
  /**
   * Nível de aninhamento: 0 = o comando todo; 1 = uma parte (cláusula, coluna, linha);
   * 2 = uma sub-parte (condição, JOIN, subconsulta); mais fundo = partes das subconsultas.
   */
  depth: number
  /** Intervalo no texto do editor, em caracteres. */
  from: number
  to: number
  /** Markdown curto. */
  text: string
  warn?: boolean
}

export type Explanation = { ok: true; annotations: Annotation[] } | { ok: false; message: string }

interface Ctx {
  sql: string
  stmt: Stmt
  pos: (byte: number) => number
  add: (depth: number, from: number, to: number, text: string, warn?: boolean) => void
  /** Nomes das CTEs já declaradas neste comando: um FROM com esse nome lê a CTE, não uma tabela. */
  ctes: Set<string>
}

const code = (s: string) => '`' + s.replace(/`/g, "'") + '`'
const names = (list: AstNode[] | undefined): string[] => (list ?? []).map((x) => x.String?.sval).filter(Boolean)
const tokensOf = (ctx: Ctx) => ctx.stmt.tokens

/** Texto de um nó da AST, tal como o aluno escreveu. */
function txt(ctx: Ctx, node: AstNode): string {
  const r = node && nodeTokenRange(node, ctx.stmt, ctx.pos)
  if (!r) return '…'
  const tk = tokensOf(ctx)
  return ctx.sql.slice(tk[r[0]].start, tk[r[1] - 1].end)
}

/** Registra uma anotação cobrindo os tokens [a, b). */
function addTokens(ctx: Ctx, depth: number, a: number, b: number, text: string, warn?: boolean) {
  const tk = tokensOf(ctx)
  if (a >= b) return
  ctx.add(depth, tk[a].start, tk[b - 1].end, text, warn)
}

// ---------------------------------------------------------------------------
// Tipos, colunas e regras
// ---------------------------------------------------------------------------

function describeType(ctx: Ctx, typeName: AstNode): string {
  const n = names(typeName?.names)
  const base = n[n.length - 1] ?? ''
  const mods: string[] = (typeName?.typmods ?? []).map((m: AstNode) => txt(ctx, m))
  const shown = typeName ? code(txt(ctx, typeName)) : code(base)
  const friendly: Record<string, string> = {
    int4: 'número inteiro',
    int2: 'número inteiro pequeno',
    int8: 'número inteiro grande',
    serial: 'número inteiro com **contador automático** (SERIAL)',
    bigserial: 'número inteiro grande com **contador automático**',
    float4: 'número de ponto flutuante (aproximado; **não use para dinheiro**)',
    float8: 'número de ponto flutuante (aproximado; **não use para dinheiro**)',
    text: 'texto de tamanho livre',
    bool: 'verdadeiro ou falso',
    date: 'data',
    time: 'hora',
    timestamp: 'data e hora',
    timestamptz: 'data e hora com fuso horário',
    interval: 'intervalo de tempo',
    uuid: 'identificador único universal',
    jsonb: 'documento JSON',
    json: 'documento JSON',
  }
  let d = friendly[base]
  if (base === 'numeric') {
    d =
      mods.length === 2
        ? `número decimal **exato**: ${mods[0]} dígitos no total, ${mods[1]} depois da vírgula (ideal para dinheiro)`
        : mods.length === 1
          ? `número decimal **exato** com até ${mods[0]} dígitos`
          : 'número decimal **exato**'
  } else if (base === 'varchar') {
    d = mods.length ? `texto de **até ${mods[0]}** caracteres` : 'texto de tamanho livre'
  } else if (base === 'bpchar') {
    d = `texto de tamanho fixo${mods.length ? ` (${mods[0]})` : ''}`
  }
  return `${d ?? 'tipo'} (${shown})`
}

const FK_ACTION: Record<string, string> = {
  c: 'ao apagar a linha referenciada, as linhas que apontam para ela são **apagadas junto** (`CASCADE`)',
  n: 'ao apagar a linha referenciada, este campo vira `NULL` (`SET NULL`)',
  d: 'ao apagar a linha referenciada, este campo volta ao valor padrão (`SET DEFAULT`)',
  r: 'o banco **impede** apagar a linha referenciada enquanto houver linhas apontando para ela',
  a: 'o banco **impede** apagar a linha referenciada enquanto houver linhas apontando para ela',
}

function describeColumnConstraint(ctx: Ctx, c: AstNode): string | null {
  switch (c.contype) {
    case 'CONSTR_NOTNULL':
      return '**obrigatória** (`NOT NULL`)'
    case 'CONSTR_NULL':
      return 'aceita vazio (`NULL`)'
    case 'CONSTR_DEFAULT':
      return `valor padrão ${code(txt(ctx, c.raw_expr))}`
    case 'CONSTR_PRIMARY':
      return '**chave primária**: identifica cada linha (única e nunca vazia)'
    case 'CONSTR_UNIQUE':
      return 'valores **únicos** (não podem se repetir)'
    case 'CONSTR_CHECK':
      return `só aceita valores que cumprem ${code(txt(ctx, c.raw_expr))}`
    case 'CONSTR_IDENTITY':
      return `gera o valor **automaticamente** (\`IDENTITY\`${c.generated_when === 'a' ? ', sempre' : ''})`
    case 'CONSTR_FOREIGN': {
      const target = `${c.pktable?.relname}(${names(c.pk_attrs).join(', ')})`
      const act = FK_ACTION[c.fk_del_action] ? `; ${FK_ACTION[c.fk_del_action]}` : ''
      return `**chave estrangeira**: só aceita valores que existem em ${code(target)}${act}`
    }
    default:
      return null
  }
}

function describeColumnDef(ctx: Ctx, cd: AstNode): string {
  const parts = [`coluna ${code(cd.colname)}: ${describeType(ctx, cd.typeName)}`]
  for (const c of cd.constraints ?? []) {
    const d = describeColumnConstraint(ctx, c.Constraint)
    if (d) parts.push(d)
  }
  return parts.join(' · ')
}

/** Regra declarada à parte (PRIMARY KEY (a, b), FOREIGN KEY …, UNIQUE (…), CHECK (…)). */
function describeTableConstraint(ctx: Ctx, c: AstNode): string {
  const keys = names(c.keys ?? c.fk_attrs).join(', ')
  const named = c.conname ? ` (nome: ${code(c.conname)})` : ''
  switch (c.contype) {
    case 'CONSTR_PRIMARY':
      return `**chave primária** em ${code(keys)}: a combinação identifica cada linha${named}`
    case 'CONSTR_UNIQUE':
      return `**unicidade** em ${code(keys)}: a combinação não pode se repetir${named}`
    case 'CONSTR_FOREIGN': {
      const act = FK_ACTION[c.fk_del_action] ? `; ${FK_ACTION[c.fk_del_action]}` : ''
      return `**chave estrangeira**: ${code(keys)} aponta para ${code(`${c.pktable?.relname}(${names(c.pk_attrs).join(', ')})`)}${act}${named}`
    }
    case 'CONSTR_CHECK':
      return `**regra** ${code(txt(ctx, c.raw_expr))}: toda linha precisa cumpri-la${named}`
    default:
      return `regra da tabela${named}`
  }
}

// ---------------------------------------------------------------------------
// Condições (WHERE / HAVING / ON)
// ---------------------------------------------------------------------------

const COMPARE: Record<string, string> = {
  '=': 'é igual a',
  '<>': 'é diferente de',
  '!=': 'é diferente de',
  '<': 'é menor que',
  '<=': 'é menor ou igual a',
  '>': 'é maior que',
  '>=': 'é maior ou igual a',
}

/** Resumo de um operando: subconsultas são longas demais para repetir inteiras. */
const operand = (ctx: Ctx, node: AstNode) => (node?.SubLink ? 'o resultado de uma **subconsulta**' : code(txt(ctx, node)))

function describeLeaf(ctx: Ctx, node: AstNode): { text: string; warn?: boolean } {
  if (node.A_Expr) {
    const e = node.A_Expr
    const op: string = names(e.name)[0] ?? ''
    const l = operand(ctx, e.lexpr)
    switch (e.kind) {
      case 'AEXPR_OP': {
        if (COMPARE[op]) {
          if (e.rexpr?.A_Const?.isnull) {
            return { text: `${l} ${COMPARE[op]} \`NULL\`. ⚠ Nada é igual a \`NULL\`: essa condição **nunca** é verdadeira. Use \`IS NULL\` / \`IS NOT NULL\`.`, warn: true }
          }
          return { text: `${l} ${COMPARE[op]} ${operand(ctx, e.rexpr)}` }
        }
        break
      }
      case 'AEXPR_LIKE':
      case 'AEXPR_ILIKE': {
        const neg = op.startsWith('!')
        const ci = e.kind === 'AEXPR_ILIKE' ? ', ignorando maiúsculas/minúsculas' : ''
        return {
          text: `o texto de ${l} ${neg ? '**não** casa' : 'casa'} com o padrão ${code(txt(ctx, e.rexpr))}${ci} (\`%\` vale por qualquer sequência de caracteres, \`_\` por um só)`,
        }
      }
      case 'AEXPR_IN': {
        const items = (e.rexpr?.List?.items ?? []).map((i: AstNode) => code(txt(ctx, i)))
        return { text: `${l} ${op === '<>' ? '**não** é nenhum' : 'é um'} dos valores ${items.join(', ')}` }
      }
      case 'AEXPR_DISTINCT':
      case 'AEXPR_NOT_DISTINCT': {
        const not = e.kind === 'AEXPR_NOT_DISTINCT'
        return {
          text: `${l} ${not ? 'é **igual**' : 'é **diferente**'} ${not ? 'a' : 'de'} ${operand(ctx, e.rexpr)}, tratando \`NULL\` como um valor comparável (\`IS ${not ? 'NOT ' : ''}DISTINCT FROM\`; com \`<>\`, qualquer comparação com \`NULL\` daria "desconhecido")`,
        }
      }
      case 'AEXPR_BETWEEN':
      case 'AEXPR_NOT_BETWEEN': {
        const [lo, hi] = (e.rexpr?.List?.items ?? []).map((i: AstNode) => code(txt(ctx, i)))
        return { text: `${l} ${e.kind === 'AEXPR_NOT_BETWEEN' ? '**não** está' : 'está'} entre ${lo} e ${hi} (limites incluídos)` }
      }
    }
  }
  if (node.NullTest) {
    const arg = code(txt(ctx, node.NullTest.arg))
    return { text: node.NullTest.nulltesttype === 'IS_NULL' ? `${arg} está vazio (\`NULL\`)` : `${arg} tem valor (não é \`NULL\`)` }
  }
  if (node.BoolExpr?.boolop === 'NOT_EXPR') {
    return { text: `**não** vale: ${describeLeaf(ctx, node.BoolExpr.args[0]).text}` }
  }
  if (node.SubLink) {
    const s = node.SubLink
    switch (s.subLinkType) {
      case 'EXISTS_SUBLINK':
        return { text: 'a **subconsulta devolve pelo menos uma linha** (`EXISTS`)' }
      case 'ANY_SUBLINK':
        return { text: `${code(txt(ctx, s.testexpr))} está entre os valores que a **subconsulta** devolve (\`IN\`)` }
      default:
        return { text: 'usa o resultado de uma **subconsulta**' }
    }
  }
  return { text: `a condição ${code(txt(ctx, node))}` }
}

/** Explica a cláusula de filtro [kwIdx, end) e cada condição que a compõe. */
function explainFilter(ctx: Ctx, kind: 'WHERE' | 'HAVING', node: AstNode, kwIdx: number, end: number, level: number) {
  const intro = kind === 'WHERE' ? 'Mantém só as linhas em que' : 'Mantém só os **grupos** em que'
  const bool = node.BoolExpr
  if (bool && (bool.boolop === 'AND_EXPR' || bool.boolop === 'OR_EXPR')) {
    const all = bool.boolop === 'AND_EXPR'
    addTokens(
      ctx,
      level,
      kwIdx,
      end,
      `${kind === 'WHERE' ? 'Mantém só as linhas' : 'Mantém só os **grupos**'} que cumprem ${all ? '**todas** as condições (`AND`)' : '**pelo menos uma** das condições (`OR`)'}:`,
    )
    for (const arg of bool.args) {
      const r = nodeTokenRange(arg, ctx.stmt, ctx.pos)
      if (!r) continue
      const d = describeLeaf(ctx, arg)
      addTokens(ctx, level + 1, r[0], r[1], d.text, d.warn)
    }
    return
  }
  const d = describeLeaf(ctx, node)
  addTokens(ctx, level, kwIdx, end, `${intro} ${d.text}.`, d.warn)
}

// ---------------------------------------------------------------------------
// SELECT: por escopo (um SELECT e a sua faixa de tokens), com recursão
// ---------------------------------------------------------------------------

const AGG = new Set(['count', 'sum', 'avg', 'min', 'max'])
const AGG_WORD: Record<string, string> = { sum: 'a **soma**', avg: 'a **média**', min: 'o **menor** valor', max: 'o **maior** valor' }

const WINDOW_WORD: Record<string, string> = {
  row_number: '**numera** as linhas (1, 2, 3…)',
  rank: 'dá a **posição**; empatados dividem a posição e a seguinte **pula** números (1, 2, 2, 4)',
  dense_rank: 'dá a **posição**; empatados dividem a posição e a seguinte **não pula** (1, 2, 2, 3)',
  lag: 'traz o valor da linha **anterior**',
  lead: 'traz o valor da linha **seguinte**',
  first_value: 'traz o **primeiro** valor da janela',
  last_value: 'traz o **último** valor da janela',
  ntile: 'divide as linhas em **faixas** de tamanho igual',
  sum: 'soma',
  avg: 'tira a média',
  count: 'conta',
  min: 'acha o menor valor',
  max: 'acha o maior valor',
}

/** Função de janela: o que faz, sobre qual partição, em que ordem. */
function describeWindow(ctx: Ctx, f: AstNode): string {
  const fn = names(f.funcname).join('.').toLowerCase()
  const part = ((f.over.partitionClause ?? []) as AstNode[]).map((p) => code(txt(ctx, p)))
  const order = ((f.over.orderClause ?? []) as AstNode[]).map((s) => `${code(txt(ctx, s.SortBy.node))}${s.SortBy.sortby_dir === 'SORTBY_DESC' ? ' (decrescente)' : ''}`)
  const aggregate = ['sum', 'avg', 'count', 'min', 'max'].includes(fn)
  const what = WINDOW_WORD[fn] ?? `calcula ${code(fn + '()')}`
  const scope = part.length ? `**dentro de cada grupo** de ${part.join(', ')} (a numeração/cálculo recomeça a cada grupo)` : 'sobre **todas as linhas** do resultado'
  const ord = order.length ? `; ordenado por ${order.join(', ')}${aggregate ? ', **acumulando até a linha atual**' : ''}` : ''
  const arg = f.args?.length && !f.agg_star ? ` de ${code(txt(ctx, f.args[0]))}` : ''
  return `uma **função de janela**: ${what}${arg}, ${scope}${ord}. **Cada linha continua aparecendo**: a janela não junta linhas como o \`GROUP BY\``
}

function describeFunc(ctx: Ctx, f: AstNode): string {
  const fn = names(f.funcname).join('.')
  const lower = fn.toLowerCase()
  if (f.over) return describeWindow(ctx, f)
  if (lower === 'count') {
    if (f.agg_star) return 'a contagem de **linhas** (`COUNT(*)`) de cada grupo, ou do resultado todo se não houver `GROUP BY`'
    const arg = code(txt(ctx, f.args?.[0]))
    return f.agg_distinct
      ? `quantos valores **distintos** de ${arg} existem (\`COUNT(DISTINCT ...)\`)`
      : `quantas linhas têm ${arg} **preenchido** (\`COUNT(coluna)\` ignora \`NULL\`)`
  }
  if (AGG.has(lower)) return `${AGG_WORD[lower]} de ${code(txt(ctx, f.args?.[0]))} em cada grupo (ou no resultado todo, sem \`GROUP BY\`)`
  // Uma função que envolve outra (round(avg(x) OVER (...), 2)): descreve também a de dentro, que costuma ser o que importa.
  const inner = ((f.args ?? []) as AstNode[]).find((a) => a.FuncCall)
  if (inner) return `o resultado da função ${code(fn + '()')}, aplicada sobre ${describeFunc(ctx, inner.FuncCall)}`
  return `o resultado da função ${code(fn + '()')}`
}

function describeTarget(ctx: Ctx, rt: AstNode): string {
  const val = rt.val
  const t = code(txt(ctx, val))
  let base: string
  if (val.ColumnRef) {
    const fields = val.ColumnRef.fields as AstNode[]
    const tables = names(fields)
    base = fields.some((f) => f.A_Star)
      ? tables.length ? `todas as colunas de ${code(tables[0])}` : 'todas as colunas'
      : `a coluna ${code(tables.join('.'))}`
  } else if (val.A_Const) {
    base = val.A_Const.isnull ? 'o valor vazio (`NULL`)' : `um valor fixo: ${t}`
  } else if (val.A_Expr) {
    base = `um cálculo: ${t}`
  } else if (val.FuncCall) {
    base = describeFunc(ctx, val.FuncCall)
  } else if (val.CaseExpr) {
    const whens = (val.CaseExpr.args as AstNode[]).map((w) => `- ${code(txt(ctx, w.CaseWhen.expr))} → ${code(txt(ctx, w.CaseWhen.result))}`)
    if (val.CaseExpr.defresult) whens.push(`- senão → ${code(txt(ctx, val.CaseExpr.defresult))}`)
    base = `uma **decisão** (\`CASE\`): para cada linha vale o **primeiro** \`WHEN\` verdadeiro:\n${whens.join('\n')}`
  } else if (val.CoalesceExpr) {
    base = `o primeiro valor **não vazio** entre ${(val.CoalesceExpr.args as AstNode[]).map((a) => code(txt(ctx, a))).join(', ')} (\`COALESCE\`)`
  } else if (val.TypeCast) {
    base = `${code(txt(ctx, val.TypeCast.arg))} **convertido** para o tipo ${code(names(val.TypeCast.typeName.names).pop() ?? '')}`
  } else if (val.SubLink) {
    base = 'o resultado de uma **subconsulta** (um único valor)'
  } else {
    base = `a expressão ${t}`
  }
  const alias = rt.name ? `${base.includes('\n') ? '\n\nO resultado aparece' : ', que aparece no resultado'} com o nome ${code(rt.name)}` : ''
  return `Mostra ${base}${alias}${base.includes('\n') && !rt.name ? '' : '.'}`
}

const JOIN_TEXT: Record<string, string> = {
  JOIN_INNER: '`INNER JOIN`: só ficam as linhas que têm **par nas duas tabelas**',
  JOIN_LEFT: '`LEFT JOIN`: ficam **todas** as linhas da tabela da esquerda; sem par, as colunas da direita vêm `NULL`',
  JOIN_RIGHT: '`RIGHT JOIN`: ficam **todas** as linhas da tabela da direita; sem par, as colunas da esquerda vêm `NULL`',
  JOIN_FULL: '`FULL JOIN`: ficam **todas** as linhas das duas tabelas, com `NULL` onde não há par',
}

function tableLabel(from: AstNode): string {
  if (from.RangeVar) {
    const r = from.RangeVar
    return code(r.alias ? `${r.relname} ${r.alias.aliasname}` : r.relname)
  }
  if (from.JoinExpr) return `${tableLabel(from.JoinExpr.larg)} + ${tableLabel(from.JoinExpr.rarg)}`
  if (from.RangeSubselect) return from.RangeSubselect.alias ? `a subconsulta ${code(from.RangeSubselect.alias.aliasname)}` : 'uma subconsulta'
  return 'uma tabela'
}

/** Cada JoinExpr, na ordem em que aparecem no texto (a árvore é aninhada à esquerda). */
function flattenJoins(n: AstNode): AstNode[] {
  return n.JoinExpr ? [...flattenJoins(n.JoinExpr.larg), n.JoinExpr] : []
}

const firstTable = (n: AstNode): AstNode => (n.JoinExpr ? firstTable(n.JoinExpr.larg) : n)

function explainFrom(ctx: Ctx, from: AstNode[], a: number, end: number, level: number) {
  const tk = tokensOf(ctx)
  if (from.length === 1 && from[0].RangeVar) {
    const r = from[0].RangeVar
    const what = ctx.ctes.has(r.relname) ? `o resultado da **CTE** ${code(r.relname)}` : `as linhas da tabela ${code(r.relname)}`
    return addTokens(ctx, level, a, end, `Lê ${what}${r.alias ? ` (apelidada de ${code(r.alias.aliasname)})` : ''}.`)
  }
  if (from.length === 1 && from[0].RangeSubselect) {
    return addTokens(ctx, level, a, end, `Lê o resultado de ${tableLabel(from[0])} como se fosse uma tabela.`)
  }
  if (from.length === 1 && from[0].JoinExpr) {
    const joins = flattenJoins(from[0])
    addTokens(ctx, level, a, end, `Parte de ${tableLabel(firstTable(from[0]))} e **combina linhas de várias tabelas** (${joins.length} ${joins.length === 1 ? '`JOIN`' : '`JOIN`s'}).`)
    // Cada JOIN começa nas palavras que o antecedem (INNER, LEFT, OUTER…) e vai até o próximo.
    const kws = topKeywords(tk, a, end).filter((i) => tk[i].upper === 'JOIN')
    if (kws.length !== joins.length) return
    const MODS = new Set(['INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'NATURAL'])
    const starts = kws.map((k) => {
      let s = k
      while (s - 1 >= a && MODS.has(tk[s - 1].upper)) s--
      return s
    })
    joins.forEach((j, i) => {
      const e = joins[i].quals ? txt(ctx, joins[i].quals) : null
      const cond = e ? ` pela condição ${code(e)}` : j.usingClause ? ` pelas colunas ${code(names(j.usingClause).join(', '))}` : ''
      addTokens(ctx, level + 1, starts[i], starts[i + 1] ?? end, `Junta ${tableLabel(j.rarg)}${cond}. ${JOIN_TEXT[j.jointype] ?? ''}`)
    })
    return
  }
  addTokens(ctx, level, a, end, `Combina as tabelas ${from.map(tableLabel).join(', ')} (sem condição de ligação, cada linha de uma se junta com **todas** as da outra).`)
}

interface ClauseStart {
  name: string
  idx: number
  bodyFrom: number
}

function clauseStarts(tk: Stmt['tokens'], a: number, b: number): ClauseStart[] {
  const out: ClauseStart[] = []
  for (const i of topKeywords(tk, a, b)) {
    const u = tk[i].upper
    const next = tk[i + 1]?.upper
    if (['SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET'].includes(u)) out.push({ name: u, idx: i, bodyFrom: i + 1 })
    else if ((u === 'GROUP' || u === 'ORDER') && next === 'BY') out.push({ name: `${u} BY`, idx: i, bodyFrom: i + 2 })
  }
  return out
}

/** Cláusulas de um SELECT simples; `only` restringe às que pertencem a outro nível (ORDER BY/LIMIT de um UNION). */
function explainClauses(ctx: Ctx, sel: AstNode, a: number, b: number, level: number, only?: Set<string>) {
  const tk = tokensOf(ctx)
  const starts = clauseStarts(tk, a, b)
  const endOf = (c: ClauseStart) => starts.find((s) => s.idx > c.idx)?.idx ?? b

  for (const c of starts) {
    if (only && !only.has(c.name)) continue
    const end = endOf(c)
    switch (c.name) {
      case 'SELECT': {
        const distinct = tk[c.bodyFrom]?.upper === 'DISTINCT'
        const from = distinct ? c.bodyFrom + 1 : c.bodyFrom
        const items = splitCommas(tk, from, end)
        const targets: AstNode[] = sel.targetList ?? []
        if (distinct) addTokens(ctx, level, c.bodyFrom, c.bodyFrom + 1, 'Remove as linhas **repetidas** do resultado (`DISTINCT`).')
        if (items.length === targets.length) {
          items.forEach(([x, y], i) => addTokens(ctx, level, x, y, describeTarget(ctx, targets[i].ResTarget)))
        }
        break
      }
      case 'FROM':
        if (sel.fromClause?.length) explainFrom(ctx, sel.fromClause, c.idx, end, level)
        break
      case 'WHERE':
        if (sel.whereClause) explainFilter(ctx, 'WHERE', sel.whereClause, c.idx, end, level)
        break
      case 'GROUP BY':
        addTokens(ctx, level, c.idx, end, `Agrupa as linhas por ${code(ctx.sql.slice(tk[c.bodyFrom].start, tk[end - 1].end))}: cada grupo vira **uma** linha no resultado.`)
        break
      case 'HAVING':
        if (sel.havingClause) explainFilter(ctx, 'HAVING', sel.havingClause, c.idx, end, level)
        break
      case 'ORDER BY': {
        const sorts: AstNode[] = sel.sortClause ?? []
        const items = splitCommas(tk, c.bodyFrom, end)
        const one = (s: AstNode, x: number, y: number) => {
          const sb = s.SortBy
          const dir = sb.sortby_dir === 'SORTBY_DESC' ? 'do maior para o menor (Z → A, mais novo → mais antigo)' : 'do menor para o maior (A → Z, mais antigo → mais novo)'
          const nulls = sb.sortby_nulls === 'SORTBY_NULLS_FIRST' ? '; valores vazios primeiro' : sb.sortby_nulls === 'SORTBY_NULLS_LAST' ? '; valores vazios por último' : ''
          return { x, y, text: `${code(txt(ctx, sb.node))}, ${dir}${nulls}` }
        }
        if (items.length === sorts.length && sorts.length) {
          const rows = sorts.map((s, i) => one(s, items[i][0], items[i][1]))
          addTokens(ctx, level, c.idx, end, rows.length === 1 ? `Ordena o resultado por ${rows[0].text}.` : 'Ordena o resultado por vários critérios, na ordem:')
          if (rows.length > 1) rows.forEach((r) => addTokens(ctx, level + 1, r.x, r.y, r.text))
        }
        break
      }
      case 'LIMIT':
        if (sel.limitCount && !sel.limitCount.A_Const?.isnull) {
          addTokens(ctx, level, c.idx, end, `Devolve **no máximo ${code(txt(ctx, sel.limitCount))}** linha(s).`)
        }
        break
      case 'OFFSET':
        if (sel.limitOffset) addTokens(ctx, level, c.idx, end, `**Pula** as ${code(txt(ctx, sel.limitOffset))} primeiras linhas antes de começar a devolver (base da paginação).`)
        break
    }
  }
}

/**
 * SELECTs que aparecem DENTRO de expressões ou do FROM deste escopo, sem descer neles.
 * `skip` vale só para as chaves do próprio dono (withClause/larg/rarg de um SELECT): mais abaixo,
 * `larg`/`rarg` são os lados de um JoinExpr e precisam ser percorridos.
 */
function collectSubselects(node: AstNode, skip: Set<string>, out: AstNode[] = [], top = true): AstNode[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collectSubselects(n, skip, out, false))
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, AstNode>)) {
      if (top && skip.has(k)) continue
      if (k === 'SubLink' && v.subselect?.SelectStmt) out.push(v.subselect.SelectStmt)
      else if (k === 'RangeSubselect' && v.subquery?.SelectStmt) out.push(v.subquery.SelectStmt)
      else collectSubselects(v, skip, out, false)
    }
  }
  return out
}

const SUBQUERY_HEAD = new Set(['SELECT', 'WITH', 'VALUES'])

/** Grupos `( SELECT … )` mais externos dentro de [a, b). */
function subqueryGroups(ctx: Ctx, a: number, b: number): { open: number; close: number }[] {
  const tk = tokensOf(ctx)
  const out: { open: number; close: number }[] = []
  for (let i = a; i < b; i++) {
    if (tk[i].text === '(' && SUBQUERY_HEAD.has(tk[i + 1]?.upper)) {
      const close = matchingParen(tk, i)
      out.push({ open: i, close })
      i = close
    }
  }
  return out
}

function subqueryLabel(ctx: Ctx, open: number): string {
  const tk = tokensOf(ctx)
  const prev = tk[open - 1]?.upper
  const prev2 = tk[open - 2]?.upper
  if (prev === 'EXISTS') return prev2 === 'NOT' ? '**Subconsulta** de `NOT EXISTS`: a condição vale se ela **não** devolver nenhuma linha. Se ela usa colunas da consulta de fora, é executada **para cada linha** (subconsulta correlacionada)' : '**Subconsulta** de `EXISTS`: a condição vale se ela devolver **pelo menos uma linha**. Se ela usa colunas da consulta de fora, é executada **para cada linha** (subconsulta correlacionada)'
  if (prev === 'IN') return '**Subconsulta** de `IN`: devolve a **lista de valores** com a qual a coluna é comparada'
  if (prev === 'FROM' || prev === 'JOIN' || prev === ',') return '**Tabela derivada**: o resultado desta subconsulta é usado como se fosse uma tabela'
  return '**Subconsulta escalar**: devolve **um único valor**, usado dentro da expressão'
}

function explainValuesNode(ctx: Ctx, sel: AstNode, a: number, b: number, level: number) {
  const rows = sel.valuesLists?.length ?? 0
  const cols = sel.valuesLists?.[0]?.List?.items?.length ?? 0
  addTokens(ctx, level, a, b, `**Lista de valores fixos** (\`VALUES\`): ${rows} ${rows === 1 ? 'linha' : 'linhas'} de ${cols} ${cols === 1 ? 'coluna' : 'colunas'}, usadas como se fossem uma tabela temporária.`)
}

/** Explica, dentro de [a, b), cada subconsulta entre parênteses, com as próprias cláusulas. */
function explainSubqueries(ctx: Ctx, owner: AstNode, a: number, b: number, level: number) {
  const nodes = collectSubselects(owner, new Set(['withClause', 'larg', 'rarg']))
  if (!nodes.length) return
  for (const g of subqueryGroups(ctx, a, b)) {
    const open = ctx.stmt.tokens[g.open].start
    const close = ctx.stmt.tokens[g.close].end
    // O nó cuja primeira marca de posição cai dentro dos parênteses é o dono do grupo.
    const node = nodes.find((n) => {
      const p = nodeFirstChar(n, ctx.pos)
      return p !== null && p > open && p < close
    })
    if (!node) continue
    if (node.valuesLists) {
      explainValuesNode(ctx, node, g.open, g.close + 1, level + 1)
      continue
    }
    addTokens(ctx, level + 1, g.open, g.close + 1, subqueryLabel(ctx, g.open))
    explainScope(ctx, node, g.open + 1, g.close, level + 2)
  }
}

function leavesOf(sel: AstNode): AstNode[] {
  return sel.op && sel.op !== 'SETOP_NONE' ? [...leavesOf(sel.larg), ...leavesOf(sel.rarg)] : [sel]
}

const SET_OP_TEXT: Record<string, string> = {
  UNION: 'mantendo **uma cópia** de cada linha repetida (`UNION`)',
  'UNION ALL': 'mantendo **todas** as linhas, inclusive as repetidas (`UNION ALL`)',
  INTERSECT: 'ficando só com as linhas que aparecem **nas duas** (`INTERSECT`)',
  EXCEPT: 'ficando com as linhas da primeira que **não** aparecem na segunda (`EXCEPT`)',
}

function explainSetOp(ctx: Ctx, sel: AstNode, a: number, b: number, level: number, labels?: string[]) {
  const tk = tokensOf(ctx)
  const leaves = leavesOf(sel)
  const ops = topKeywords(tk, a, b).filter((i) => ['UNION', 'INTERSECT', 'EXCEPT'].includes(tk[i].upper))
  if (ops.length + 1 !== leaves.length) return
  const opEnd = (i: number) => i + 1 + (['ALL', 'DISTINCT'].includes(tk[i + 1]?.upper) ? 1 : 0)
  // ORDER BY / LIMIT depois do último operador pertencem ao conjunto, não ao último SELECT.
  const last = ops[ops.length - 1]
  const tail = topKeywords(tk, opEnd(last), b).find((i) => ['ORDER', 'LIMIT', 'OFFSET', 'FETCH'].includes(tk[i].upper)) ?? b

  leaves.forEach((leaf, k) => {
    const from = k === 0 ? a : opEnd(ops[k - 1])
    const to = k === ops.length ? tail : ops[k]
    addTokens(ctx, level, from, to, labels?.[k] ?? `**Consulta ${k + 1}** de ${leaves.length}`)
    explainScope(ctx, leaf, from, to, level + 1)
  })
  ops.forEach((i) => {
    const all = tk[i + 1]?.upper === 'ALL'
    const word = tk[i].upper
    addTokens(ctx, level, i, opEnd(i), `**${word}${all ? ' ALL' : ''}**: empilha os resultados das consultas, ${SET_OP_TEXT[all ? `${word} ALL` : word]}. As consultas precisam ter o **mesmo número de colunas**, de tipos compatíveis.`)
  })
  explainClauses(ctx, sel, tail, b, level, new Set(['ORDER BY', 'LIMIT', 'OFFSET']))
}

function explainWith(ctx: Ctx, sel: AstNode, a: number, level: number): number {
  const tk = tokensOf(ctx)
  const ctes: AstNode[] = sel.withClause.ctes
  for (const c of ctes) ctx.ctes.add(c.CommonTableExpr.ctename)
  // O SELECT principal é o primeiro SELECT fora de parênteses: tudo antes dele é a região do WITH.
  const stop = topKeywords(tk, a, tk.length).find((i) => ['SELECT', 'VALUES'].includes(tk[i].upper)) ?? tk.length
  const groups = subqueryGroups(ctx, a, stop)
  if (groups.length === ctes.length) {
    ctes.forEach((c, k) => {
      const cte = c.CommonTableExpr
      const g = groups[k]
      // O nome da CTE vem logo antes do AS (e da lista de colunas, se houver).
      let nameIdx = g.open
      while (nameIdx > a && tk[nameIdx].text.toLowerCase() !== String(cte.ctename).toLowerCase()) nameIdx--
      const recursive = sel.withClause.recursive && cte.ctequery?.SelectStmt?.op !== 'SETOP_NONE'
      addTokens(
        ctx,
        level,
        nameIdx,
        g.close + 1,
        `**CTE ${code(cte.ctename)}**: uma consulta com **nome**, usada abaixo como se fosse uma tabela${recursive ? ' (**recursiva**: ela se refere a si mesma)' : ''}.`,
      )
      const body = cte.ctequery?.SelectStmt
      if (body) explainScope(ctx, body, g.open + 1, g.close, level + 1, recursive ? ['**Âncora**: o ponto de partida, executado uma vez', '**Passo recursivo**: repetido, usando as linhas do passo anterior, até não devolver nada'] : undefined)
    })
  }
  return stop
}

/** Explica um SELECT (e o que há dentro dele) no intervalo de tokens [a, b). */
function explainScope(ctx: Ctx, sel: AstNode, a: number, b: number, level: number, labels?: string[]) {
  let start = a
  if (sel.withClause) start = explainWith(ctx, sel, a, level)
  if (sel.op && sel.op !== 'SETOP_NONE') return explainSetOp(ctx, sel, start, b, level, labels)
  if (sel.valuesLists) return explainValuesNode(ctx, sel, start, b, level)
  explainClauses(ctx, sel, start, b, level)
  explainSubqueries(ctx, sel, start, b, level)
}

function explainSelect(ctx: Ctx) {
  const tk = tokensOf(ctx)
  addTokens(ctx, 0, 0, tk.length, '**Consulta** (`SELECT`): lê dados e devolve uma tabela de resultado. **Não altera nada** no banco.')
  explainScope(ctx, ctx.stmt.node, 0, tk.length, 1)
}

// ---------------------------------------------------------------------------
// Outros comandos
// ---------------------------------------------------------------------------

function explainCreateTable(ctx: Ctx) {
  const { stmt } = ctx
  const n = stmt.node
  addTokens(ctx, 0, 0, stmt.tokens.length, `**Cria a tabela ${code(n.relation.relname)}**: define a estrutura (colunas, tipos e regras). A tabela nasce **vazia**.`)
  const elts: AstNode[] = n.tableElts ?? []
  const open = stmt.tokens.findIndex((t) => t.text === '(')
  if (open < 0 || !elts.length) return
  const items = splitCommas(stmt.tokens, open + 1, matchingParen(stmt.tokens, open))
  if (items.length !== elts.length) return
  items.forEach(([a, b], i) => {
    const e = elts[i]
    if (e.ColumnDef) addTokens(ctx, 1, a, b, describeColumnDef(ctx, e.ColumnDef))
    else if (e.Constraint) addTokens(ctx, 1, a, b, describeTableConstraint(ctx, e.Constraint))
  })
}

function describeAlterCmd(ctx: Ctx, cmd: AstNode, table: string): string {
  const col = cmd.name ? code(cmd.name) : ''
  switch (cmd.subtype) {
    case 'AT_AddColumn':
      return `Acrescenta uma **nova** ${describeColumnDef(ctx, cmd.def.ColumnDef)}. Nas linhas que já existem, ela começa vazia (ou com o padrão).`
    case 'AT_DropColumn':
      return `**Apaga** a coluna ${col} e todos os dados dela. ⚠ Não há desfazer.`
    case 'AT_ColumnDefault':
      return cmd.def ? `Define o valor padrão de ${col}: ${code(txt(ctx, cmd.def))}. Vale para os próximos \`INSERT\` que não informarem a coluna.` : `Remove o valor padrão de ${col}.`
    case 'AT_SetNotNull':
      return `Torna ${col} **obrigatória** (\`NOT NULL\`). Falha se já houver linhas com essa coluna vazia.`
    case 'AT_DropNotNull':
      return `Deixa ${col} **opcional**: passa a aceitar vazio (\`NULL\`).`
    case 'AT_AlterColumnType':
      return `Muda o tipo de ${col} para ${describeType(ctx, cmd.def.ColumnDef.typeName)}. Os dados existentes são convertidos.`
    case 'AT_AddConstraint':
      return `Acrescenta uma regra à tabela ${code(table)}: ${describeTableConstraint(ctx, cmd.def.Constraint)}. O banco confere as linhas que já existem.`
    case 'AT_DropConstraint':
      return `Remove a regra ${code(cmd.name)} da tabela ${code(table)}.`
    case 'AT_AddIdentity':
      return `Faz ${col} **gerar o próprio valor** automaticamente (\`IDENTITY\`), como um contador.`
    case 'AT_DropIdentity':
      return `${col} deixa de gerar valores automaticamente.`
    default:
      return 'Altera a estrutura da tabela.'
  }
}

function explainAlterTable(ctx: Ctx) {
  const { stmt, pos } = ctx
  const n = stmt.node
  const table = n.relation.relname
  addTokens(ctx, 0, 0, stmt.tokens.length, `**Altera a estrutura** da tabela ${code(table)}. Os dados que já existem são mantidos.`)
  // Os comandos vêm depois do nome da tabela (que pode ser schema.tabela).
  let nameIdx = stmt.tokens.findIndex((t) => t.start === pos(n.relation.location))
  if (nameIdx < 0) return
  while (stmt.tokens[nameIdx + 1]?.text === '.') nameIdx += 2
  const cmds: AstNode[] = n.cmds ?? []
  const items = splitCommas(stmt.tokens, nameIdx + 1, stmt.tokens.length)
  if (items.length !== cmds.length) return
  items.forEach(([a, b], i) => addTokens(ctx, 1, a, b, describeAlterCmd(ctx, cmds[i].AlterTableCmd, table)))
}

function explainRename(ctx: Ctx) {
  const n = ctx.stmt.node
  const rel = n.relation?.relname
  const text =
    n.renameType === 'OBJECT_COLUMN'
      ? `**Renomeia** a coluna ${code(n.subname)} da tabela ${code(rel)} para ${code(n.newname)}. Os dados não mudam.`
      : n.renameType === 'OBJECT_TABLE'
        ? `**Renomeia** a tabela ${code(rel)} para ${code(n.newname)}. Os dados não mudam.`
        : '**Renomeia** um objeto do banco.'
  addTokens(ctx, 0, 0, ctx.stmt.tokens.length, text)
}

const OBJECT_NAMES: Record<string, string> = {
  OBJECT_TABLE: 'a tabela',
  OBJECT_INDEX: 'o índice',
  OBJECT_VIEW: 'a view',
  OBJECT_MATVIEW: 'a view materializada',
  OBJECT_SEQUENCE: 'a sequência',
  OBJECT_SCHEMA: 'o schema',
  OBJECT_TRIGGER: 'o gatilho (trigger)',
  OBJECT_FUNCTION: 'a função',
}

function explainDrop(ctx: Ctx) {
  const n = ctx.stmt.node
  const kind = OBJECT_NAMES[n.removeType] ?? 'o objeto'
  const who = (n.objects ?? [])
    .map((o: AstNode) => names(o.List?.items ?? (o.String ? [o] : [])).join('.'))
    .filter(Boolean)
    .map(code)
    .join(', ')
  const parts = [`**Apaga** ${kind} ${who}. ⚠ Não existe "desfazer": ${n.removeType === 'OBJECT_TABLE' ? 'os dados somem junto' : 'ele deixa de existir'}.`]
  if (n.missing_ok) parts.push('Com `IF EXISTS`, se não existir nada acontece (sem erro).')
  if (n.behavior === 'DROP_CASCADE') parts.push('⚠ `CASCADE` apaga **também tudo que depende** dele.')
  addTokens(ctx, 0, 0, ctx.stmt.tokens.length, parts.join(' '), true)
}

function explainInsert(ctx: Ctx) {
  const { stmt, pos } = ctx
  const n = stmt.node
  const table = n.relation.relname
  const tk = stmt.tokens
  addTokens(ctx, 0, 0, tk.length, `**Insere linhas** na tabela ${code(table)}.`)

  const cols: string[] = (n.cols ?? []).map((c: AstNode) => c.ResTarget.name)
  const nameIdx = tk.findIndex((t) => t.start === pos(n.relation.location))
  if (nameIdx < 0) return
  let after = nameIdx + 1
  while (tk[after]?.text === '.') after += 2
  if (tk[after]?.text === '(' && cols.length) {
    const close = matchingParen(tk, after)
    addTokens(ctx, 1, after, close + 1, `Colunas que vão receber valor: ${cols.map(code).join(', ')}. As **demais** ficam com o valor padrão (\`DEFAULT\`), são geradas sozinhas (\`IDENTITY\`) ou ficam vazias (\`NULL\`).`)
  } else if (!cols.length) {
    addTokens(ctx, 1, nameIdx, after, 'Sem lista de colunas: os valores precisam seguir **a ordem de todas as colunas da tabela**.')
  }

  const sel: AstNode | undefined = n.selectStmt?.SelectStmt
  const lists: AstNode[] = sel?.valuesLists ?? []
  const kws = topKeywords(tk)
  const valuesIdx = kws.find((i) => tk[i].upper === 'VALUES')
  if (valuesIdx !== undefined && lists.length) {
    const rows = splitCommas(tk, valuesIdx + 1, tk.length)
    if (rows.length !== lists.length) return
    rows.forEach(([a, b], i) => {
      const values = splitCommas(tk, a + 1, b - 1).map(([x, y]) => ctx.sql.slice(tk[x].start, tk[y - 1].end))
      const pairs = cols.length === values.length ? values.map((v, k) => `${code(cols[k])} = ${code(v)}`).join(', ') : values.map(code).join(', ')
      addTokens(ctx, 1, a, b, `Linha ${i + 1}: ${pairs}`)
    })
    // Subconsultas dentro dos valores (ex.: o id de uma categoria buscado pelo nome).
    explainSubqueries(ctx, sel, valuesIdx + 1, tk.length, 1)
    return
  }
  if (sel) {
    // INSERT ... SELECT: o SELECT vai até um ON CONFLICT / RETURNING de nível 0, se houver.
    const from = kws.find((i) => i >= after && ['SELECT', 'WITH'].includes(tk[i].upper))
    if (from === undefined) return
    // Só `ON CONFLICT` encerra o SELECT: o `ON` de um JOIN também está no nível 0.
    const to = kws.find((i) => i > from && (tk[i].upper === 'RETURNING' || (tk[i].upper === 'ON' && tk[i + 1]?.upper === 'CONFLICT'))) ?? tk.length
    addTokens(ctx, 1, from, to, 'Os valores vêm do **resultado de uma consulta**: cada linha devolvida vira uma linha nova na tabela.')
    explainScope(ctx, sel, from, to, 2)
  }
}

function whereRange(ctx: Ctx): { idx: number; end: number } | null {
  const tk = ctx.stmt.tokens
  const kws = topKeywords(tk)
  const idx = kws.find((i) => tk[i].upper === 'WHERE')
  if (idx === undefined) return null
  const end = kws.find((i) => i > idx && ['RETURNING'].includes(tk[i].upper)) ?? tk.length
  return { idx, end }
}

const NO_WHERE_UPDATE = '⚠ **Sem `WHERE`**: o comando vale para **todas as linhas** da tabela. Quase sempre isso é um erro.'

function explainUpdate(ctx: Ctx) {
  const { stmt } = ctx
  const n = stmt.node
  const tk = stmt.tokens
  addTokens(ctx, 0, 0, tk.length, `**Altera linhas que já existem** na tabela ${code(n.relation.relname)}.${n.whereClause ? '' : '\n\n' + NO_WHERE_UPDATE}`, !n.whereClause)

  const kws = topKeywords(tk)
  const set = kws.find((i) => tk[i].upper === 'SET')
  if (set === undefined) return
  const where = whereRange(ctx)
  // As atribuições terminam no FROM (dados de outra tabela), no WHERE ou no RETURNING: o que vier primeiro.
  const fromIdx = kws.find((i) => i > set && tk[i].upper === 'FROM')
  const end = Math.min(where?.idx ?? tk.length, fromIdx ?? tk.length, kws.find((i) => i > set && tk[i].upper === 'RETURNING') ?? tk.length)
  const items = splitCommas(tk, set + 1, end)
  if (fromIdx !== undefined && n.fromClause?.length) {
    explainFrom(ctx, n.fromClause, fromIdx, where?.idx ?? tk.length, 1)
  }
  const targets: AstNode[] = n.targetList ?? []
  if (items.length === targets.length) {
    items.forEach(([a, b], i) => {
      const t = targets[i].ResTarget
      addTokens(ctx, 1, a, b, `Define ${code(t.name)} = ${t.val?.SubLink ? 'o resultado de uma **subconsulta**' : code(txt(ctx, t.val))}.`)
    })
  }
  if (where && n.whereClause) explainFilter(ctx, 'WHERE', n.whereClause, where.idx, where.end, 1)
  explainSubqueries(ctx, n, set + 1, tk.length, 1)
}

function explainDelete(ctx: Ctx) {
  const n = ctx.stmt.node
  const tk = ctx.stmt.tokens
  addTokens(
    ctx,
    0,
    0,
    tk.length,
    `**Apaga linhas** da tabela ${code(n.relation.relname)} (a tabela continua existindo).${n.whereClause ? '' : '\n\n⚠ **Sem `WHERE`**: apaga **todas as linhas** da tabela.'}`,
    !n.whereClause,
  )
  const where = whereRange(ctx)
  if (where && n.whereClause) explainFilter(ctx, 'WHERE', n.whereClause, where.idx, where.end, 1)
  explainSubqueries(ctx, n, 0, tk.length, 1)
}

/** Nome do objeto, qualificado se estiver fora do public. */
const relName = (r: AstNode | undefined) => (r ? (r.schemaname && r.schemaname !== 'public' ? `${r.schemaname}.${r.relname}` : r.relname) : '?')

/** Início do corpo `AS <SELECT>` de uma view / view materializada. */
function queryAfterAs(ctx: Ctx): number | null {
  const tk = tokensOf(ctx)
  const kws = topKeywords(tk)
  const asIdx = kws.find((i) => tk[i].upper === 'AS' && ['SELECT', 'WITH', 'VALUES'].includes(tk[i + 1]?.upper))
  return asIdx === undefined ? null : asIdx + 1
}

function explainView(ctx: Ctx) {
  const n = ctx.stmt.node
  const tk = tokensOf(ctx)
  addTokens(ctx, 0, 0, tk.length, `**Cria a view ${code(relName(n.view))}**${n.replace ? ' (ou a **substitui**, se já existir)' : ''}: uma consulta com nome. Ela **não guarda dados**: a consulta roda de novo toda vez que a view é lida, por isso está sempre atualizada.`)
  const body = queryAfterAs(ctx)
  if (body !== null && n.query?.SelectStmt) {
    addTokens(ctx, 1, body, tk.length, '**A consulta da view**: o que quem ler a view vai enxergar. As colunas da view são as colunas do `SELECT`.')
    explainScope(ctx, n.query.SelectStmt, body, tk.length, 2)
  }
}

function explainCreateTableAs(ctx: Ctx) {
  const n = ctx.stmt.node
  const tk = tokensOf(ctx)
  const matview = n.objtype === 'OBJECT_MATVIEW'
  const name = code(relName(n.into?.rel))
  addTokens(
    ctx,
    0,
    0,
    tk.length,
    matview
      ? `**Cria a view materializada ${name}**: o resultado da consulta fica **gravado** (leitura rápida), mas **envelhece**: para atualizá-lo é preciso \`REFRESH MATERIALIZED VIEW\`.`
      : `**Cria a tabela ${name}** já preenchida com o resultado da consulta.`,
  )
  const body = queryAfterAs(ctx)
  if (body !== null && n.query?.SelectStmt) {
    addTokens(ctx, 1, body, tk.length, matview ? '**A consulta** cujo resultado será guardado.' : '**A consulta** que preenche a tabela.')
    explainScope(ctx, n.query.SelectStmt, body, tk.length, 2)
  }
}

function explainRefresh(ctx: Ctx) {
  const n = ctx.stmt.node
  addTokens(
    ctx,
    0,
    0,
    tokensOf(ctx).length,
    `**Atualiza a view materializada ${code(relName(n.relation))}**: roda a consulta de novo e **substitui** o resultado guardado.${n.concurrent ? ' Com `CONCURRENTLY`, quem estiver lendo **não fica bloqueado** enquanto ela atualiza (exige um índice único na view).' : ' Sem `CONCURRENTLY`, a leitura fica bloqueada durante a atualização.'}`,
  )
}

const SHORT_TYPE: Record<string, string> = { int4: 'integer', int8: 'bigint', int2: 'smallint', bool: 'boolean', float8: 'double precision', float4: 'real', bpchar: 'char' }
const shortType = (t: AstNode) => {
  const base = names(t?.names).pop() ?? '?'
  return SHORT_TYPE[base] ?? base
}

/** O que o corpo de uma função faz, deduzido das palavras que ele usa. */
function describeBody(body: string, language: string, returnsTrigger: boolean): string[] {
  if (language !== 'plpgsql') return ['é um único comando SQL: o resultado dele é o que a função devolve']
  const has = (re: RegExp) => re.test(body)
  const out: string[] = []
  if (has(/\bdeclare\b/i)) out.push('`DECLARE` cria variáveis locais')
  if (has(/\breturning\b[\s\S]*\binto\b/i)) out.push('`RETURNING ... INTO` guarda numa variável o valor da linha alterada')
  if (has(/\bselect\b[\s\S]*\binto\b/i)) out.push('`SELECT ... INTO` guarda o resultado de uma consulta em variáveis')
  if (has(/\bif\b[\s\S]*\bthen\b/i)) out.push('`IF ... THEN` toma decisões')
  if (has(/\bnot\s+found\b|\bfound\b/i)) out.push('`FOUND` diz se o último comando afetou alguma linha')
  if (has(/\braise\s+exception\b/i)) out.push('`RAISE EXCEPTION` interrompe com um **erro próprio** (código `P0001`) e desfaz o comando')
  if (returnsTrigger && has(/\bnew\./i)) out.push('`NEW` é a linha **como ficará** depois do comando')
  if (returnsTrigger && has(/\bold\./i)) out.push('`OLD` é a linha **como era** antes do comando')
  if (returnsTrigger && has(/\breturn\s+new\b/i)) out.push('`RETURN NEW` deixa a operação seguir (devolver `NULL` a cancelaria)')
  else if (has(/\breturn\b/i)) out.push('`RETURN` devolve o resultado da função')
  return out
}

function explainCreateFunction(ctx: Ctx) {
  const n = ctx.stmt.node
  const tk = tokensOf(ctx)
  const fn = names(n.funcname).join('.')
  const params = ((n.parameters ?? []) as AstNode[]).map((p) => `${p.FunctionParameter.name ?? ''} ${shortType(p.FunctionParameter.argType)}`.trim())
  const returns = n.returnType ? shortType(n.returnType) : 'nada'
  const opt = (name: string) => ((n.options ?? []) as AstNode[]).find((o) => o.DefElem.defname === name)?.DefElem.arg
  const language: string = opt('language')?.String?.sval ?? 'sql'
  const body: string = opt('as')?.List?.items?.[0]?.String?.sval ?? ''
  const returnsTrigger = returns === 'trigger'
  addTokens(
    ctx,
    0,
    0,
    tk.length,
    `**${n.replace ? 'Cria ou substitui' : 'Cria'} a função ${code(`${fn}(${params.join(', ')})`)}**, que devolve ${code(returns)}, escrita em **${language === 'plpgsql' ? 'PL/pgSQL' : language.toUpperCase()}**.${returnsTrigger ? ' É uma **função de trigger**: ela só serve para ser ligada a uma tabela com `CREATE TRIGGER`.' : ' Depois de criada, pode ser chamada em qualquer consulta.'}`,
  )
  const bodyTok = tk.findIndex((t) => t.kind === 'string' && t.text.startsWith('$'))
  if (bodyTok >= 0) {
    const points = describeBody(body, language, returnsTrigger)
    addTokens(ctx, 1, bodyTok, bodyTok + 1, `**O corpo** (entre \`$$ ... $$\`, para não precisar escapar aspas)${points.length ? ':\n' + points.map((p) => `- ${p}`).join('\n') : '.'}`)
  }
}

const TRIGGER_EVENT: [number, string][] = [[4, 'INSERT'], [16, 'UPDATE'], [8, 'DELETE'], [32, 'TRUNCATE']]

function explainCreateTrigger(ctx: Ctx) {
  const n = ctx.stmt.node
  const tk = tokensOf(ctx)
  const timing = n.timing & 64 ? 'INSTEAD OF' : n.timing & 2 ? 'BEFORE' : 'AFTER'
  const events = TRIGGER_EVENT.filter(([bit]) => n.events & bit).map(([, name]) => name)
  const cols = names(n.columns)
  const when = `${timing} ${events.join(' ou ')}${cols.length ? ` (só se ${cols.map(code).join(', ')} aparecer no \`SET\`)` : ''}`
  const fn = names(n.funcname).join('.')
  addTokens(
    ctx,
    0,
    0,
    tk.length,
    `**Cria o trigger ${code(n.trigname)}** em ${code(relName(n.relation))}: ${when}, ${n.row ? 'para **cada linha** afetada' : 'uma vez por comando'}, o banco executa ${code(fn + '()')} **sozinho**.`,
  )

  const kws = topKeywords(tk)
  const start = kws.find((i) => ['BEFORE', 'AFTER', 'INSTEAD'].includes(tk[i].upper))
  const on = start === undefined ? undefined : kws.find((i) => i > start && tk[i].upper === 'ON')
  if (start !== undefined && on !== undefined) {
    const meaning =
      timing === 'BEFORE' ? '**antes** de gravar: a função ainda pode **alterar** a linha (`NEW`) ou recusá-la' : timing === 'AFTER' ? '**depois** de gravar: serve para efeitos colaterais, como auditoria' : '**no lugar** do comando (usado em views)'
    addTokens(ctx, 1, start, on, `**Quando dispara**: ${meaning}.`)
  }
  const whenIdx = kws.find((i) => tk[i].upper === 'WHEN')
  if (whenIdx !== undefined && n.whenClause) {
    const close = matchingParen(tk, whenIdx + 1)
    addTokens(ctx, 1, whenIdx, close + 1, `**Condição \`WHEN\`**: o trigger só dispara se ${describeLeaf(ctx, n.whenClause).text}. Evita executar a função quando não há nada a fazer.`)
  }
  const exec = kws.find((i) => tk[i].upper === 'EXECUTE')
  if (exec !== undefined) addTokens(ctx, 1, exec, tk.length, `**A função** que o trigger executa: ${code(fn + '()')}.`)
}

function explainIndex(ctx: Ctx) {
  const n = ctx.stmt.node
  const tk = tokensOf(ctx)
  const params = (n.indexParams ?? []) as AstNode[]
  const cols = params.map((p) => {
    const e = p.IndexElem
    const text = e.name ?? txt(ctx, e.expr)
    return `${code(text)}${e.ordering === 'SORTBY_DESC' ? ' (decrescente)' : ''}`
  })
  const method = n.accessMethod === 'btree' ? 'B-tree' : n.accessMethod
  addTokens(
    ctx,
    0,
    0,
    tk.length,
    `**Cria o ${n.unique ? 'índice **único**' : 'índice'} ${code(n.idxname ?? '')}** em ${code(relName(n.relation))} (${method}): uma estrutura ordenada que acelera buscas por ${cols.join(', ')}${n.whereClause ? ', **só** nas linhas que cumprem a condição' : ''}, ao custo de espaço e de escritas um pouco mais lentas.`,
  )
  const open = tk.findIndex((t, i) => t.text === '(' && i > 0)
  if (open >= 0) {
    const close = matchingParen(tk, open)
    const parts = [`Colunas indexadas, **na ordem** (a ordem importa: o índice ajuda consultas que filtram pelo **começo** da lista): ${cols.join(', ')}.`]
    if (n.unique) parts.push('Como é **único**, o banco recusa valores repetidos.')
    if (params.some((p) => p.IndexElem.expr)) parts.push('Uma coluna é uma **expressão**: o índice só ajuda consultas que usam **a mesma expressão**.')
    addTokens(ctx, 1, open, close + 1, parts.join(' '))
  }
  const where = topKeywords(tk).find((i) => tk[i].upper === 'WHERE')
  if (where !== undefined && n.whereClause) {
    addTokens(ctx, 1, where, tk.length, `**Índice parcial**: só indexa as linhas em que ${describeLeaf(ctx, n.whereClause).text}. Fica menor e mais barato de manter; o planejador só o usa quando a consulta repete essa condição.`)
  }
}

const TRANSACTION_TEXT: Record<string, string> = {
  TRANS_STMT_BEGIN: '**Abre uma transação**: a partir daqui, nada é definitivo até o `COMMIT`. Você enxerga as suas mudanças; outras sessões, não.',
  TRANS_STMT_START: '**Abre uma transação** (`START TRANSACTION`, o mesmo que `BEGIN`).',
  TRANS_STMT_COMMIT: '**Confirma** a transação: tudo o que foi feito desde o `BEGIN` passa a valer e fica gravado.',
  TRANS_STMT_ROLLBACK: '**Desfaz** a transação: é como se nada do que veio desde o `BEGIN` tivesse acontecido.',
}

function explainTransaction(ctx: Ctx) {
  const n = ctx.stmt.node
  const name = n.savepoint_name ? code(n.savepoint_name) : ''
  const text =
    TRANSACTION_TEXT[n.kind] ??
    (n.kind === 'TRANS_STMT_SAVEPOINT'
      ? `**Marca um ponto de retorno** ${name} dentro da transação: dá para voltar até aqui sem desfazer o que veio antes.`
      : n.kind === 'TRANS_STMT_ROLLBACK_TO'
        ? `**Volta ao ponto** ${name}: desfaz só o que veio **depois** dele. A transação continua aberta.`
        : n.kind === 'TRANS_STMT_RELEASE'
          ? `**Descarta o marcador** ${name}. O que veio depois dele **permanece** na transação.`
          : '**Controla uma transação**.')
  addTokens(ctx, 0, 0, tokensOf(ctx).length, text)
}

function explainGrant(ctx: Ctx) {
  const n = ctx.stmt.node
  const privs = ((n.privileges ?? []) as AstNode[]).map((p) => p.AccessPriv.priv_name?.toUpperCase()).filter(Boolean)
  const what = privs.length ? privs.map(code).join(', ') : 'todas as permissões (`ALL`)'
  const kind: Record<string, string> = { OBJECT_TABLE: 'a tabela ou view', OBJECT_SCHEMA: 'o schema', OBJECT_SEQUENCE: 'a sequência', OBJECT_FUNCTION: 'a função' }
  const objects = ((n.objects ?? []) as AstNode[]).map((o) => (o.RangeVar ? relName(o.RangeVar) : o.String?.sval)).filter(Boolean).map(code).join(', ')
  const who = ((n.grantees ?? []) as AstNode[]).map((g) => code(g.RoleSpec?.rolename ?? 'PUBLIC')).join(', ')
  addTokens(
    ctx,
    0,
    0,
    tokensOf(ctx).length,
    n.is_grant
      ? `**Concede** ${what} sobre ${kind[n.objtype] ?? 'o objeto'} ${objects} ao papel ${who}. Princípio do menor privilégio: dê só o necessário.`
      : `**Retira** ${what} sobre ${kind[n.objtype] ?? 'o objeto'} ${objects} do papel ${who}.`,
  )
}

function explainSet(ctx: Ctx) {
  const n = ctx.stmt.node
  const arg = (a: AstNode) => a.A_Const?.sval?.sval ?? a.A_Const?.ival?.ival ?? txt(ctx, a)
  const values = ((n.args ?? []) as AstNode[]).map((a) => code(String(arg(a))))
  const name: string = n.name
  let text: string
  if (n.kind === 'VAR_RESET' || n.kind === 'VAR_RESET_ALL') text = `**Volta ao padrão** ${n.name ? `a configuração ${code(name)}` : 'todas as configurações da sessão'}.`
  else if (name === 'role') text = `**Passa a agir como** o papel ${values[0]} até o fim do script: valem **as permissões dele**, não as suas. É o jeito de testar o que um papel consegue (ou não) fazer.`
  else if (name === 'search_path') text = `**Define onde o banco procura** nomes sem schema: ${values.join(', depois em ')}. Vale só para esta sessão.`
  else text = `**Define a configuração** ${code(name)} = ${values.join(', ')} para esta sessão.`
  addTokens(ctx, 0, 0, tokensOf(ctx).length, text)
}

function explainExplain(ctx: Ctx) {
  const n = ctx.stmt.node
  const tk = tokensOf(ctx)
  const analyze = ((n.options ?? []) as AstNode[]).some((o) => o.DefElem.defname === 'analyze')
  addTokens(
    ctx,
    0,
    0,
    tk.length,
    analyze
      ? '**Mostra o plano de execução E executa a consulta de verdade**, medindo o tempo real. ⚠ Com `UPDATE`/`DELETE`, `ANALYZE` **altera os dados**; só é seguro com `SELECT` (ou dentro de um `ROLLBACK`).'
      : '**Mostra o plano de execução** (como o Postgres pretende buscar os dados) **sem executar** a consulta. Os números são estimativas.',
  )
  const inner = topKeywords(tk).find((i) => i > 0 && ['SELECT', 'WITH'].includes(tk[i].upper))
  if (inner !== undefined && n.query?.SelectStmt) {
    addTokens(ctx, 1, inner, tk.length, '**A consulta** cujo plano será mostrado.')
    explainScope(ctx, n.query.SelectStmt, inner, tk.length, 2)
  }
}

function explainVacuum(ctx: Ctx) {
  const first = tokensOf(ctx)[0].upper
  const rels = ((ctx.stmt.node.rels ?? []) as AstNode[]).map((r) => code(relName(r.VacuumRelation?.relation))).join(', ')
  addTokens(
    ctx,
    0,
    0,
    tokensOf(ctx).length,
    first === 'ANALYZE'
      ? `**Atualiza as estatísticas** ${rels ? `de ${rels}` : 'do banco'}: quantas linhas há e como os valores se distribuem. O planejador usa isso para **escolher o plano**; depois de carregar muitos dados, é bom rodar.`
      : `**Limpa e reorganiza** ${rels ? rels : 'as tabelas'}, recuperando o espaço de linhas apagadas.`,
  )
}

/** Comandos que ainda não têm explicação detalhada: pelo menos dizemos o que são. */
const GENERIC: Record<string, string> = {
  TruncateStmt: '**Esvazia** a(s) tabela(s): apaga todas as linhas de uma vez. ⚠ Não há desfazer fora de uma transação.',
  CreateSeqStmt: '**Cria uma sequência**: um contador que gera números únicos.',
  CommentStmt: '**Registra um comentário** (documentação) sobre um objeto do banco.',
}

function explainStatement(ctx: Ctx) {
  switch (ctx.stmt.kind) {
    case 'SelectStmt':
      return explainSelect(ctx)
    case 'CreateStmt':
      return explainCreateTable(ctx)
    case 'AlterTableStmt':
      return explainAlterTable(ctx)
    case 'RenameStmt':
      return explainRename(ctx)
    case 'DropStmt':
      return explainDrop(ctx)
    case 'InsertStmt':
      return explainInsert(ctx)
    case 'UpdateStmt':
      return explainUpdate(ctx)
    case 'DeleteStmt':
      return explainDelete(ctx)
    case 'ViewStmt':
      return explainView(ctx)
    case 'CreateTableAsStmt':
      return explainCreateTableAs(ctx)
    case 'RefreshMatViewStmt':
      return explainRefresh(ctx)
    case 'CreateFunctionStmt':
      return explainCreateFunction(ctx)
    case 'CreateTrigStmt':
      return explainCreateTrigger(ctx)
    case 'IndexStmt':
      return explainIndex(ctx)
    case 'TransactionStmt':
      return explainTransaction(ctx)
    case 'GrantStmt':
      return explainGrant(ctx)
    case 'VariableSetStmt':
      return explainSet(ctx)
    case 'ExplainStmt':
      return explainExplain(ctx)
    case 'VacuumStmt':
      return explainVacuum(ctx)
    case 'CreateSchemaStmt':
      return addTokens(ctx, 0, 0, ctx.stmt.tokens.length, `**Cria o schema ${code(ctx.stmt.node.schemaname)}**: uma "pasta" para organizar tabelas, views e funções. Para usar um objeto dele, escreva \`${ctx.stmt.node.schemaname}.nome\`.`)
    case 'CreateRoleStmt': {
      const login = ((ctx.stmt.node.options ?? []) as AstNode[]).find((o) => o.DefElem.defname === 'canlogin')?.DefElem.arg?.Boolean?.boolval
      return addTokens(
        ctx,
        0,
        0,
        ctx.stmt.tokens.length,
        `**Cria o papel ${code(ctx.stmt.node.role)}**: um usuário ou grupo${login === false ? ' **sem login** (um perfil de permissões)' : ''}. Por si só, um papel novo ainda **não pode quase nada**: as permissões vêm com \`GRANT\`.`,
      )
    }
    default: {
      const first = ctx.stmt.tokens
        .slice(0, 2)
        .map((t) => t.upper)
        .join(' ')
      addTokens(ctx, 0, 0, ctx.stmt.tokens.length, GENERIC[ctx.stmt.kind] ?? `Comando ${code(first)}.`)
    }
  }
}

/** Explica, trecho a trecho, o que cada comando do script faz. */
export async function explainSql(sql: string): Promise<Explanation> {
  // Texto vazio ou só com comentários (o ponto de partida de todo passo) não é erro: só não há o que explicar.
  if (sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim() === '') return { ok: true, annotations: [] }
  const parsed = await parseSql(sql)
  if (!parsed.ok) return { ok: false, message: parsed.message }

  const annotations: Annotation[] = []
  parsed.statements.forEach((stmt, statement) => {
    const local: Annotation[] = []
    const ctx: Ctx = {
      sql,
      stmt,
      pos: parsed.pos,
      ctes: new Set<string>(),
      add: (depth, from, to, text, warn) => local.push({ id: `${statement}.${local.length}`, statement, depth, from, to, text, warn }),
    }
    try {
      explainStatement(ctx)
    } catch {
      // Uma regra com defeito nunca pode derrubar o painel enquanto o aluno digita.
      local.length = 0
      ctx.add(0, stmt.from, stmt.to, 'Comando reconhecido, mas ainda sem explicação detalhada.')
    }
    // Pai antes do filho, na ordem do texto; a anotação mais externa primeiro quando começam no mesmo ponto.
    local.sort((x, y) => x.from - y.from || x.depth - y.depth)
    annotations.push(...local)
  })
  return { ok: true, annotations }
}

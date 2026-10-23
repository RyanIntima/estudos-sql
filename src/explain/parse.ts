import { loadModule, parse, scan } from 'libpg-query'

/** Nó da AST do Postgres: formato JSON do parser oficial, navegado de forma dinâmica. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AstNode = any

export type TokenKind = 'keyword' | 'ident' | 'string' | 'number' | 'punct' | 'op'

export interface Token {
  /** Posições em caracteres (UTF-16), as mesmas do texto do editor. */
  start: number
  end: number
  text: string
  upper: string
  kind: TokenKind
}

export interface Stmt {
  /** Nome do nó raiz: SelectStmt, CreateStmt, … */
  kind: string
  node: AstNode
  /** Do primeiro ao último token (sem o `;` final). */
  from: number
  to: number
  tokens: Token[]
}

export type ParseResult =
  | { ok: true; sql: string; statements: Stmt[]; pos: (byte: number) => number }
  | { ok: false; message: string }

let ready: Promise<void> | null = null

/**
 * O parser trabalha em bytes UTF-8; o editor, em caracteres. Com acento (`'Olá'`) as posições divergem.
 * Devolve, para cada byte, o índice do caractere que o contém (e o tamanho total na posição final).
 */
function byteToCharMap(sql: string): number[] {
  const map: number[] = []
  let chars = 0
  for (const ch of sql) {
    const cp = ch.codePointAt(0)!
    const bytes = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
    for (let i = 0; i < bytes; i++) map.push(chars)
    chars += ch.length
  }
  map.push(chars)
  return map
}

interface RawToken {
  start: number
  end: number
  tokenName: string
  keywordKind: number
}

function classify(raw: RawToken): TokenKind {
  const n = raw.tokenName
  if (n === 'IDENT') return 'ident'
  if (n === 'SCONST' || n === 'USCONST' || n === 'BCONST' || n === 'XCONST') return 'string'
  if (n === 'ICONST' || n === 'FCONST') return 'number'
  if (n.startsWith('ASCII_')) return raw.keywordKind ? 'keyword' : 'punct'
  return raw.keywordKind ? 'keyword' : 'op'
}

export async function parseSql(sql: string): Promise<ParseResult> {
  ready ??= loadModule()
  await ready
  try {
    const [tree, scanned] = await Promise.all([parse(sql), scan(sql)])
    const map = byteToCharMap(sql)
    const pos = (byte: number) => map[Math.min(byte, map.length - 1)]

    const tokens: Token[] = (scanned.tokens as RawToken[])
      .filter((t) => !/COMMENT/.test(t.tokenName))
      .map((t) => {
        const start = pos(t.start)
        const end = pos(t.end)
        const text = sql.slice(start, end)
        return { start, end, text, upper: text.toUpperCase(), kind: classify(t) }
      })

    const statements: Stmt[] = []
    for (const raw of tree.stmts ?? []) {
      if (!raw.stmt) continue
      const byteFrom: number = raw.stmt_location ?? 0
      const byteTo: number = raw.stmt_len ? byteFrom + raw.stmt_len : map.length - 1
      const [a, b] = [pos(byteFrom), pos(byteTo)]
      const inRange = tokens.filter((t) => t.start >= a && t.end <= b)
      while (inRange.length && inRange[inRange.length - 1].text === ';') inRange.pop()
      if (!inRange.length) continue
      statements.push({
        kind: Object.keys(raw.stmt)[0],
        node: Object.values(raw.stmt)[0],
        from: inRange[0].start,
        to: inRange[inRange.length - 1].end,
        tokens: inRange,
      })
    }
    return { ok: true, sql, statements, pos }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

// ---------------------------------------------------------------------------
// Navegação por tokens
// ---------------------------------------------------------------------------

/**
 * Índices (em `tokens`) das palavras-chave de nível 0 dentro de [from, to).
 * O nível é relativo a `from`: serve para o corpo de uma subconsulta, que já está dentro de parênteses.
 */
export function topKeywords(tokens: Token[], from = 0, to = tokens.length): number[] {
  const out: number[] = []
  let depth = 0
  for (let i = from; i < to; i++) {
    const t = tokens[i]
    if (t.text === ')') depth--
    if (depth === 0 && t.kind === 'keyword') out.push(i)
    if (t.text === '(') depth++
  }
  return out
}

/** Divide [from, to) nas vírgulas de nível 0 (relativo a `from`). Devolve pares [início, fim) de índices. */
export function splitCommas(tokens: Token[], from: number, to: number): [number, number][] {
  const out: [number, number][] = []
  let depth = 0
  let start = from
  for (let i = from; i < to; i++) {
    const t = tokens[i].text
    if (t === '(') depth++
    else if (t === ')') depth--
    else if (t === ',' && depth === 0) {
      out.push([start, i])
      start = i + 1
    }
  }
  if (start < to) out.push([start, to])
  return out
}

/** Índice do `)` que fecha o `(` em `open`. */
export function matchingParen(tokens: Token[], open: number): number {
  let depth = 0
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i].text === '(') depth++
    else if (tokens[i].text === ')' && --depth === 0) return i
  }
  return tokens.length - 1
}

function collectLocations(node: AstNode, out: number[]): void {
  if (Array.isArray(node)) return node.forEach((n) => collectLocations(n, out))
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'location' && typeof v === 'number' && v >= 0) out.push(v)
      else collectLocations(v, out)
    }
  }
}

/** Posição (em caracteres) do primeiro pedaço do nó no texto, ou null se o nó não carrega localização. */
export function nodeFirstChar(node: AstNode, pos: (byte: number) => number): number | null {
  const locs: number[] = []
  collectLocations(node, locs)
  return locs.length ? Math.min(...locs.map(pos)) : null
}

const TRAILING_AFTER_IS = new Set(['NOT', 'NULL', 'TRUE', 'FALSE', 'UNKNOWN'])

/**
 * Intervalo de tokens [a, b) que um nó da AST ocupa no texto.
 * O parser só informa ONDE cada pedaço começa; o fim sai do último pedaço, ajustado para fechar parênteses.
 */
export function nodeTokenRange(node: AstNode, stmt: Stmt, pos: (byte: number) => number): [number, number] | null {
  const locs: number[] = []
  collectLocations(node, locs)
  if (!locs.length) return null
  const chars = locs.map(pos)
  const { tokens } = stmt
  let a = tokens.findIndex((t) => t.start === Math.min(...chars))
  const last = tokens.findIndex((t) => t.start === Math.max(...chars))
  if (a < 0 || last < 0) return null

  let end = last + 1
  // Nome qualificado (`p.cliente_id`, `schema.tabela`): o parser só marca o início, o resto vem depois dos pontos.
  while (tokens[end]?.text === '.' && tokens[end + 1]) end += 2
  // `x IS [NOT] NULL`: o parser só marca o IS.
  if (tokens[last].upper === 'IS') {
    while (end < tokens.length && TRAILING_AFTER_IS.has(tokens[end].upper)) end++
  }

  let balance = 0
  for (let i = a; i < end; i++) balance += tokens[i].text === '(' ? 1 : tokens[i].text === ')' ? -1 : 0
  while (balance > 0 && end < tokens.length) {
    balance += tokens[end].text === '(' ? 1 : tokens[end].text === ')' ? -1 : 0
    end++
  }
  while (balance < 0 && a > 0) {
    a--
    balance += tokens[a].text === '(' ? 1 : tokens[a].text === ')' ? -1 : 0
  }
  // Chamada de função sem argumentos de coluna (now(), count(*)): o parser só marca o nome.
  if (tokens[end]?.text === '(' && (tokens[end - 1].kind === 'ident' || tokens[end - 1].kind === 'keyword')) {
    end = matchingParen(tokens, end) + 1
  }
  return [a, end]
}

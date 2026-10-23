import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { diffData, snapshotData } from './dataDiff'
import { createEngine, type Engine } from './engine'
import { translateError } from './errorTranslator'
import { summarizeImpact, type Change } from './impact'
import { introspect } from './introspect'
import { diffSchemas } from './schemaDiff'

let engine: Engine
beforeAll(async () => {
  engine = await createEngine()
})
afterAll(() => engine.close())
beforeEach(() => engine.reset())

/** Roda um script e devolve o que ele mudou, do mesmo jeito que a interface faz. */
async function observe(sql: string): Promise<Change> {
  const s0 = await introspect(engine)
  const d0 = await snapshotData(engine, s0)
  const outcome = await engine.run(sql)
  const s1 = await introspect(engine)
  const d1 = await snapshotData(engine, s1)
  return { schema: diffSchemas(s0, s1), data: diffData(d0, d1), outcome }
}

const texts = (c: Change) => summarizeImpact(c).map((i) => i.text)

describe('schemaDiff', () => {
  it('detecta tabela nova, coluna nova, NOT NULL, PK e tabela removida', async () => {
    let c = await observe('CREATE TABLE t (id INT, nome VARCHAR(50))')
    expect(c.schema.tables).toMatchObject([{ name: 't', status: 'added', addedColumns: ['id', 'nome'] }])

    c = await observe('ALTER TABLE t ADD COLUMN email TEXT')
    expect(c.schema.tables[0]).toMatchObject({ status: 'changed', addedColumns: ['email'] })

    c = await observe('ALTER TABLE t ALTER COLUMN nome SET NOT NULL')
    expect(c.schema.tables[0].changedColumns).toMatchObject([{ name: 'nome', aspects: ['nullable'] }])

    c = await observe('ALTER TABLE t ADD PRIMARY KEY (id)')
    const t = c.schema.tables[0]
    expect(t.addedConstraints.map((k) => k.kind)).toEqual(['primary'])
    expect(t.changedColumns.find((x) => x.name === 'id')?.aspects).toContain('primaryKey')

    c = await observe('DROP TABLE t')
    expect(c.schema.tables).toMatchObject([{ name: 't', status: 'removed' }])
  })

  it('não acusa nada quando só consulta', async () => {
    await engine.run('CREATE TABLE t (id INT)')
    const c = await observe('SELECT * FROM t')
    expect(c.schema.tables).toEqual([])
    expect(c.data).toEqual({})
  })

  it('SERIAL não aparece como "default mudou" ao ser criado junto da tabela', async () => {
    const c = await observe('CREATE TABLE t (id SERIAL PRIMARY KEY)')
    expect(c.schema.tables[0].status).toBe('added')
  })
})

describe('dataDiff', () => {
  beforeEach(() => engine.run('CREATE TABLE p (id INT PRIMARY KEY, nome TEXT, preco INT)'))

  it('separa linhas inseridas, alteradas e removidas pela chave primária', async () => {
    await engine.run("INSERT INTO p VALUES (1,'a',10),(2,'b',20),(3,'c',30)")
    const c = await observe("INSERT INTO p VALUES (4,'d',40); UPDATE p SET preco = 99 WHERE id = 1; DELETE FROM p WHERE id = 3;")
    const d = c.data.p
    expect(d.comparable).toBe(true)
    expect(d.added.map((r) => r.id)).toEqual([4])
    expect(d.removed.map((r) => r.id)).toEqual([3])
    expect(d.changed).toMatchObject([{ changedColumns: ['preco'] }])
    expect([d.countBefore, d.countAfter]).toEqual([3, 3])
  })

  it('tabela grande: compara só os totais', async () => {
    const c = await observe('INSERT INTO p SELECT g, \'x\', 1 FROM generate_series(1, 600) g')
    expect(c.data.p).toMatchObject({ comparable: false, countBefore: 0, countAfter: 600 })
    expect(texts(c).join(' ')).toContain('ganhou 600 linhas')
  })

  it('linhas de uma tabela nova entram como inseridas', async () => {
    const c = await observe("CREATE TABLE q (a INT); INSERT INTO q VALUES (1),(2)")
    expect(c.data.q.added).toHaveLength(2)
  })
})

describe('summarizeImpact', () => {
  it('narra criação, regras e dados em português', async () => {
    let c = await observe('CREATE TABLE clientes (id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email VARCHAR(100) NOT NULL UNIQUE)')
    expect(texts(c)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Criou a tabela `clientes` com 2 colunas'),
        expect.stringContaining('chave primária de `clientes`'),
        expect.stringContaining('não pode se repetir'),
      ]),
    )

    c = await observe("INSERT INTO clientes (email) VALUES ('a@x.com'), ('b@x.com')")
    expect(texts(c)).toEqual(['Inseriu 2 linhas em `clientes` (total: 2).'])

    c = await observe("UPDATE clientes SET email = 'z@x.com' WHERE email = 'a@x.com'")
    expect(texts(c)).toEqual(['Alterou 1 linha de `clientes` (coluna `email`).'])

    c = await observe('DELETE FROM clientes')
    expect(texts(c)).toEqual(['Removeu 2 linhas de `clientes` (total: 0).'])
  })

  it('FK, DEFAULT e mudança de tipo', async () => {
    await engine.run('CREATE TABLE a (id INT PRIMARY KEY); CREATE TABLE b (id INT, a_id INT, n INT)')
    let c = await observe('ALTER TABLE b ADD FOREIGN KEY (a_id) REFERENCES a(id) ON DELETE CASCADE')
    expect(texts(c).join(' ')).toContain('`b.a_id` agora aponta para `a.id`')
    expect(texts(c).join(' ')).toContain('CASCADE')

    c = await observe('ALTER TABLE b ALTER COLUMN n SET DEFAULT 5; ALTER TABLE b ALTER COLUMN n TYPE BIGINT')
    expect(texts(c).join(' ')).toContain('ganhou o valor padrão `5`')
    expect(texts(c).join(' ')).toContain('integer → bigint')
  })

  it('consulta não altera; erro desfaz tudo', async () => {
    await engine.run('CREATE TABLE t (id INT)')
    let c = await observe('SELECT * FROM t')
    expect(texts(c)).toEqual(['A consulta devolveu 0 linhas. Consultar **não altera** nada no banco.'])

    c = await observe('CREATE TABLE novo (id INT); SELECT * FROM nao_existe')
    expect(c.schema.tables).toEqual([]) // o CREATE foi desfeito junto
    expect(texts(c)[0]).toContain('nada mudou')
  })
})

describe('translateError (erros reais do Postgres)', () => {
  const errorOf = async (sql: string) => {
    const out = await engine.run(sql)
    if (out.ok) throw new Error('era para dar erro: ' + sql)
    return out.error
  }

  it('sintaxe, tabela e coluna inexistentes', async () => {
    expect(translateError(await errorOf('SELEC 1'))?.explanation).toContain('`SELEC`')
    expect(translateError(await errorOf('SELECT * FROM nada'))?.explanation).toContain('`nada`')
    await engine.run('CREATE TABLE t (id INT)')
    expect(translateError(await errorOf('SELECT zzz FROM t'))?.explanation).toContain('`zzz`')
  })

  it('NOT NULL, UNIQUE, tipo, tamanho e CHECK', async () => {
    await engine.run(`CREATE TABLE t (id INT PRIMARY KEY, nome VARCHAR(3) NOT NULL, n INT CHECK (n > 0), email TEXT UNIQUE);
      INSERT INTO t VALUES (1, 'ab', 1, 'a@x.com')`)
    expect(translateError(await errorOf('INSERT INTO t (id) VALUES (2)'))?.explanation).toContain('`nome`')
    expect(translateError(await errorOf("INSERT INTO t VALUES (3, 'ab', 1, 'a@x.com')"))?.explanation).toContain('`a@x.com`')
    expect(translateError(await errorOf("INSERT INTO t VALUES ('x', 'ab', 1, 'b')"))?.title).toBe('Valor no formato errado')
    expect(translateError(await errorOf("INSERT INTO t VALUES (4, 'abcd', 1, 'c')"))?.title).toBe('Texto grande demais')
    expect(translateError(await errorOf("INSERT INTO t VALUES (5, 'ab', 0, 'd')"))?.title).toBe('Regra CHECK violada')
  })

  it('chave estrangeira nos dois sentidos', async () => {
    await engine.run('CREATE TABLE pai (id INT PRIMARY KEY); CREATE TABLE filho (pai_id INT REFERENCES pai(id)); INSERT INTO pai VALUES (1); INSERT INTO filho VALUES (1)')
    expect(translateError(await errorOf('INSERT INTO filho VALUES (99)'))?.explanation).toContain('não existe')
    expect(translateError(await errorOf('DELETE FROM pai'))?.explanation).toContain('ainda apontam')
  })

  it('tabela duplicada e código desconhecido', async () => {
    await engine.run('CREATE TABLE t (id INT)')
    expect(translateError(await errorOf('CREATE TABLE t (id INT)'))?.explanation).toContain('`t`')
    expect(translateError({ message: 'x', code: '99999' })).toBeNull()
  })
})

describe('fingerprint: regras equivalentes', () => {
  it('um CHECK escrito de dois jeitos (IN × = ANY(ARRAY)) não vira divergência', async () => {
    const { fingerprint, diffFingerprints } = await import('./fingerprint')
    const a = await createEngine()
    const b = await createEngine()
    try {
      await a.run("CREATE TABLE t (s VARCHAR(10) CHECK (s IN ('a', 'b')))")
      await b.run("CREATE TABLE t (s VARCHAR(10), CHECK (s = ANY (ARRAY['a', 'b'])))")
      expect(diffFingerprints(await fingerprint(a), await fingerprint(b))).toEqual([])
      // ...mas uma regra realmente diferente continua sendo notada.
      await b.run('DROP TABLE t')
      await b.run("CREATE TABLE t (s VARCHAR(10) CHECK (s IN ('a', 'c')))")
      expect(diffFingerprints(await fingerprint(a), await fingerprint(b)).length).toBeGreaterThan(0)
    } finally {
      await a.close()
      await b.close()
    }
  })
})

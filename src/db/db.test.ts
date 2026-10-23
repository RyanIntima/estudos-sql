import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createEngine, type Engine } from './engine'
import { introspect } from './introspect'

let engine: Engine
beforeAll(async () => {
  engine = await createEngine()
})
afterAll(() => engine.close())

describe('engine.run', () => {
  it('executa SELECT e devolve colunas/linhas em array', async () => {
    const out = await engine.run('SELECT 1 AS a, 2 AS a')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.results[0].columns).toEqual(['a', 'a'])
    expect(out.results[0].rows).toEqual([[1, 2]])
  })

  it('devolve erro estruturado em vez de lançar', async () => {
    const out = await engine.run('SELECT * FROM nao_existe')
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.error.code).toBe('42P01')
    expect(out.error.position).toBeGreaterThan(0)
  })
})

describe('introspect + reset', () => {
  it('lê tabelas, PK, FK, UNIQUE, CHECK, serial e índices', async () => {
    const out = await engine.run(`
      CREATE TABLE categorias (id SERIAL PRIMARY KEY, nome VARCHAR(80) NOT NULL UNIQUE);
      CREATE TABLE produtos (
        id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        categoria_id INT NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
        preco NUMERIC(10,2) NOT NULL CHECK (preco > 0)
      );
      CREATE INDEX idx_produtos_cat ON produtos (categoria_id);
    `)
    expect(out.ok).toBe(true)

    const schema = await introspect(engine)
    expect(schema.tables.map((t) => t.name)).toEqual(['categorias', 'produtos'])

    const cat = schema.tables[0]
    expect(cat.columns[0]).toMatchObject({ name: 'id', serial: true, isPrimaryKey: true })
    expect(cat.columns[1]).toMatchObject({
      name: 'nome',
      type: 'character varying(80)',
      nullable: false,
      isUnique: true,
    })

    const prod = schema.tables[1]
    expect(prod.columns[0]).toMatchObject({ identity: true, isPrimaryKey: true })
    expect(prod.columns[1]).toMatchObject({ isForeignKey: true })
    expect(prod.columns[2].type).toBe('numeric(10,2)')
    const fk = prod.constraints.find((c) => c.kind === 'foreign')!
    expect(fk).toMatchObject({
      columns: ['categoria_id'],
      refTable: 'categorias',
      refColumns: ['id'],
      onDelete: 'CASCADE',
    })
    expect(prod.constraints.some((c) => c.kind === 'check')).toBe(true)
    expect(prod.indexes.map((i) => i.name)).toContain('idx_produtos_cat')
  })

  it('reset deixa o banco vazio e utilizável', async () => {
    await engine.reset()
    expect((await introspect(engine)).tables).toEqual([])
    expect((await engine.run('CREATE TABLE t (id INT)')).ok).toBe(true)
  })
})

describe('higiene da sessão entre execuções', () => {
  it('BEGIN sem COMMIT: o motor desfaz e avisa; nada fica gravado', async () => {
    await engine.reset()
    await engine.run('CREATE TABLE t (id INT)')
    const out = await engine.run("BEGIN; INSERT INTO t VALUES (1); SELECT count(*) FROM t;")
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.rolledBack).toBe(true)
    expect(out.results.at(-1)?.rows).toEqual([[1]]) // dentro da transação, a linha existia
    expect(await engine.query('SELECT count(*)::int AS n FROM t')).toEqual([{ n: 0 }]) // depois, não
  })

  it('transação confirmada com COMMIT vale e não é marcada como desfeita', async () => {
    const out = await engine.run('BEGIN; INSERT INTO t VALUES (7); COMMIT;')
    expect(out.ok && out.rolledBack).toBeFalsy()
    expect(await engine.query('SELECT count(*)::int AS n FROM t')).toEqual([{ n: 1 }])
  })

  it('erro dentro da transação: desfaz tudo e a sessão continua utilizável', async () => {
    const out = await engine.run('BEGIN; INSERT INTO t VALUES (8); SELECT * FROM nao_existe; COMMIT;')
    expect(out.ok).toBe(false)
    expect(out.rolledBack).toBe(true)
    // Sem a limpeza, qualquer consulta aqui falharia com 25P02 (transação abortada).
    expect(await engine.query('SELECT count(*)::int AS n FROM t')).toEqual([{ n: 1 }])
  })

  it('SET ROLE e search_path não vazam para a próxima execução', async () => {
    const state = () => engine.query("SELECT current_user::text AS u, current_setting('search_path') AS sp")
    const before = await state()
    await engine.run('CREATE ROLE leitor NOLOGIN; GRANT SELECT ON t TO leitor;')
    await engine.run('SET ROLE leitor; SET search_path TO pg_catalog;')
    expect(await state()).toEqual(before)
    expect(before[0]).toMatchObject({ u: 'postgres' })
  })

  it('reset apaga papéis, e views/funções em outros schemas', async () => {
    await engine.run(`CREATE SCHEMA relatorios; CREATE VIEW relatorios.v AS SELECT 1 AS x;
      CREATE FUNCTION relatorios.f() RETURNS int LANGUAGE sql AS 'SELECT 1';`)
    await engine.reset()
    expect(await engine.query(`SELECT count(*)::int AS n FROM pg_roles WHERE rolname = 'leitor'`)).toEqual([{ n: 0 }])
    expect(await engine.query(`SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = 'relatorios'`)).toEqual([{ n: 0 }])
    // O papel foi recriável (não sobrou lixo) e o schema public continua usável por outros papéis.
    expect((await engine.run('CREATE ROLE leitor NOLOGIN; CREATE TABLE t (id INT); GRANT SELECT ON t TO leitor; SET ROLE leitor; SELECT * FROM t;')).ok).toBe(true)
  })

  it('um diagnóstico em transação somente leitura não se intercala com a execução do aluno', async () => {
    await engine.reset()
    await engine.run('CREATE TABLE t (id INT)')
    // O diagnóstico do editor dispara enquanto o aluno executa: sem fila, o INSERT cairia dentro da transação
    // somente leitura (erro 25006) e o ROLLBACK final do aluno desfaria o BEGIN READ ONLY do diagnóstico.
    const diagnostic = engine.readOnly(async (session) => {
      await new Promise((r) => setTimeout(r, 30))
      return session.query('SELECT count(*)::int AS n FROM t')
    })
    const student = engine.run('INSERT INTO t VALUES (1); SELECT count(*) FROM t')
    const [, out] = await Promise.all([diagnostic, student])
    expect(out.ok).toBe(true)
    expect(out.rolledBack).toBeUndefined()
    expect(await engine.query('SELECT count(*)::int AS n FROM t')).toEqual([{ n: 1 }])
  })

  it('o SET ROLE de um diagnóstico não vaza para as consultas da interface', async () => {
    await engine.reset()
    await engine.run('CREATE TABLE secreta (id INT); CREATE ROLE visitante NOLOGIN')
    // O plano/as etapas executam o script do aluno (inclusive um SET ROLE) dentro de readOnly. A aba Dados lê
    // tabelas ao mesmo tempo: ela precisa continuar sendo o dono do banco, não o papel do diagnóstico.
    const diagnostic = engine.readOnly(async (session) => {
      await session.queryRows('SET ROLE visitante')
      await new Promise((r) => setTimeout(r, 50))
      return session.query('SELECT current_user::text AS u')
    })
    const ui = engine.query('SELECT current_user::text AS u, count(*)::int AS n FROM secreta')
    const [inDiagnostic, inUi] = await Promise.all([diagnostic, ui])
    expect(inDiagnostic).toEqual([{ u: 'visitante' }])
    expect(inUi).toEqual([{ u: 'postgres', n: 0 }])
  })

  it('queryRows de um SQL com SET ROLE não deixa o papel preso na sessão', async () => {
    await engine.reset()
    await engine.run('CREATE ROLE visitante NOLOGIN')
    // O "esperado" de um passo é a própria solução, que pode começar com SET ROLE.
    const res = await engine.queryRows("SET ROLE visitante; SELECT current_user::text AS u")
    expect(res.rows).toEqual([['visitante']])
    expect(await engine.query('SELECT current_user::text AS u')).toEqual([{ u: 'postgres' }])
  })

  it('consultas soltas da interface esperam o fim do script do aluno (SET ROLE não vaza para elas)', async () => {
    await engine.reset()
    await engine.run('CREATE TABLE secreta (id INT); CREATE ROLE visitante NOLOGIN')
    // A aba Dados lê tabelas assim que o banco muda; sem fila, a leitura cairia no meio do SET ROLE do aluno.
    const student = engine.run('SET ROLE visitante; SELECT pg_sleep(0.05); SELECT 1')
    const ui = engine.query('SELECT count(*)::int AS n FROM secreta')
    const [out, rows] = await Promise.all([student, ui])
    expect(out.ok).toBe(true)
    expect(rows).toEqual([{ n: 0 }])
  })
})

import { describe, expect, it } from 'vitest'
import { stepRefs } from '../lessons/registry'
import { explainSql, type Annotation } from './explainer'

async function explain(sql: string): Promise<Annotation[]> {
  const r = await explainSql(sql)
  if (!r.ok) throw new Error('não explicou: ' + r.message)
  return r.annotations
}
const snippets = (sql: string, a: Annotation[]) => a.map((x) => sql.slice(x.from, x.to))
const textOf = (a: Annotation[]) => a.map((x) => x.text).join('\n')

describe('explainSql: posições', () => {
  it('CREATE TABLE: cada coluna aponta exatamente para o seu trecho', async () => {
    const sql = `CREATE TABLE produtos (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  preco NUMERIC(10,2) NOT NULL CHECK (preco > 0),
  categoria_id INT REFERENCES categorias(id) ON DELETE CASCADE
);`
    const a = await explain(sql)
    expect(a.map((x) => x.depth)).toEqual([0, 1, 1, 1])
    expect(snippets(sql, a).slice(1)).toEqual([
      'id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY',
      'preco NUMERIC(10,2) NOT NULL CHECK (preco > 0)',
      'categoria_id INT REFERENCES categorias(id) ON DELETE CASCADE',
    ])
    const t = textOf(a)
    expect(t).toContain('Cria a tabela `produtos`')
    expect(t).toContain('chave primária')
    expect(t).toContain('automaticamente')
    expect(t).toContain('ideal para dinheiro')
    expect(t).toContain('obrigatória')
    expect(t).toContain('`preco > 0`')
    expect(t).toContain('chave estrangeira')
    expect(t).toContain('apagadas junto')
  })

  it('acentos antes do trecho não deslocam as posições (parser usa bytes)', async () => {
    const sql = "INSERT INTO clientes (nome) VALUES ('José Ávila'), ('Zé');"
    const a = await explain(sql)
    expect(snippets(sql, a).slice(2)).toEqual(["('José Ávila')", "('Zé')"])
    expect(a[2].text).toContain('`nome` = `\'José Ávila\'`')
  })

  it('SELECT: itens da lista, FROM, WHERE, ORDER BY, LIMIT e OFFSET', async () => {
    const sql = "SELECT nome AS cliente, 19.90 * 3 AS total FROM clientes WHERE cpf = '333' ORDER BY nome DESC LIMIT 2 OFFSET 2;"
    const a = await explain(sql)
    expect(snippets(sql, a)).toEqual([
      sql.slice(0, -1),
      'nome AS cliente',
      '19.90 * 3 AS total',
      'FROM clientes',
      "WHERE cpf = '333'",
      'ORDER BY nome DESC',
      'LIMIT 2',
      'OFFSET 2',
    ])
    const t = textOf(a)
    expect(t).toContain('aparece no resultado com o nome `cliente`')
    expect(t).toContain('um cálculo: `19.90 * 3`')
    expect(t).toContain('`cpf` é igual a `\'333\'`')
    expect(t).toContain('Z → A')
    expect(t).toContain('**no máximo `2`**')
  })

  it('WHERE com AND/OR/NULL/IN/BETWEEN: cada condição tem o seu intervalo', async () => {
    const sql = "SELECT 1 FROM t WHERE (a IN (1, 2) OR b BETWEEN 1 AND 5) AND telefone IS NOT NULL AND nome LIKE 'C%';"
    const a = await explain(sql)
    const subs = a.filter((x) => x.depth === 2)
    // Os parênteses redundantes que envolvem o grupo inteiro ficam de fora; os internos (IN (...)) ficam.
    expect(snippets(sql, subs)).toEqual(['a IN (1, 2) OR b BETWEEN 1 AND 5', 'telefone IS NOT NULL', "nome LIKE 'C%'"])
    expect(a.find((x) => x.depth === 1 && x.text.includes('todas'))).toBeTruthy()
    const t = textOf(subs)
    expect(t).toContain('tem valor')
    expect(t).toContain('casa com o padrão')
  })

  it('vários comandos, comentários antes e índice do comando', async () => {
    const sql = "-- primeiro\nSELECT 1;\n/* segundo */\nDELETE FROM t WHERE id = 1;"
    const a = await explain(sql)
    const heads = a.filter((x) => x.depth === 0)
    expect(heads.map((x) => x.statement)).toEqual([0, 1])
    expect(snippets(sql, heads)).toEqual(['SELECT 1', 'DELETE FROM t WHERE id = 1'])
  })

  it('texto incompleto vira erro sem lançar', async () => {
    const r = await explainSql('SELEC 1')
    expect(r.ok).toBe(false)
    // Vazio ou só comentário é o estado inicial do editor: não é erro, apenas não há o que explicar.
    for (const empty of ['', '   \n', '-- só um comentário\n']) {
      expect(await explainSql(empty)).toEqual({ ok: true, annotations: [] })
    }
  })
})

describe('explainSql: avisos', () => {
  it('UPDATE e DELETE sem WHERE são marcados como perigosos', async () => {
    for (const sql of ['UPDATE t SET a = 1;', 'DELETE FROM t;']) {
      const [head] = await explain(sql)
      expect(head.warn, sql).toBe(true)
      expect(head.text).toContain('Sem `WHERE`')
    }
    for (const sql of ['UPDATE t SET a = 1 WHERE id = 1;', 'DELETE FROM t WHERE id = 1;']) {
      expect((await explain(sql))[0].warn, sql).toBeFalsy()
    }
  })

  it('= NULL é sinalizado', async () => {
    const a = await explain('SELECT 1 FROM t WHERE telefone = NULL;')
    expect(a.some((x) => x.warn && x.text.includes('nunca'))).toBe(true)
  })

  it('DROP é sempre avisado', async () => {
    const [head] = await explain('DROP TABLE IF EXISTS t CASCADE;')
    expect(head.warn).toBe(true)
    expect(head.text).toContain('IF EXISTS')
    expect(head.text).toContain('CASCADE')
  })
})

describe('explainSql: ALTER, UPDATE e INSERT', () => {
  it('ALTER TABLE com vários comandos', async () => {
    const sql = 'ALTER TABLE clientes ADD COLUMN email VARCHAR(150) NOT NULL, ALTER COLUMN criado_em SET DEFAULT now(), DROP COLUMN x;'
    const a = await explain(sql)
    expect(snippets(sql, a).slice(1)).toEqual(['ADD COLUMN email VARCHAR(150) NOT NULL', 'ALTER COLUMN criado_em SET DEFAULT now()', 'DROP COLUMN x'])
    const t = textOf(a)
    expect(t).toContain('texto de **até 150**')
    expect(t).toContain('valor padrão de `criado_em`: `now()`')
    expect(t).toContain('Apaga')
  })

  it('UPDATE: cada atribuição e o WHERE', async () => {
    const sql = "UPDATE clientes SET telefone = '(31) 9', data_nascimento = '2001-03-09' WHERE cpf = '444';"
    const a = await explain(sql)
    expect(snippets(sql, a).slice(1)).toEqual(["telefone = '(31) 9'", "data_nascimento = '2001-03-09'", "WHERE cpf = '444'"])
    expect(a[1].text).toBe("Define `telefone` = `'(31) 9'`.")
  })

  it('INSERT sem lista de colunas avisa sobre a ordem', async () => {
    const a = await explain("INSERT INTO t VALUES (1, 'x');")
    expect(textOf(a)).toContain('ordem de todas as colunas')
  })
})

describe('explainSql: o currículo inteiro', () => {
  it('toda solução de referência é explicável, com intervalos válidos', async () => {
    for (const { step } of stepRefs) {
      const sql = step.solution
      const a = await explain(sql)
      const statements = new Set(a.map((x) => x.statement))
      expect(a.length, `${step.id}: sem explicação`).toBeGreaterThan(0)
      for (const x of a) {
        expect(x.from, `${step.id}: from`).toBeGreaterThanOrEqual(0)
        expect(x.to, `${step.id}: to`).toBeLessThanOrEqual(sql.length)
        expect(x.to, `${step.id}: faixa vazia`).toBeGreaterThan(x.from)
        expect(x.text, `${step.id}: explicação genérica de fallback`).not.toContain('ainda sem explicação detalhada')
      }
      // Todo comando tem o seu cabeçalho (depth 0).
      for (const s of statements) expect(a.some((x) => x.statement === s && x.depth === 0), `${step.id}: cmd ${s} sem cabeçalho`).toBe(true)
    }
  })
})

describe('explainSql: JOIN, subconsultas, CTE e UNION', () => {
  it('cada JOIN ganha o seu trecho, o tipo e a condição', async () => {
    const sql = 'SELECT c.nome FROM pedidos p JOIN clientes c ON c.id = p.cliente_id LEFT JOIN itens_pedido i ON i.pedido_id = p.id;'
    const a = await explain(sql)
    const joins = a.filter((x) => x.depth === 2)
    expect(snippets(sql, joins)).toEqual(['JOIN clientes c ON c.id = p.cliente_id', 'LEFT JOIN itens_pedido i ON i.pedido_id = p.id'])
    expect(joins[0].text).toContain('INNER JOIN')
    expect(joins[0].text).toContain('pela condição `c.id = p.cliente_id`')
    expect(joins[1].text).toContain('LEFT JOIN')
    expect(a.find((x) => x.text.includes('combina linhas de várias tabelas'))).toBeTruthy()
  })

  it('subconsulta escalar: o trecho entre parênteses e as cláusulas de dentro', async () => {
    const sql = 'SELECT nome FROM produtos WHERE preco > (SELECT avg(preco) FROM produtos);'
    const a = await explain(sql)
    const sub = a.find((x) => x.text.includes('Subconsulta escalar'))!
    expect(sql.slice(sub.from, sub.to)).toBe('(SELECT avg(preco) FROM produtos)')
    const inner = a.filter((x) => x.depth > sub.depth)
    expect(snippets(sql, inner)).toEqual(['avg(preco)', 'FROM produtos'])
    expect(inner[0].text).toContain('a **média** de `preco`')
    expect(a.find((x) => x.depth === 1 && x.text.includes('`preco` é maior que o resultado de uma **subconsulta**'))).toBeTruthy()
  })

  it('EXISTS correlacionado e IN com subconsulta', async () => {
    const sql = "SELECT nome FROM produtos pr WHERE NOT EXISTS (SELECT 1 FROM itens_pedido i WHERE i.produto_id = pr.id) AND id IN (SELECT 1 FROM x);"
    const t = textOf(await explain(sql))
    expect(t).toContain('`NOT EXISTS`')
    expect(t).toContain('correlacionada')
    expect(t).toContain('Subconsulta** de `IN`')
    expect(t).toContain('`i.produto_id` é igual a `pr.id`')
  })

  it('CTE: o nome, o corpo e o SELECT principal', async () => {
    const sql = 'WITH total AS (SELECT pedido_id, sum(quantidade) AS q FROM itens GROUP BY pedido_id) SELECT avg(q) AS media FROM total;'
    const a = await explain(sql)
    const cte = a.find((x) => x.text.includes('**CTE `total`**'))!
    expect(sql.slice(cte.from, cte.to)).toBe('total AS (SELECT pedido_id, sum(quantidade) AS q FROM itens GROUP BY pedido_id)')
    expect(a.some((x) => x.text.includes('a **soma** de `quantidade`') && x.depth > cte.depth)).toBe(true)
    expect(a.some((x) => x.depth === cte.depth && sql.slice(x.from, x.to) === 'avg(q) AS media')).toBe(true)
    expect(a.some((x) => x.depth === cte.depth && sql.slice(x.from, x.to) === 'FROM total')).toBe(true)
  })

  it('CTE recursiva: âncora e passo recursivo', async () => {
    const sql = 'WITH RECURSIVE a AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM a WHERE n < 3) SELECT n FROM a;'
    const t = textOf(await explain(sql))
    expect(t).toContain('**recursiva**')
    expect(t).toContain('**Âncora**')
    expect(t).toContain('**Passo recursivo**')
    expect(t).toContain('**UNION ALL**')
  })

  it('UNION: cada consulta, o operador e o ORDER BY do conjunto', async () => {
    const sql = "SELECT nome, 'a' AS t FROM clientes UNION SELECT nome, 'b' AS t FROM categorias ORDER BY nome;"
    const a = await explain(sql)
    expect(snippets(sql, a.filter((x) => x.depth === 1))).toEqual([
      "SELECT nome, 'a' AS t FROM clientes",
      'UNION',
      "SELECT nome, 'b' AS t FROM categorias",
      'ORDER BY nome',
    ])
    expect(textOf(a)).toContain('**Consulta 2** de 2')
  })

  it('INSERT ... SELECT e subconsultas dentro do VALUES', async () => {
    const sql1 = "INSERT INTO produtos (categoria_id, nome) SELECT id, 'Boné' FROM categorias WHERE nome = 'Acessórios';"
    const a1 = await explain(sql1)
    expect(textOf(a1)).toContain('resultado de uma consulta')
    expect(snippets(sql1, a1.filter((x) => x.depth === 2))).toEqual(['id', "'Boné'", 'FROM categorias', "WHERE nome = 'Acessórios'"])

    const sql2 = "INSERT INTO itens (pedido_id, qtd) VALUES ((SELECT id FROM pedidos WHERE criado_em = '2026-01-10'), 2);"
    const a2 = await explain(sql2)
    const sub = a2.find((x) => x.text.includes('Subconsulta escalar'))!
    expect(sql2.slice(sub.from, sub.to)).toBe("(SELECT id FROM pedidos WHERE criado_em = '2026-01-10')")
  })

  it('CASE, COALESCE, COUNT(DISTINCT) e conversões', async () => {
    const sql = "SELECT CASE WHEN a < 1 THEN 'x' ELSE 'y' END AS c, coalesce(sum(b), 0) AS s, count(DISTINCT d) AS n, a::text AS t FROM t;"
    const a = await explain(sql)
    const t = textOf(a)
    expect(t).toContain('uma **decisão** (`CASE`)')
    expect(t).toContain("- `a < 1` → `'x'`")
    expect(t).toContain("- senão → `'y'`")
    expect(t).toContain('primeiro valor **não vazio**')
    expect(t).toContain('valores **distintos** de `d`')
    expect(t).toContain('**convertido** para o tipo `text`')
  })

  it('tabela de valores fixos no FROM (VALUES)', async () => {
    const sql = "SELECT v.n FROM (VALUES (1), (2), (3)) AS v(n);"
    const a = await explain(sql)
    expect(textOf(a)).toContain('3 linhas de 1 coluna')
  })
})

describe('explainSql: regressões', () => {
  it('INSERT ... SELECT com JOIN: o ON do JOIN não encerra o SELECT (só ON CONFLICT encerra)', async () => {
    const sql =
      "INSERT INTO t (a) SELECT p.id FROM (VALUES ('x', 1), ('y', 2)) AS v(pedido, q) JOIN pedidos p ON p.criado_em = v.pedido::timestamp JOIN produtos pr ON pr.nome = v.q;"
    const a = await explain(sql)
    const joins = a.filter((x) => x.text.startsWith('Junta '))
    expect(snippets(sql, joins)).toEqual(['JOIN pedidos p ON p.criado_em = v.pedido::timestamp', 'JOIN produtos pr ON pr.nome = v.q'])
    expect(textOf(a)).toContain('2 linhas de 2 colunas')
    // O FROM cobre o comando até o fim, não só até o primeiro ON.
    const from = a.find((x) => x.text.includes('combina linhas de várias tabelas'))!
    expect(sql.slice(from.from, from.to).endsWith('pr.nome = v.q')).toBe(true)
  })

  it('GROUP BY mostra o texto original e FROM de uma CTE diz que é uma CTE', async () => {
    const sql = 'WITH g AS (SELECT c.id, count(*) AS n FROM clientes c GROUP BY c.id, c.nome) SELECT n FROM g ORDER BY n DESC, n;'
    const t = textOf(await explain(sql))
    expect(t).toContain('Agrupa as linhas por `c.id, c.nome`')
    expect(t).toContain('Lê o resultado da **CTE** `g`')
    expect(t).not.toContain(':.')
  })
})

describe('explainSql: views, funções, triggers, índices, transações, permissões', () => {
  it('view: o nome, a consulta de dentro e as suas cláusulas', async () => {
    const sql = "CREATE VIEW relatorios.v AS SELECT nome FROM clientes WHERE ativo;"
    const a = await explain(sql)
    expect(a[0].text).toContain('**Cria a view `relatorios.v`**')
    expect(a[0].text).toContain('não guarda dados')
    expect(snippets(sql, a.filter((x) => x.depth === 1))).toEqual(['SELECT nome FROM clientes WHERE ativo'])
    expect(snippets(sql, a.filter((x) => x.depth === 2))).toEqual(['nome', 'FROM clientes', 'WHERE ativo'])
  })

  it('view materializada e REFRESH CONCURRENTLY', async () => {
    expect(textOf(await explain('CREATE MATERIALIZED VIEW mv AS SELECT 1 AS a;'))).toContain('guardado')
    const t = textOf(await explain('REFRESH MATERIALIZED VIEW CONCURRENTLY mv;'))
    expect(t).toContain('substitui')
    expect(t).toContain('não fica bloqueado')
  })

  it('função: assinatura, linguagem e o que o corpo faz', async () => {
    const sql = `CREATE FUNCTION baixar(p_produto text, p_qtd integer) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE novo integer;
BEGIN
  UPDATE produtos SET estoque = estoque - p_qtd WHERE nome = p_produto RETURNING estoque INTO novo;
  IF NOT FOUND THEN RAISE EXCEPTION 'x'; END IF;
  RETURN novo;
END $$;`
    const a = await explain(sql)
    expect(a[0].text).toContain('`baixar(p_produto text, p_qtd integer)`')
    expect(a[0].text).toContain('PL/pgSQL')
    const body = a.find((x) => x.depth === 1)!
    expect(sql.slice(body.from, body.to)).toMatch(/^\$\$[\s\S]*\$\$$/)
    for (const piece of ['DECLARE', 'RETURNING ... INTO', 'IF ... THEN', 'RAISE EXCEPTION', 'FOUND']) expect(body.text).toContain(piece)
  })

  it('trigger: quando, condição WHEN e função, cada um no seu trecho', async () => {
    const sql = 'CREATE TRIGGER trg AFTER UPDATE OF preco ON produtos FOR EACH ROW WHEN (OLD.preco IS DISTINCT FROM NEW.preco) EXECUTE FUNCTION audita();'
    const a = await explain(sql)
    expect(a[0].text).toContain('AFTER UPDATE')
    expect(a[0].text).toContain('`preco`')
    expect(snippets(sql, a.filter((x) => x.depth === 1))).toEqual(['AFTER UPDATE OF preco', 'WHEN (OLD.preco IS DISTINCT FROM NEW.preco)', 'EXECUTE FUNCTION audita()'])
    expect(textOf(a)).toContain('IS DISTINCT FROM')
  })

  it('índice: colunas na ordem, único, de expressão e parcial', async () => {
    const sql = 'CREATE UNIQUE INDEX uq ON produtos (lower(nome), preco DESC) WHERE ativo;'
    const a = await explain(sql)
    expect(a[0].text).toContain('índice **único**')
    expect(snippets(sql, a.filter((x) => x.depth === 1))).toEqual(['(lower(nome), preco DESC)', 'WHERE ativo'])
    const t = textOf(a)
    expect(t).toContain('`lower(nome)`')
    expect(t).toContain('`preco` (decrescente)')
    expect(t).toContain('expressão')
    expect(t).toContain('Índice parcial')
  })

  it('cada comando de uma transação tem a sua explicação', async () => {
    const sql = 'BEGIN; SAVEPOINT s1; ROLLBACK TO SAVEPOINT s1; COMMIT; ROLLBACK;'
    const heads = (await explain(sql)).filter((x) => x.depth === 0).map((x) => x.text)
    expect(heads[0]).toContain('Abre uma transação')
    expect(heads[1]).toContain('ponto de retorno')
    expect(heads[2]).toContain('desfaz só o que veio **depois**')
    expect(heads[3]).toContain('Confirma')
    expect(heads[4]).toContain('Desfaz')
  })

  it('GRANT, SET ROLE, search_path, schema, papel, EXPLAIN e ANALYZE', async () => {
    const t = async (sql: string) => textOf(await explain(sql))
    expect(await t('GRANT SELECT ON relatorios.v TO analista;')).toContain('**Concede** `SELECT` sobre a tabela ou view `relatorios.v` ao papel `analista`')
    expect(await t('GRANT USAGE ON SCHEMA relatorios TO analista;')).toContain('o schema `relatorios`')
    expect(await t('SET ROLE analista;')).toContain('Passa a agir como')
    expect(await t('SET search_path TO relatorios, public;')).toContain('`relatorios`, depois em `public`')
    expect(await t('CREATE SCHEMA relatorios;')).toContain('"pasta"')
    expect(await t('CREATE ROLE analista NOLOGIN;')).toContain('sem login')
    expect(await t('ANALYZE visitas;')).toContain('Atualiza as estatísticas')
    const plan = await explain('EXPLAIN ANALYZE SELECT * FROM visitas WHERE sessao = 1;')
    expect(plan[0].text).toContain('executa a consulta de verdade')
    expect(textOf(plan)).toContain('`sessao` é igual a `1`')
  })

  it('funções de janela: o que fazem, a partição e a ordem; também dentro de round()', async () => {
    const sql = 'SELECT row_number() OVER (PARTITION BY c ORDER BY p DESC) AS n, round(avg(x) OVER (PARTITION BY c), 2) AS m, sum(y) OVER (ORDER BY d) AS acc FROM t;'
    const a = await explain(sql)
    const items = a.filter((x) => x.depth === 1)
    expect(items[0].text).toContain('**numera** as linhas')
    expect(items[0].text).toContain('**dentro de cada grupo** de `c`')
    expect(items[0].text).toContain('`p` (decrescente)')
    expect(items[1].text).toContain('round()')
    expect(items[1].text).toContain('tira a média')
    expect(items[2].text).toContain('acumulando até a linha atual')
    expect(items[2].text).toContain('Cada linha continua aparecendo')
  })

  it('UPDATE ... FROM: cada atribuição, o FROM e o WHERE', async () => {
    const sql = 'UPDATE produtos pr SET estoque = pr.estoque + i.quantidade FROM itens_pedido i WHERE i.produto_id = pr.id;'
    const a = await explain(sql)
    expect(snippets(sql, a.filter((x) => x.depth === 1))).toEqual(['estoque = pr.estoque + i.quantidade', 'FROM itens_pedido i', 'WHERE i.produto_id = pr.id'])
  })
})

import type { Module } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import { catalog, queryStep, seedStep, uses } from '../helpers'
import theoryViews from './theory/01-views.md?raw'
import theoryFuncoes from './theory/02-funcoes.md?raw'
import theoryTriggers from './theory/03-triggers.md?raw'
import theoryAuditoria from './theory/04-auditoria.md?raw'

const NOVA_VENDA = `-- Carga: uma venda nova entra (da Ana, em 10/05/2026)
INSERT INTO pedidos (cliente_id, criado_em, status)
SELECT id, '2026-05-10 14:00', 'pago' FROM clientes WHERE cpf = '111.111.111-11';

INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
SELECT p.id, pr.id, 5, pr.preco
FROM pedidos p, produtos pr
WHERE p.criado_em = '2026-05-10 14:00' AND pr.nome = 'Meia';
`

/** A função existe e foi escrita na linguagem indicada. */
const functionLanguage = (name: string, language: string) =>
  catalog(
    `A função \`${name}\` é escrita em ${language}`,
    `SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.proname = '${name}' AND l.lanname = '${language}')`,
    `A função ${name} não existe ou não está em ${language}.`,
  )

/** O corpo da função contém o padrão (sem diferenciar maiúsculas). */
const functionBody = (name: string, pattern: string, label: string) =>
  catalog(label, `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = '${name}' AND prosrc ~* '${pattern}')`, `O corpo da função ${name} não tem o que era esperado.`)

export const m10: Module = {
  id: 'm10',
  title: 'Views, funções e triggers',
  subtitle: 'Consultas com nome, lógica no banco e reações automáticas',
  emoji: '⚡',
  lessons: [
    {
      id: 'm10-l1',
      title: 'Views e views materializadas',
      summary: 'Dar nome a uma consulta e guardar o resultado de um relatório pesado.',
      theory: theoryViews,
      steps: [
        {
          id: 'm10-l1-s1',
          title: 'A view vw_vendas',
          goal: `Crie a view \`vw_vendas\`, **uma linha por item vendido**, com as colunas, **nesta ordem**:

\`pedido\` (a data \`criado_em\` do pedido), \`cliente\` (nome), \`produto\` (nome), \`quantidade\`, \`subtotal\` (quantidade × preço unitário) e \`status\` (do pedido).`,
          starter: '-- CREATE VIEW vw_vendas AS ...\n',
          hints: ['`CREATE VIEW nome AS SELECT ...`: o `SELECT` é a consulta de quatro tabelas que você já conhece.', 'Dê apelidos às colunas com `AS` para que os nomes da view saiam como pedido.'],
          solution: `CREATE VIEW vw_vendas AS
SELECT p.criado_em AS pedido,
       c.nome AS cliente,
       pr.nome AS produto,
       i.quantidade,
       i.quantidade * i.preco_unitario AS subtotal,
       p.status
FROM pedidos p
JOIN clientes c ON c.id = p.cliente_id
JOIN itens_pedido i ON i.pedido_id = p.id
JOIN produtos pr ON pr.id = i.produto_id;`,
          wrong: [
            `CREATE VIEW vw_vendas AS
SELECT p.criado_em AS pedido, c.nome AS cliente, pr.nome AS produto, i.quantidade, i.quantidade * i.preco_unitario AS subtotal
FROM pedidos p JOIN clientes c ON c.id = p.cliente_id JOIN itens_pedido i ON i.pedido_id = p.id JOIN produtos pr ON pr.id = i.produto_id;`,
            `CREATE MATERIALIZED VIEW vw_vendas AS
SELECT p.criado_em AS pedido, c.nome AS cliente, pr.nome AS produto, i.quantidade, i.quantidade * i.preco_unitario AS subtotal, p.status
FROM pedidos p JOIN clientes c ON c.id = p.cliente_id JOIN itens_pedido i ON i.pedido_id = p.id JOIN produtos pr ON pr.id = i.produto_id;`,
          ],
          checks: [
            { kind: 'view', name: 'vw_vendas', materialized: false },
            catalog(
              'As colunas são pedido, cliente, produto, quantidade, subtotal e status, nessa ordem',
              `SELECT string_agg(column_name, ',' ORDER BY ordinal_position) = 'pedido,cliente,produto,quantidade,subtotal,status'
                 FROM information_schema.columns WHERE table_name = 'vw_vendas'`,
              'Confira os nomes e a ordem das colunas da view.',
            ),
            catalog('A view tem uma linha por item vendido', 'SELECT (SELECT count(*) FROM vw_vendas) = (SELECT count(*) FROM itens_pedido)', 'O número de linhas da view não bate com o de itens vendidos.'),
          ],
        },
        queryStep({
          id: 'm10-l1-s2',
          title: 'Consultando a view',
          goal: 'Usando **só a view** (sem citar as tabelas de baixo), mostre `cliente` e `total` (soma dos `subtotal`) dos pedidos **não cancelados**, do maior para o menor total (empate: pelo nome).',
          hints: ['Uma view se consulta como uma tabela: `FROM vw_vendas`.', "`WHERE status <> 'cancelado' GROUP BY cliente`"],
          solution: "SELECT cliente, sum(subtotal) AS total\nFROM vw_vendas\nWHERE status <> 'cancelado'\nGROUP BY cliente\nORDER BY total DESC, cliente;",
          wrong: ["SELECT cliente, sum(subtotal) AS total FROM vw_vendas GROUP BY cliente ORDER BY total DESC, cliente;"],
          ordered: true,
          also: [uses('\\bvw_vendas\\b', 'Usou a view vw_vendas')],
        }),
        {
          id: 'm10-l1-s3',
          title: 'Uma view materializada',
          goal: 'Crie a view **materializada** `mv_faturamento_mensal` com as colunas `mes` (`AAAA-MM`) e `faturamento` (soma de quantidade × preço unitário), só de pedidos **não cancelados**, agrupada por mês.',
          starter: '-- CREATE MATERIALIZED VIEW mv_faturamento_mensal AS ...\n',
          hints: ["`CREATE MATERIALIZED VIEW nome AS SELECT ...`", "`to_char(p.criado_em, 'YYYY-MM') AS mes` e `GROUP BY 1`"],
          solution: `CREATE MATERIALIZED VIEW mv_faturamento_mensal AS
SELECT to_char(p.criado_em, 'YYYY-MM') AS mes,
       sum(i.quantidade * i.preco_unitario) AS faturamento
FROM pedidos p
JOIN itens_pedido i ON i.pedido_id = p.id
WHERE p.status <> 'cancelado'
GROUP BY 1;`,
          wrong: [
            `CREATE VIEW mv_faturamento_mensal AS
SELECT to_char(p.criado_em, 'YYYY-MM') AS mes, sum(i.quantidade * i.preco_unitario) AS faturamento
FROM pedidos p JOIN itens_pedido i ON i.pedido_id = p.id WHERE p.status <> 'cancelado' GROUP BY 1;`,
          ],
          checks: [
            { kind: 'view', name: 'mv_faturamento_mensal', materialized: true },
            catalog(
              'As colunas são mes e faturamento',
              `SELECT string_agg(attname, ',' ORDER BY attnum) = 'mes,faturamento' FROM pg_attribute
                WHERE attrelid = 'mv_faturamento_mensal'::regclass AND attnum > 0 AND NOT attisdropped`,
              'Confira os nomes das colunas.',
            ),
            catalog(
              'Tem um mês para cada mês com vendas',
              `SELECT (SELECT count(*) FROM mv_faturamento_mensal) =
                      (SELECT count(DISTINCT to_char(p.criado_em, 'YYYY-MM')) FROM pedidos p JOIN itens_pedido i ON i.pedido_id = p.id WHERE p.status <> 'cancelado')`,
              'O número de meses não bate com o das vendas não canceladas.',
            ),
          ],
        },
        seedStep({
          id: 'm10-l1-s4',
          title: 'Carga: uma venda nova entra',
          goal: 'Rode a **carga** abaixo: ela registra uma venda de **maio de 2026**. Depois confira: a view comum `vw_vendas` já mostra a venda, mas a materializada **continua com o resultado antigo**.',
          hints: ['Execute o script e clique em Verificar. Depois consulte `SELECT * FROM mv_faturamento_mensal` para ver que maio não aparece.'],
          script: NOVA_VENDA,
          checks: [
            { kind: 'rowCount', table: 'pedidos', equals: 7 },
            catalog('A view materializada ainda não tem maio (ficou velha)', "SELECT NOT EXISTS (SELECT 1 FROM mv_faturamento_mensal WHERE mes = '2026-05')", 'A view materializada já tem o mês 2026-05.'),
          ],
        }),
        {
          id: 'm10-l1-s5',
          title: 'Atualize a view materializada',
          goal: 'Atualize `mv_faturamento_mensal` para que ela passe a incluir maio.',
          hints: ['`REFRESH MATERIALIZED VIEW nome;`', '`REFRESH MATERIALIZED VIEW mv_faturamento_mensal;`'],
          solution: 'REFRESH MATERIALIZED VIEW mv_faturamento_mensal;',
          wrong: ['SELECT * FROM mv_faturamento_mensal;'],
          checks: [catalog('A view materializada agora tem o mês 2026-05', "SELECT EXISTS (SELECT 1 FROM mv_faturamento_mensal WHERE mes = '2026-05')", 'Maio ainda não aparece na view materializada.')],
        },
      ],
    },
    {
      id: 'm10-l2',
      title: 'Funções em SQL e PL/pgSQL',
      summary: 'Lógica reutilizável no banco, com variáveis, decisões e erros próprios.',
      theory: theoryFuncoes,
      steps: [
        {
          id: 'm10-l2-s1',
          title: 'A função total_do_pedido',
          goal: 'Crie a função `total_do_pedido(p_pedido_id integer)` que devolve (`numeric`) a **soma de quantidade × preço unitário** dos itens do pedido, ou **0** se o pedido não tem itens. Escreva em `LANGUAGE sql`.',
          starter: '-- CREATE FUNCTION total_do_pedido(...) ...\n',
          hints: ['Use `COALESCE(sum(...), 0)` para devolver zero quando não há itens.', 'O corpo vai entre `$$ ... $$`.'],
          solution: `CREATE FUNCTION total_do_pedido(p_pedido_id integer)
RETURNS numeric
LANGUAGE sql
AS $$
  SELECT COALESCE(sum(quantidade * preco_unitario), 0)
  FROM itens_pedido
  WHERE pedido_id = p_pedido_id
$$;`,
          wrong: [
            `CREATE FUNCTION total_do_pedido(p_pedido_id integer) RETURNS numeric LANGUAGE sql
AS $$ SELECT sum(quantidade * preco_unitario) FROM itens_pedido WHERE pedido_id = p_pedido_id $$;`,
          ],
          checks: [
            { kind: 'function', name: 'total_do_pedido' },
            catalog(
              'Para o pedido de 10/01 devolve 159,70, e 0 para um pedido sem itens',
              `SELECT total_do_pedido((SELECT id FROM pedidos WHERE criado_em = '2026-01-10 10:00')) = 159.70 AND total_do_pedido(0) = 0`,
              'A função não devolve os valores esperados (lembre de devolver 0, e não vazio, quando não há itens).',
            ),
          ],
        },
        queryStep({
          id: 'm10-l2-s2',
          title: 'Usando a função numa consulta',
          goal: 'Liste cada pedido com `pedido` (a data `criado_em`) e `total` (calculado pela **função** que você criou), em ordem cronológica.',
          hints: ['Chame a função no `SELECT`, passando `p.id`.', '`SELECT p.criado_em AS pedido, total_do_pedido(p.id) AS total FROM pedidos p ORDER BY p.criado_em;`'],
          solution: 'SELECT p.criado_em AS pedido, total_do_pedido(p.id) AS total\nFROM pedidos p\nORDER BY p.criado_em;',
          wrong: ['SELECT p.criado_em AS pedido, 0 AS total FROM pedidos p ORDER BY p.criado_em;'],
          ordered: true,
          also: [uses('total_do_pedido\\s*\\(', 'Chamou a função total_do_pedido')],
        }),
        {
          id: 'm10-l2-s3',
          title: 'Uma função com PL/pgSQL',
          goal: `Crie \`baixar_estoque(p_produto text, p_qtd integer)\`, em **\`LANGUAGE plpgsql\`**, que devolve (\`integer\`) o **novo estoque**:

1. diminui \`p_qtd\` do estoque do produto de nome \`p_produto\` (use \`RETURNING estoque INTO\`);
2. se **nenhum produto** tiver esse nome, interrompe com \`RAISE EXCEPTION\`.`,
          starter: '-- CREATE FUNCTION baixar_estoque(...) ... LANGUAGE plpgsql ...\n',
          hints: ['Declare uma variável `novo integer;` em `DECLARE`.', '`IF NOT FOUND THEN RAISE EXCEPTION \'Produto % não existe\', p_produto; END IF;`'],
          solution: `CREATE FUNCTION baixar_estoque(p_produto text, p_qtd integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  novo integer;
BEGIN
  UPDATE produtos SET estoque = estoque - p_qtd
  WHERE nome = p_produto
  RETURNING estoque INTO novo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não existe', p_produto;
  END IF;

  RETURN novo;
END
$$;`,
          wrong: [
            `CREATE FUNCTION baixar_estoque(p_produto text, p_qtd integer) RETURNS integer LANGUAGE sql
AS $$ UPDATE produtos SET estoque = estoque - p_qtd WHERE nome = p_produto RETURNING estoque $$;`,
          ],
          checks: [
            { kind: 'function', name: 'baixar_estoque' },
            functionLanguage('baixar_estoque', 'plpgsql'),
            functionBody('baixar_estoque', 'raise\\s+exception', 'A função recusa produto inexistente com RAISE EXCEPTION'),
          ],
        },
        {
          id: 'm10-l2-s4',
          title: 'Chame a função',
          goal: 'Dê baixa de **2 unidades** da `Meia` chamando a função, e veja o novo estoque devolvido.',
          hints: ["`SELECT baixar_estoque('Meia', 2);`"],
          solution: "SELECT baixar_estoque('Meia', 2);",
          wrong: ["SELECT baixar_estoque('Meia', 1);"],
          checks: [
            uses('baixar_estoque\\s*\\(', 'Chamou a função baixar_estoque'),
            catalog('O estoque da Meia é 96', "SELECT (SELECT estoque FROM produtos WHERE nome = 'Meia') = 96", 'O estoque da Meia não é 96.'),
          ],
        },
        {
          id: 'm10-l2-s5',
          title: 'Erro com mensagem própria',
          goal: 'Chame `baixar_estoque` para um produto que **não existe** (`Produto Fantasma`, 1 unidade) e leia a sua mensagem de erro.',
          hints: ["`SELECT baixar_estoque('Produto Fantasma', 1);`"],
          solution: "SELECT baixar_estoque('Produto Fantasma', 1);",
          expectError: true,
          wrong: ["SELECT baixar_estoque('Meia', 1);"],
          checks: [{ kind: 'lastRunError', code: 'P0001', label: 'O erro veio da sua função (RAISE EXCEPTION, código P0001)' }],
        },
      ],
    },
    {
      id: 'm10-l3',
      title: 'Triggers',
      summary: 'Um carimbo de atualização que ninguém precisa lembrar de gravar.',
      theory: theoryTriggers,
      steps: [
        {
          id: 'm10-l3-s1',
          title: 'A coluna atualizado_em',
          goal: 'Acrescente a `produtos` a coluna `atualizado_em`: `TIMESTAMP`, **obrigatória**, com valor padrão **agora**.',
          hints: ['`ALTER TABLE produtos ADD COLUMN ... TIMESTAMP NOT NULL DEFAULT now();`'],
          solution: 'ALTER TABLE produtos ADD COLUMN atualizado_em TIMESTAMP NOT NULL DEFAULT now();',
          wrong: ['ALTER TABLE produtos ADD COLUMN atualizado_em TIMESTAMP;'],
          checks: [{ kind: 'column', table: 'produtos', name: 'atualizado_em', type: 'timestamp without time zone', nullable: false, hasDefault: true }],
        },
        {
          id: 'm10-l3-s2',
          title: 'A função e o trigger',
          goal: `Faça \`atualizado_em\` ser atualizado **sozinho** a cada \`UPDATE\`:

1. a função \`set_atualizado_em()\` (devolve \`trigger\`, em PL/pgSQL) que coloca \`now()\` em \`NEW.atualizado_em\` e devolve \`NEW\`;
2. o trigger \`trg_produtos_atualizado_em\`: **antes** (\`BEFORE\`) de cada \`UPDATE\` em \`produtos\`, **para cada linha**.`,
          starter: '-- 1) a função de trigger\n\n-- 2) o trigger\n',
          hints: [
            'A função: `RETURNS trigger` e, no corpo, `NEW.atualizado_em := now(); RETURN NEW;`',
            '`CREATE TRIGGER nome BEFORE UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();`',
          ],
          solution: `CREATE FUNCTION set_atualizado_em() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_produtos_atualizado_em
BEFORE UPDATE ON produtos
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();`,
          wrong: [
            `CREATE FUNCTION set_atualizado_em() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.atualizado_em := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_produtos_atualizado_em AFTER UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();`,
          ],
          checks: [
            { kind: 'function', name: 'set_atualizado_em' },
            { kind: 'trigger', table: 'produtos', timing: 'BEFORE', event: 'UPDATE' },
          ],
        },
        {
          id: 'm10-l3-s3',
          title: 'Veja o trigger trabalhar',
          goal: 'Atualize o preço do `Chinelo` para o **mesmo valor** que ele já tem (`SET preco = preco`). Ninguém tocou em `atualizado_em`, mas o trigger deve tê-lo avançado: o Chinelo passa a ter `atualizado_em` **mais recente** que a Meia.',
          hints: ["`UPDATE produtos SET preco = preco WHERE nome = 'Chinelo';`"],
          solution: "UPDATE produtos SET preco = preco WHERE nome = 'Chinelo';",
          wrong: ["UPDATE produtos SET preco = preco WHERE nome = 'Meia';"],
          checks: [
            catalog(
              'O atualizado_em do Chinelo é mais recente que o da Meia',
              "SELECT (SELECT atualizado_em FROM produtos WHERE nome = 'Chinelo') > (SELECT atualizado_em FROM produtos WHERE nome = 'Meia')",
              'O Chinelo ainda não foi atualizado depois da Meia.',
            ),
          ],
        },
      ],
    },
    {
      id: 'm10-l4',
      title: 'Trigger de auditoria',
      summary: 'Registrar automaticamente cada mudança de preço.',
      theory: theoryAuditoria,
      steps: [
        {
          id: 'm10-l4-s1',
          title: 'A tabela de histórico',
          goal: `Crie \`auditoria_precos\` com:

- \`id\`: inteiro, chave primária, automático;
- \`produto_id\`: inteiro obrigatório, chave estrangeira para \`produtos(id)\` com \`ON DELETE CASCADE\`;
- \`preco_antigo\` e \`preco_novo\`: \`NUMERIC(10,2)\`, obrigatórios;
- \`alterado_em\`: \`TIMESTAMP\` obrigatório, padrão agora.`,
          starter: '-- Crie a tabela auditoria_precos\n',
          hints: ['É uma tabela como a `enderecos`: chave primária automática e uma chave estrangeira.'],
          solution: `CREATE TABLE auditoria_precos (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  produto_id   INTEGER NOT NULL REFERENCES produtos (id) ON DELETE CASCADE,
  preco_antigo NUMERIC(10,2) NOT NULL,
  preco_novo   NUMERIC(10,2) NOT NULL,
  alterado_em  TIMESTAMP NOT NULL DEFAULT now()
);`,
          wrong: ['CREATE TABLE auditoria_precos (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, produto_id INTEGER NOT NULL, preco_antigo NUMERIC(10,2) NOT NULL, preco_novo NUMERIC(10,2) NOT NULL, alterado_em TIMESTAMP NOT NULL DEFAULT now());'],
          checks: [
            { kind: 'tableExists', table: 'auditoria_precos' },
            { kind: 'column', table: 'auditoria_precos', name: 'id', primaryKey: true, autoGenerated: true },
            { kind: 'constraint', table: 'auditoria_precos', constraint: 'foreign', columns: ['produto_id'], refTable: 'produtos', onDelete: 'CASCADE' },
            { kind: 'column', table: 'auditoria_precos', name: 'preco_antigo', type: 'numeric(10,2)', nullable: false },
            { kind: 'column', table: 'auditoria_precos', name: 'preco_novo', type: 'numeric(10,2)', nullable: false },
            { kind: 'column', table: 'auditoria_precos', name: 'alterado_em', type: 'timestamp without time zone', nullable: false, hasDefault: true },
          ],
        },
        {
          id: 'm10-l4-s2',
          title: 'A função e o trigger de auditoria',
          goal: `Faça cada **mudança real de preço** gerar um registro:

1. a função \`audita_preco()\` (devolve \`trigger\`) que insere em \`auditoria_precos\` o \`produto_id\` (\`OLD.id\`), o preço antigo (\`OLD.preco\`) e o novo (\`NEW.preco\`);
2. o trigger \`trg_produtos_audita_preco\`: **depois** (\`AFTER\`) de um \`UPDATE OF preco\` em \`produtos\`, para cada linha, **só quando o preço mudou** (\`WHEN (OLD.preco IS DISTINCT FROM NEW.preco)\`).`,
          starter: '-- 1) a função\n\n-- 2) o trigger\n',
          hints: ['Dentro da função: `INSERT INTO auditoria_precos (...) VALUES (OLD.id, OLD.preco, NEW.preco); RETURN NEW;`', '`CREATE TRIGGER ... AFTER UPDATE OF preco ON produtos FOR EACH ROW WHEN (...) EXECUTE FUNCTION audita_preco();`'],
          solution: `CREATE FUNCTION audita_preco() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auditoria_precos (produto_id, preco_antigo, preco_novo)
  VALUES (OLD.id, OLD.preco, NEW.preco);
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_produtos_audita_preco
AFTER UPDATE OF preco ON produtos
FOR EACH ROW
WHEN (OLD.preco IS DISTINCT FROM NEW.preco)
EXECUTE FUNCTION audita_preco();`,
          wrong: [
            `CREATE FUNCTION audita_preco() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO auditoria_precos (produto_id, preco_antigo, preco_novo) VALUES (OLD.id, OLD.preco, NEW.preco); RETURN NEW; END $$;
CREATE TRIGGER trg_produtos_audita_preco BEFORE UPDATE OF preco ON produtos FOR EACH ROW EXECUTE FUNCTION audita_preco();`,
          ],
          checks: [
            { kind: 'function', name: 'audita_preco' },
            { kind: 'trigger', table: 'produtos', name: 'trg_produtos_audita_preco', timing: 'AFTER', event: 'UPDATE' },
            catalog(
              'O trigger só dispara quando o preço muda (tem WHEN)',
              `SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_produtos_audita_preco' AND tgqual IS NOT NULL)`,
              'O trigger não tem a condição WHEN (OLD.preco IS DISTINCT FROM NEW.preco).',
            ),
          ],
        },
        {
          id: 'm10-l4-s3',
          title: 'Mude um preço e veja o registro',
          goal: 'Mude o preço do `Chinelo` para `44.90`. O trigger deve gravar **uma** linha em `auditoria_precos` com o preço antigo e o novo.',
          hints: ["`UPDATE produtos SET preco = 44.90 WHERE nome = 'Chinelo';`", 'Depois: `SELECT * FROM auditoria_precos;`'],
          solution: "UPDATE produtos SET preco = 44.90 WHERE nome = 'Chinelo';",
          wrong: ["UPDATE produtos SET preco = 39.90 WHERE nome = 'Chinelo';", "UPDATE produtos SET estoque = estoque WHERE nome = 'Chinelo';"],
          checks: [
            { kind: 'rowCount', table: 'auditoria_precos', equals: 1 },
            catalog(
              'O registro mostra Chinelo, de 39,90 para 44,90',
              `SELECT count(*) = 1 FROM auditoria_precos a JOIN produtos p ON p.id = a.produto_id
               WHERE p.nome = 'Chinelo' AND a.preco_antigo = 39.90 AND a.preco_novo = 44.90`,
              'O registro de auditoria não tem o que era esperado.',
            ),
          ],
        },
      ],
    },
    {
      id: 'm10-boss',
      title: 'Chefão: vendas só de produto ativo',
      summary: 'Um trigger que defende uma regra que o CHECK não alcança.',
      boss: true,
      theory: `# 👹 Chefão do módulo 10

A loja descontinuou alguns produtos, e o campo \`ativo\` marca isso. O problema: **nada impede** um sistema (ou um script) de vender um produto inativo.

\`CHECK\` não resolve (ele não consulta **outra tabela**), e a chave estrangeira só confere se o produto **existe**. Você vai defender a regra com um **trigger**.`,
      steps: [
        {
          id: 'm10-boss-s1',
          title: 'Bloqueie a venda de produto inativo',
          xp: BOSS_STEP_XP,
          goal: `Crie o trigger \`trg_itens_valida_produto_ativo\`: **antes** (\`BEFORE\`) de cada \`INSERT\` em \`itens_pedido\`, para cada linha, se o produto do item estiver **inativo** (\`ativo = false\`), a venda é recusada com \`RAISE EXCEPTION\` e a mensagem \`Produto <nome> está inativo\`. Se estiver ativo, o item segue normalmente.

Você precisa da função (\`valida_produto_ativo()\`, \`RETURNS trigger\`) **e** do trigger.`,
          starter: '-- função + trigger\n',
          hints: [
            'Na função, busque o produto do `NEW.produto_id`: `SELECT ativo, nome INTO ...` (declare as variáveis em `DECLARE`).',
            "`IF NOT v_ativo THEN RAISE EXCEPTION 'Produto % está inativo', v_nome; END IF; RETURN NEW;`",
            '`CREATE TRIGGER ... BEFORE INSERT ON itens_pedido FOR EACH ROW EXECUTE FUNCTION valida_produto_ativo();`',
          ],
          solution: `CREATE FUNCTION valida_produto_ativo() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_ativo boolean;
  v_nome  text;
BEGIN
  SELECT ativo, nome INTO v_ativo, v_nome FROM produtos WHERE id = NEW.produto_id;
  IF NOT v_ativo THEN
    RAISE EXCEPTION 'Produto % está inativo', v_nome;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_itens_valida_produto_ativo
BEFORE INSERT ON itens_pedido
FOR EACH ROW
EXECUTE FUNCTION valida_produto_ativo();`,
          wrong: [
            `CREATE FUNCTION valida_produto_ativo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER trg_itens_valida_produto_ativo BEFORE INSERT ON itens_pedido FOR EACH ROW EXECUTE FUNCTION valida_produto_ativo();`,
            `CREATE FUNCTION valida_produto_ativo() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE a boolean; BEGIN SELECT ativo INTO a FROM produtos WHERE id = NEW.produto_id; IF NOT a THEN RAISE EXCEPTION 'inativo'; END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_itens_valida_produto_ativo AFTER INSERT ON itens_pedido FOR EACH ROW EXECUTE FUNCTION valida_produto_ativo();`,
          ],
          checks: [
            { kind: 'function', name: 'valida_produto_ativo' },
            { kind: 'trigger', table: 'itens_pedido', name: 'trg_itens_valida_produto_ativo', timing: 'BEFORE', event: 'INSERT' },
            functionBody('valida_produto_ativo', 'ativo', 'A função consulta o campo ativo do produto'),
            functionBody('valida_produto_ativo', 'raise\\s+exception', 'A função recusa com RAISE EXCEPTION'),
          ],
        },
        {
          id: 'm10-boss-s2',
          title: 'Prove que funciona',
          xp: BOSS_STEP_XP,
          goal: 'Num **único script**: marque o `Cinto de Couro` como inativo e tente vender **1 unidade** dele no pedido de `2026-01-10 10:00`. O trigger deve recusar a venda. Repare: como o script falhou, o Postgres desfaz **tudo**, inclusive o `UPDATE`, e o Cinto continua ativo.',
          starter: '-- 1) inativar o Cinto de Couro\n-- 2) tentar inserir o item\n',
          hints: [
            "`UPDATE produtos SET ativo = false WHERE nome = 'Cinto de Couro';`",
            "`INSERT INTO itens_pedido (...) SELECT p.id, pr.id, 1, pr.preco FROM pedidos p, produtos pr WHERE p.criado_em = '2026-01-10 10:00' AND pr.nome = 'Cinto de Couro';`",
          ],
          solution: `UPDATE produtos SET ativo = false WHERE nome = 'Cinto de Couro';

INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
SELECT p.id, pr.id, 1, pr.preco
FROM pedidos p, produtos pr
WHERE p.criado_em = '2026-01-10 10:00' AND pr.nome = 'Cinto de Couro';`,
          expectError: true,
          wrong: [
            `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
SELECT p.id, pr.id, 1, pr.preco FROM pedidos p, produtos pr WHERE p.criado_em = '2026-01-10 10:00' AND pr.nome = 'Cinto de Couro';`,
          ],
          checks: [
            { kind: 'lastRunError', code: 'P0001', label: 'O trigger recusou a venda (RAISE EXCEPTION, P0001)' },
            catalog('O script falhou inteiro: o Cinto de Couro continua ativo', "SELECT ativo FROM produtos WHERE nome = 'Cinto de Couro'", 'O Cinto de Couro ficou inativo: o UPDATE não foi desfeito.'),
          ],
        },
      ],
    },
  ],
}

import type { Module } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import { catalog, hasPrivilege, queryStep, roleExists, uses } from '../helpers'
import theorySchemas from './theory/01-schemas.md?raw'
import theoryPapeis from './theory/02-papeis-permissoes.md?raw'
import theoryFinal from './theory/03-projeto-final.md?raw'

/** O schema existe. */
const schemaExists = (name: string) =>
  catalog(`Existe o schema \`${name}\``, `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = '${name}')`, `O schema ${name} ainda não existe.`)

export const m12: Module = {
  id: 'm12',
  title: 'Schemas, permissões e o projeto final',
  subtitle: 'Organizar, proteger e fechar o LojaDB',
  emoji: '🏆',
  lessons: [
    {
      id: 'm12-l1',
      title: 'Schemas',
      summary: 'Uma "pasta" para os relatórios, com nomes qualificados e search_path.',
      theory: theorySchemas,
      steps: [
        {
          id: 'm12-l1-s1',
          title: 'O schema relatorios',
          goal: 'Crie o schema `relatorios`, onde ficará tudo o que for de **relatório** (separado das tabelas do sistema, que estão em `public`).',
          hints: ['`CREATE SCHEMA nome;`'],
          solution: 'CREATE SCHEMA relatorios;',
          wrong: ['CREATE SCHEMA relatorio;'],
          checks: [schemaExists('relatorios')],
        },
        {
          id: 'm12-l1-s2',
          title: 'Uma view dentro do schema',
          goal: 'Crie `relatorios.vendas_por_cliente`, uma view com `cliente`, `pedidos` (quantos pedidos distintos) e `total` (soma dos subtotais), **só de pedidos não cancelados**, construída **a partir da view `vw_vendas`**.',
          starter: '-- CREATE VIEW relatorios.vendas_por_cliente AS ...\n',
          hints: ['Escreva o nome **qualificado** na criação: `CREATE VIEW relatorios.vendas_por_cliente AS ...`', "`SELECT cliente, count(DISTINCT pedido) AS pedidos, sum(subtotal) AS total FROM vw_vendas WHERE status <> 'cancelado' GROUP BY cliente`"],
          solution: `CREATE VIEW relatorios.vendas_por_cliente AS
SELECT cliente,
       count(DISTINCT pedido) AS pedidos,
       sum(subtotal) AS total
FROM vw_vendas
WHERE status <> 'cancelado'
GROUP BY cliente;`,
          wrong: [
            `CREATE VIEW vendas_por_cliente AS
SELECT cliente, count(DISTINCT pedido) AS pedidos, sum(subtotal) AS total FROM vw_vendas WHERE status <> 'cancelado' GROUP BY cliente;`,
          ],
          checks: [
            { kind: 'view', name: 'relatorios.vendas_por_cliente', materialized: false },
            catalog(
              'As colunas são cliente, pedidos e total',
              `SELECT string_agg(column_name, ',' ORDER BY ordinal_position) = 'cliente,pedidos,total'
                 FROM information_schema.columns WHERE table_schema = 'relatorios' AND table_name = 'vendas_por_cliente'`,
              'Confira os nomes das colunas.',
            ),
          ],
        },
        queryStep({
          id: 'm12-l1-s3',
          title: 'Consultando sem escrever o schema',
          goal: 'No **mesmo script**, ajuste o `search_path` para `relatorios, public` e consulte a view **só pelo nome** (`vendas_por_cliente`, sem `relatorios.`), do maior total para o menor (empate: pelo cliente).',
          hints: ['`SET search_path TO relatorios, public;` e, logo depois, o `SELECT`.'],
          solution: 'SET search_path TO relatorios, public;\nSELECT * FROM vendas_por_cliente ORDER BY total DESC, cliente;',
          wrong: ['SELECT * FROM relatorios.vendas_por_cliente ORDER BY total DESC, cliente;'],
          ordered: true,
          also: [uses('set\\s+search_path', 'Usou SET search_path')],
        }),
      ],
    },
    {
      id: 'm12-l2',
      title: 'Papéis e permissões',
      summary: 'Dar à analista só o que ela precisa, e provar que o resto está bloqueado.',
      theory: theoryPapeis,
      steps: [
        {
          id: 'm12-l2-s1',
          title: 'O papel analista',
          goal: 'Crie o papel `analista`, sem permissão de login (`NOLOGIN`).',
          hints: ['`CREATE ROLE nome NOLOGIN;`'],
          solution: 'CREATE ROLE analista NOLOGIN;',
          wrong: ['CREATE ROLE analista2 NOLOGIN;'],
          checks: [roleExists('analista')],
        },
        {
          id: 'm12-l2-s2',
          title: 'Só ler o relatório',
          goal: 'Dê à `analista` **apenas** duas permissões: `USAGE` no schema `relatorios` e `SELECT` na view `relatorios.vendas_por_cliente`.',
          hints: ['Dois `GRANT`s.', '`GRANT USAGE ON SCHEMA relatorios TO analista;` e `GRANT SELECT ON relatorios.vendas_por_cliente TO analista;`'],
          solution: 'GRANT USAGE ON SCHEMA relatorios TO analista;\nGRANT SELECT ON relatorios.vendas_por_cliente TO analista;',
          wrong: ['GRANT SELECT ON clientes TO analista;'],
          checks: [
            catalog('A analista pode usar o schema relatorios', "SELECT has_schema_privilege('analista', 'relatorios', 'USAGE')", 'A analista ainda não tem USAGE no schema.'),
            hasPrivilege('analista', 'relatorios.vendas_por_cliente', 'SELECT'),
            hasPrivilege('analista', 'clientes', 'SELECT', false),
          ],
        },
        {
          id: 'm12-l2-s3',
          title: 'Provando o bloqueio',
          goal: 'Aja **como** a `analista` (`SET ROLE analista`) e tente ler a tabela `clientes`. O banco deve recusar: ela não tem essa permissão.',
          hints: ['`SET ROLE analista;` e depois `SELECT * FROM clientes;`'],
          solution: 'SET ROLE analista;\nSELECT * FROM clientes;',
          expectError: true,
          wrong: ['SELECT * FROM clientes;'],
          checks: [{ kind: 'lastRunError', code: '42501', label: 'O banco recusou: permissão negada (42501)' }],
        },
        queryStep({
          id: 'm12-l2-s4',
          title: 'O que ela pode ver',
          goal: 'Ainda **como** `analista`, leia a view `relatorios.vendas_por_cliente`, do maior total para o menor (empate: cliente). Funciona, **embora ela não tenha acesso às tabelas de baixo**: a view é a camada de segurança.',
          hints: ['`SET ROLE analista;` e o `SELECT` na view qualificada.'],
          solution: 'SET ROLE analista;\nSELECT * FROM relatorios.vendas_por_cliente ORDER BY total DESC, cliente;',
          wrong: ['SELECT * FROM relatorios.vendas_por_cliente ORDER BY total DESC, cliente;'],
          ordered: true,
          also: [uses('set\\s+role\\s+analista', 'Agiu como a analista (SET ROLE)')],
        }),
      ],
    },
    {
      id: 'm12-l3',
      title: 'Inventário do projeto',
      summary: 'Conte o que o seu LojaDB tem e feche o curso.',
      theory: theoryFinal,
      steps: [
        queryStep({
          id: 'm12-l3-s1',
          title: 'O que o LojaDB tem?',
          goal: `Numa **única linha**, conte o que você construiu, com estas colunas:

- \`tabelas\`: tabelas do schema \`public\` (\`information_schema.tables\`, \`table_type = 'BASE TABLE'\`);
- \`views\`: views comuns em \`public\` e \`relatorios\` (\`pg_views\`);
- \`views_materializadas\`: \`pg_matviews\`;
- \`triggers\`: gatilhos que **não são internos** (\`pg_trigger\`, \`NOT tgisinternal\`).`,
          hints: [
            'Quatro subconsultas escalares no `SELECT`, cada uma com `count(*)`.',
            "`(SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tabelas`",
          ],
          solution: `SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tabelas,
       (SELECT count(*) FROM pg_views WHERE schemaname IN ('public', 'relatorios')) AS views,
       (SELECT count(*) FROM pg_matviews) AS views_materializadas,
       (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal) AS triggers;`,
          wrong: ["SELECT 1 AS tabelas, 1 AS views, 1 AS views_materializadas, 1 AS triggers;"],
          also: [uses('\\(\\s*select', 'Usou subconsultas')],
        }),
      ],
    },
    {
      id: 'm12-boss',
      title: 'Chefão final: o painel do dono',
      summary: 'Tudo junto: materializada, schema, window function, índice único e permissão mínima.',
      boss: true,
      theory: `# 👹 Chefão final

O dono da loja quer um **painel de produtos** que abra **instantaneamente**, mesmo quando o catálogo crescer. Ele será consultado pela \`analista\`, e **só por ela**.

Este desafio reúne o curso inteiro: **view materializada** (para ser rápida), **schema** (organização), **window function** (ranking por categoria), **índice único** (necessário para atualizar sem travar leituras) e **permissão mínima**.

Sem roteiro. Leia o pedido com atenção.`,
      steps: [
        {
          id: 'm12-boss-s1',
          title: 'O painel de produtos',
          xp: BOSS_STEP_XP * 2,
          goal: `Crie, no schema \`relatorios\`, a view **materializada** \`ranking_produtos\` com as colunas, nesta ordem:

- \`categoria\` e \`produto\` (nomes);
- \`faturamento\`: soma de quantidade × preço unitário, só de pedidos **não cancelados**;
- \`posicao\`: o ranking do produto **dentro da categoria** pelo faturamento (1 = o que mais faturou), com \`RANK\`.

Depois:

1. crie um **índice único** sobre \`produto\` nessa view (é ele que permite o \`REFRESH ... CONCURRENTLY\`);
2. dê **somente \`SELECT\`** nela à \`analista\`;
3. atualize a view **sem travar a leitura**, com \`REFRESH MATERIALIZED VIEW CONCURRENTLY\`.`,
          starter: '-- 1) a view materializada\n-- 2) o índice único\n-- 3) a permissão\n-- 4) o refresh concorrente\n',
          hints: [
            'A consulta é a do painel do módulo 8: agrupe por categoria e produto e use `rank() OVER (PARTITION BY ... ORDER BY sum(...) DESC)`.',
            '`CREATE MATERIALIZED VIEW relatorios.ranking_produtos AS ...;` e `CREATE UNIQUE INDEX ... ON relatorios.ranking_produtos (produto);`',
            '`GRANT SELECT ON relatorios.ranking_produtos TO analista;` e `REFRESH MATERIALIZED VIEW CONCURRENTLY relatorios.ranking_produtos;`',
          ],
          solution: `CREATE MATERIALIZED VIEW relatorios.ranking_produtos AS
SELECT c.nome AS categoria,
       pr.nome AS produto,
       sum(i.quantidade * i.preco_unitario) AS faturamento,
       rank() OVER (PARTITION BY c.nome ORDER BY sum(i.quantidade * i.preco_unitario) DESC) AS posicao
FROM itens_pedido i
JOIN pedidos p ON p.id = i.pedido_id
JOIN produtos pr ON pr.id = i.produto_id
JOIN categorias c ON c.id = pr.categoria_id
WHERE p.status <> 'cancelado'
GROUP BY c.nome, pr.nome;

CREATE UNIQUE INDEX uq_ranking_produto ON relatorios.ranking_produtos (produto);

GRANT SELECT ON relatorios.ranking_produtos TO analista;

REFRESH MATERIALIZED VIEW CONCURRENTLY relatorios.ranking_produtos;`,
          wrong: [
            `CREATE VIEW relatorios.ranking_produtos AS
SELECT c.nome AS categoria, pr.nome AS produto, sum(i.quantidade * i.preco_unitario) AS faturamento,
       rank() OVER (PARTITION BY c.nome ORDER BY sum(i.quantidade * i.preco_unitario) DESC) AS posicao
FROM itens_pedido i JOIN pedidos p ON p.id = i.pedido_id JOIN produtos pr ON pr.id = i.produto_id JOIN categorias c ON c.id = pr.categoria_id
WHERE p.status <> 'cancelado' GROUP BY c.nome, pr.nome;
GRANT SELECT ON relatorios.ranking_produtos TO analista;`,
            `CREATE MATERIALIZED VIEW relatorios.ranking_produtos AS
SELECT c.nome AS categoria, pr.nome AS produto, sum(i.quantidade * i.preco_unitario) AS faturamento,
       rank() OVER (PARTITION BY c.nome ORDER BY sum(i.quantidade * i.preco_unitario) DESC) AS posicao
FROM itens_pedido i JOIN pedidos p ON p.id = i.pedido_id JOIN produtos pr ON pr.id = i.produto_id JOIN categorias c ON c.id = pr.categoria_id
WHERE p.status <> 'cancelado' GROUP BY c.nome, pr.nome;
CREATE UNIQUE INDEX uq_ranking_produto ON relatorios.ranking_produtos (produto);`,
          ],
          checks: [
            { kind: 'view', name: 'relatorios.ranking_produtos', materialized: true },
            catalog(
              'As colunas são categoria, produto, faturamento e posicao, nessa ordem',
              `SELECT string_agg(attname, ',' ORDER BY attnum) = 'categoria,produto,faturamento,posicao'
                 FROM pg_attribute WHERE attrelid = 'relatorios.ranking_produtos'::regclass AND attnum > 0 AND NOT attisdropped`,
              'Confira os nomes e a ordem das colunas.',
            ),
            catalog(
              'Tem uma linha para cada produto vendido (pedidos não cancelados)',
              `SELECT (SELECT count(*) FROM relatorios.ranking_produtos) =
                      (SELECT count(DISTINCT i.produto_id) FROM itens_pedido i JOIN pedidos p ON p.id = i.pedido_id WHERE p.status <> 'cancelado')`,
              'O número de produtos da view não bate com o dos produtos vendidos.',
            ),
            uses('\\brank\\s*\\(', 'Usou RANK()'),
            catalog(
              'Existe um índice ÚNICO na view materializada',
              `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'relatorios' AND tablename = 'ranking_produtos' AND indexdef ILIKE 'CREATE UNIQUE INDEX%')`,
              'A view materializada ainda não tem um índice único.',
            ),
            hasPrivilege('analista', 'relatorios.ranking_produtos', 'SELECT'),
            catalog(
              'A analista só pode ler (SELECT), não alterar',
              `SELECT NOT has_table_privilege('analista', 'relatorios.ranking_produtos', 'UPDATE') AND NOT has_table_privilege('analista', 'relatorios.ranking_produtos', 'INSERT') AND NOT has_table_privilege('analista', 'relatorios.ranking_produtos', 'DELETE')`,
              'A analista tem mais permissões do que só SELECT.',
            ),
            uses('refresh\\s+materialized\\s+view\\s+concurrently', 'Atualizou com REFRESH ... CONCURRENTLY'),
          ],
        },
      ],
    },
  ],
}

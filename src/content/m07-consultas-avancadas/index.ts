import type { Module } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import { queryStep, uses } from '../helpers'
import theorySub from './theory/01-subconsultas.md?raw'
import theoryCte from './theory/02-ctes.md?raw'
import theoryCase from './theory/03-case-datas-textos.md?raw'
import theoryUnion from './theory/04-union-recursiva.md?raw'

const SUBQUERY = uses('\\(\\s*select', 'Usou uma subconsulta')

export const m07: Module = {
  id: 'm07',
  title: 'Consultas avançadas',
  subtitle: 'Subconsultas, CTEs, CASE, datas, textos, UNION e recursão',
  emoji: '🧠',
  lessons: [
    {
      id: 'm07-l1',
      title: 'Subconsultas',
      summary: 'Valor único, IN e EXISTS (inclusive correlacionado).',
      theory: theorySub,
      steps: [
        queryStep({
          id: 'm07-l1-s1',
          title: 'Acima da média',
          goal: 'Mostre `nome` e `preco` dos produtos **mais caros que a média**, do mais caro para o mais barato. A média deve ser **calculada** pela consulta, não digitada.',
          hints: ['Compare `preco` com `(SELECT avg(preco) FROM produtos)`.', '`WHERE preco > (SELECT avg(preco) FROM produtos)`'],
          solution: 'SELECT nome, preco\nFROM produtos\nWHERE preco > (SELECT avg(preco) FROM produtos)\nORDER BY preco DESC;',
          wrong: ['SELECT nome, preco FROM produtos WHERE preco > 50 ORDER BY preco DESC;'],
          ordered: true,
          also: [SUBQUERY],
        }),
        queryStep({
          id: 'm07-l1-s2',
          title: 'Quem já comprou',
          goal: 'Mostre o `nome` dos clientes que **já fizeram pelo menos um pedido**, usando `IN` com uma subconsulta, em ordem alfabética.',
          hints: ['A subconsulta devolve os `cliente_id` da tabela `pedidos`.', '`WHERE id IN (SELECT cliente_id FROM pedidos)`'],
          solution: 'SELECT nome\nFROM clientes\nWHERE id IN (SELECT cliente_id FROM pedidos)\nORDER BY nome;',
          wrong: ['SELECT nome FROM clientes WHERE id NOT IN (SELECT cliente_id FROM pedidos) ORDER BY nome;'],
          ordered: true,
          also: [SUBQUERY],
        }),
        queryStep({
          id: 'm07-l1-s3',
          title: 'Nunca vendidos, com NOT EXISTS',
          goal: 'Mostre o `nome` dos produtos que **nunca foram vendidos**, desta vez com `NOT EXISTS` e uma subconsulta **correlacionada**.',
          hints: ['A subconsulta procura itens do produto da linha de fora: `WHERE i.produto_id = pr.id`.', '`WHERE NOT EXISTS (SELECT 1 FROM itens_pedido i WHERE i.produto_id = pr.id)`'],
          solution: 'SELECT pr.nome\nFROM produtos pr\nWHERE NOT EXISTS (SELECT 1 FROM itens_pedido i WHERE i.produto_id = pr.id)\nORDER BY pr.nome;',
          wrong: ['SELECT pr.nome FROM produtos pr WHERE EXISTS (SELECT 1 FROM itens_pedido i WHERE i.produto_id = pr.id) ORDER BY pr.nome;'],
          ordered: true,
          also: [uses('not\\s+exists', 'Usou NOT EXISTS')],
        }),
      ],
    },
    {
      id: 'm07-l2',
      title: 'CTEs: consultas com nome',
      summary: 'WITH para organizar relatórios em etapas.',
      theory: theoryCte,
      steps: [
        queryStep({
          id: 'm07-l2-s1',
          title: 'O ticket médio',
          goal: 'Calcule o `ticket_medio`: a **média do total dos pedidos**, arredondada para 2 casas. Primeiro uma CTE com o total de cada pedido, depois a média sobre ela.',
          hints: ['A CTE agrupa `itens_pedido` por `pedido_id` e soma quantidade × preço.', '`WITH total_pedido AS (...) SELECT round(avg(total), 2) AS ticket_medio FROM total_pedido`'],
          solution: `WITH total_pedido AS (
  SELECT pedido_id, sum(quantidade * preco_unitario) AS total
  FROM itens_pedido
  GROUP BY pedido_id
)
SELECT round(avg(total), 2) AS ticket_medio
FROM total_pedido;`,
          wrong: ['SELECT round(avg(preco_unitario), 2) AS ticket_medio FROM itens_pedido;'],
          also: [uses('with\\s+\\w+\\s+as', 'Usou uma CTE (WITH)')],
        }),
        queryStep({
          id: 'm07-l2-s2',
          title: 'Pedidos acima do ticket médio',
          goal: 'Mostre o `cliente` e o `total` dos pedidos **acima do ticket médio**, do maior total para o menor (empate: pelo nome). Use **duas CTEs encadeadas**: o total de cada pedido e o valor médio.',
          hints: [
            'A segunda CTE usa a primeira: `medio AS (SELECT avg(total) AS valor FROM total_pedido)`.',
            'Na consulta final, junte com `pedidos` e `clientes` e compare `t.total > (SELECT valor FROM medio)`.',
          ],
          solution: `WITH total_pedido AS (
  SELECT pedido_id, sum(quantidade * preco_unitario) AS total
  FROM itens_pedido
  GROUP BY pedido_id
),
medio AS (
  SELECT avg(total) AS valor FROM total_pedido
)
SELECT c.nome AS cliente, t.total
FROM total_pedido t
JOIN pedidos p ON p.id = t.pedido_id
JOIN clientes c ON c.id = p.cliente_id
WHERE t.total > (SELECT valor FROM medio)
ORDER BY t.total DESC, c.nome;`,
          wrong: [
            `WITH total_pedido AS (SELECT pedido_id, sum(quantidade * preco_unitario) AS total FROM itens_pedido GROUP BY pedido_id),
medio AS (SELECT avg(total) AS valor FROM total_pedido)
SELECT c.nome AS cliente, t.total FROM total_pedido t JOIN pedidos p ON p.id = t.pedido_id JOIN clientes c ON c.id = p.cliente_id
WHERE t.total < (SELECT valor FROM medio) ORDER BY t.total DESC, c.nome;`,
          ],
          ordered: true,
          also: [uses('with[\\s\\S]*\\)\\s*,\\s*\\w+\\s+as\\s*\\(', 'Usou duas CTEs encadeadas')],
        }),
      ],
    },
    {
      id: 'm07-l3',
      title: 'CASE, datas e textos',
      summary: 'Faixas de preço, pedidos por mês e manipulação de texto.',
      theory: theoryCase,
      steps: [
        queryStep({
          id: 'm07-l3-s1',
          title: 'Faixas de preço',
          goal: 'Mostre `nome`, `preco` e a coluna `faixa`: **barato** (menos de 50), **médio** (menos de 150) ou **premium** (o resto). Ordene por preço e depois por nome.',
          hints: ['`CASE WHEN ... THEN ... WHEN ... THEN ... ELSE ... END`', "Acentos importam: o texto é `'médio'`."],
          solution: `SELECT nome, preco,
       CASE
         WHEN preco < 50  THEN 'barato'
         WHEN preco < 150 THEN 'médio'
         ELSE 'premium'
       END AS faixa
FROM produtos
ORDER BY preco, nome;`,
          wrong: [`SELECT nome, preco, CASE WHEN preco < 100 THEN 'barato' ELSE 'premium' END AS faixa FROM produtos ORDER BY preco, nome;`],
          ordered: true,
          also: [uses('\\bcase\\b', 'Usou CASE')],
        }),
        queryStep({
          id: 'm07-l3-s2',
          title: 'Pedidos por mês',
          goal: 'Mostre, para cada `mes` no formato `AAAA-MM`, quantos `pedidos` foram feitos, em ordem cronológica.',
          hints: ["`to_char(criado_em, 'YYYY-MM')` formata a data.", 'Agrupe e ordene pelo apelido `mes`.'],
          solution: "SELECT to_char(criado_em, 'YYYY-MM') AS mes, count(*) AS pedidos\nFROM pedidos\nGROUP BY mes\nORDER BY mes;",
          wrong: ["SELECT to_char(criado_em, 'YYYY') AS mes, count(*) AS pedidos FROM pedidos GROUP BY mes ORDER BY mes;"],
          ordered: true,
        }),
        queryStep({
          id: 'm07-l3-s3',
          title: 'Textos',
          goal: 'Mostre o `nome` do cliente **em maiúsculas** e o `dominio` do email (a parte depois do `@`), em ordem de nome.',
          hints: ['`upper(nome)` e `split_part(email, \'@\', 2)`.', 'Dê os apelidos `nome` e `dominio`.'],
          solution: "SELECT upper(nome) AS nome, split_part(email, '@', 2) AS dominio\nFROM clientes\nORDER BY nome;",
          wrong: ["SELECT lower(nome) AS nome, split_part(email, '@', 2) AS dominio FROM clientes ORDER BY nome;"],
          ordered: true,
        }),
      ],
    },
    {
      id: 'm07-l4',
      title: 'UNION e CTE recursiva',
      summary: 'Empilhar consultas e percorrer a árvore de categorias.',
      theory: theoryUnion,
      steps: [
        queryStep({
          id: 'm07-l4-s1',
          title: 'Uma lista só',
          goal: 'Monte uma lista única com o `nome` de todos os clientes e categorias, e uma coluna `tipo` (`cliente` ou `categoria`). Ordene por tipo e depois por nome. Use `UNION`.',
          hints: ["Duas consultas com as mesmas colunas, `nome` e `'cliente' AS tipo`.", 'O `ORDER BY` vai uma vez só, no final.'],
          solution: "SELECT nome, 'cliente' AS tipo FROM clientes\nUNION\nSELECT nome, 'categoria' AS tipo FROM categorias\nORDER BY tipo, nome;",
          wrong: ["SELECT nome, 'cliente' AS tipo FROM clientes ORDER BY tipo, nome;"],
          ordered: true,
          also: [uses('\\bunion\\b', 'Usou UNION')],
        }),
        queryStep({
          id: 'm07-l4-s2',
          title: 'O caminho de cada categoria',
          goal: 'Liste o `caminho` de cada categoria na árvore, como `Vestuário > Camisetas` (as raízes mostram só o próprio nome), em ordem alfabética. Use uma **CTE recursiva**.',
          hints: [
            'A âncora pega as categorias sem pai; o passo recursivo junta cada categoria ao caminho do pai.',
            'A coluna do caminho precisa ter o mesmo tipo nas duas partes: use `nome::text` na âncora.',
            "`a.caminho || ' > ' || c.nome`",
          ],
          solution: `WITH RECURSIVE arvore AS (
  SELECT id, nome, nome::text AS caminho
  FROM categorias
  WHERE categoria_pai_id IS NULL
  UNION ALL
  SELECT c.id, c.nome, a.caminho || ' > ' || c.nome
  FROM categorias c
  JOIN arvore a ON c.categoria_pai_id = a.id
)
SELECT caminho FROM arvore ORDER BY caminho;`,
          wrong: ['SELECT nome AS caminho FROM categorias WHERE categoria_pai_id IS NULL ORDER BY caminho;'],
          ordered: true,
          also: [uses('with\\s+recursive', 'Usou WITH RECURSIVE')],
        }),
      ],
    },
    {
      id: 'm07-boss',
      title: 'Chefão: segmentação de clientes',
      summary: 'CTE + LEFT JOIN + CASE num relatório de marketing.',
      boss: true,
      theory: `# 👹 Chefão do módulo 7

O marketing quer **segmentar os clientes** pelo quanto gastaram. Use o que aprendeu: CTE, \`LEFT JOIN\`, agregação e \`CASE\`.

Armadilha: **todos** os clientes entram no relatório, inclusive quem nunca comprou, e pedidos cancelados **não contam** como gasto. Pense onde colocar o filtro de cancelados para não perder ninguém.`,
      steps: [
        queryStep({
          id: 'm07-boss-s1',
          title: 'Segmentos de cliente',
          xp: BOSS_STEP_XP,
          goal: `Mostre **todos** os clientes com:

- \`nome\`;
- \`total_gasto\`: soma de quantidade × preço unitário dos pedidos **não cancelados**, ou **0** para quem não gastou nada;
- \`segmento\`: \`'VIP'\` se gastou **300 ou mais**, \`'Regular'\` se gastou **mais que 0**, e \`'Sem compras'\` caso contrário.

Ordene por \`total_gasto\` decrescente e, em empate, por nome.`,
          hints: [
            '`LEFT JOIN` para manter quem nunca comprou. O filtro de cancelados vai no `ON` do join com `pedidos`, **não** no `WHERE` (que derrubaria quem ficou com `NULL`).',
            '`COALESCE(sum(...), 0)` troca o total vazio por zero.',
            'Uma CTE com o total por cliente deixa o `CASE` final simples.',
          ],
          solution: `WITH gasto AS (
  SELECT c.id, c.nome,
         COALESCE(sum(i.quantidade * i.preco_unitario), 0) AS total
  FROM clientes c
  LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.status <> 'cancelado'
  LEFT JOIN itens_pedido i ON i.pedido_id = p.id
  GROUP BY c.id, c.nome
)
SELECT nome,
       total AS total_gasto,
       CASE
         WHEN total >= 300 THEN 'VIP'
         WHEN total > 0    THEN 'Regular'
         ELSE 'Sem compras'
       END AS segmento
FROM gasto
ORDER BY total DESC, nome;`,
          wrong: [
            `WITH gasto AS (
  SELECT c.id, c.nome, COALESCE(sum(i.quantidade * i.preco_unitario), 0) AS total
  FROM clientes c JOIN pedidos p ON p.cliente_id = c.id JOIN itens_pedido i ON i.pedido_id = p.id
  WHERE p.status <> 'cancelado' GROUP BY c.id, c.nome)
SELECT nome, total AS total_gasto, CASE WHEN total >= 300 THEN 'VIP' WHEN total > 0 THEN 'Regular' ELSE 'Sem compras' END AS segmento
FROM gasto ORDER BY total DESC, nome;`,
            `WITH gasto AS (
  SELECT c.id, c.nome, COALESCE(sum(i.quantidade * i.preco_unitario), 0) AS total
  FROM clientes c LEFT JOIN pedidos p ON p.cliente_id = c.id LEFT JOIN itens_pedido i ON i.pedido_id = p.id
  GROUP BY c.id, c.nome)
SELECT nome, total AS total_gasto, CASE WHEN total >= 300 THEN 'VIP' WHEN total > 0 THEN 'Regular' ELSE 'Sem compras' END AS segmento
FROM gasto ORDER BY total DESC, nome;`,
          ],
          ordered: true,
          also: [uses('\\bcase\\b', 'Usou CASE')],
        }),
      ],
    },
  ],
}

import type { Module } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import { queryStep, uses } from '../helpers'
import theoryOver from './theory/01-over-partition.md?raw'
import theoryRanking from './theory/02-ranking.md?raw'
import theoryLag from './theory/03-lag-acumulado.md?raw'

const OVER = uses('\\bover\\s*\\(', 'Usou uma função de janela (OVER)')

export const m08: Module = {
  id: 'm08',
  title: 'Window functions',
  subtitle: 'OVER, PARTITION BY, rankings, LAG/LEAD e totais acumulados',
  emoji: '🪟',
  lessons: [
    {
      id: 'm08-l1',
      title: 'OVER e PARTITION BY',
      summary: 'Calcular sobre um conjunto de linhas sem perder nenhuma delas.',
      theory: theoryOver,
      steps: [
        queryStep({
          id: 'm08-l1-s1',
          title: 'A média da categoria, ao lado de cada produto',
          goal: 'Mostre `produto`, `categoria`, `preco` e `media_categoria` (a média de preço **da categoria do produto**, com 2 casas), **mantendo todos os produtos**. Ordene por categoria e produto.',
          hints: [
            'Com `GROUP BY` os produtos sumiriam: use uma função de janela.',
            '`avg(p.preco) OVER (PARTITION BY c.nome)`, dentro de `round(..., 2)`.',
          ],
          solution: `SELECT p.nome AS produto, c.nome AS categoria, p.preco,
       round(avg(p.preco) OVER (PARTITION BY c.nome), 2) AS media_categoria
FROM produtos p
JOIN categorias c ON c.id = p.categoria_id
ORDER BY c.nome, p.nome;`,
          wrong: [
            `SELECT p.nome AS produto, c.nome AS categoria, p.preco, round(avg(p.preco) OVER (), 2) AS media_categoria
FROM produtos p JOIN categorias c ON c.id = p.categoria_id ORDER BY c.nome, p.nome;`,
          ],
          ordered: true,
          also: [OVER],
        }),
        queryStep({
          id: 'm08-l1-s2',
          title: 'Numerando do mais caro ao mais barato',
          goal: 'Liste `posicao`, `nome` e `preco` de todos os produtos, onde `posicao` é 1 para o mais caro, 2 para o seguinte e assim por diante. Ordene por posição.',
          hints: ['`row_number() OVER (ORDER BY ...)` numera as linhas.', '`row_number() OVER (ORDER BY preco DESC) AS posicao`'],
          solution: 'SELECT row_number() OVER (ORDER BY preco DESC) AS posicao, nome, preco\nFROM produtos\nORDER BY posicao;',
          wrong: ['SELECT row_number() OVER (ORDER BY preco) AS posicao, nome, preco FROM produtos ORDER BY posicao;'],
          ordered: true,
          also: [OVER],
        }),
        queryStep({
          id: 'm08-l1-s3',
          title: 'Participação no estoque',
          goal: 'Mostre `nome`, `estoque` e `pct` (o percentual que o estoque do produto representa **do estoque total**, com 1 casa decimal), do maior percentual para o menor (empate: pelo nome).',
          hints: ['O total do estoque é uma janela sobre a tabela inteira: `sum(estoque) OVER ()`.', '`round(100.0 * estoque / sum(estoque) OVER (), 1) AS pct`'],
          solution: 'SELECT nome, estoque, round(100.0 * estoque / sum(estoque) OVER (), 1) AS pct\nFROM produtos\nORDER BY pct DESC, nome;',
          wrong: ['SELECT nome, estoque, round(100.0 * estoque / 250, 1) AS pct FROM produtos ORDER BY pct DESC, nome;'],
          ordered: true,
          also: [OVER],
        }),
      ],
    },
    {
      id: 'm08-l2',
      title: 'Rankings: ROW_NUMBER, RANK e DENSE_RANK',
      summary: 'Posições por categoria, empates e o top 1 de cada grupo.',
      theory: theoryRanking,
      steps: [
        queryStep({
          id: 'm08-l2-s1',
          title: 'Ranking por categoria',
          goal: 'Para cada produto, mostre `categoria`, `produto`, `preco` e `posicao`: a posição do preço **dentro da categoria** (1 = o mais caro), usando `RANK`. Ordene por categoria e posição.',
          hints: ['A numeração recomeça a cada categoria: `PARTITION BY`.', '`rank() OVER (PARTITION BY c.nome ORDER BY p.preco DESC) AS posicao`'],
          solution: `SELECT c.nome AS categoria, p.nome AS produto, p.preco,
       rank() OVER (PARTITION BY c.nome ORDER BY p.preco DESC) AS posicao
FROM produtos p
JOIN categorias c ON c.id = p.categoria_id
ORDER BY c.nome, posicao;`,
          wrong: [
            `SELECT c.nome AS categoria, p.nome AS produto, p.preco, rank() OVER (ORDER BY p.preco DESC) AS posicao
FROM produtos p JOIN categorias c ON c.id = p.categoria_id ORDER BY c.nome, posicao;`,
          ],
          ordered: true,
          also: [uses('\\brank\\s*\\(\\s*\\)', 'Usou RANK()')],
        }),
        queryStep({
          id: 'm08-l2-s2',
          title: 'O mais caro de cada categoria',
          goal: 'Mostre `categoria`, `produto` e `preco` do **produto mais caro de cada categoria**, ordenado por categoria. Lembre: a função de janela não pode ficar no `WHERE`.',
          hints: [
            'Calcule a posição dentro de uma CTE e filtre `WHERE pos = 1` na consulta de fora.',
            '`row_number() OVER (PARTITION BY c.nome ORDER BY p.preco DESC) AS pos`',
          ],
          solution: `WITH ranking AS (
  SELECT c.nome AS categoria, p.nome AS produto, p.preco,
         row_number() OVER (PARTITION BY c.nome ORDER BY p.preco DESC) AS pos
  FROM produtos p
  JOIN categorias c ON c.id = p.categoria_id
)
SELECT categoria, produto, preco
FROM ranking
WHERE pos = 1
ORDER BY categoria;`,
          wrong: [
            `SELECT c.nome AS categoria, p.nome AS produto, p.preco FROM produtos p JOIN categorias c ON c.id = p.categoria_id ORDER BY c.nome, p.preco DESC;`,
          ],
          ordered: true,
          also: [uses('with\\s+\\w+\\s+as', 'Usou uma CTE'), OVER],
        }),
        queryStep({
          id: 'm08-l2-s3',
          title: 'Empates: RANK × DENSE_RANK',
          goal: 'Para cada pedido, mostre `pedido` (a data `criado_em`), `itens` (quantos itens tem), `rk` (`RANK` por quantidade de itens, do maior para o menor) e `dr` (`DENSE_RANK` pelo mesmo critério). Ordene por itens decrescente e depois pela data. Repare onde `rk` **pula** números.',
          hints: [
            'Agrupe por pedido e use as janelas **sobre a contagem**: `rank() OVER (ORDER BY count(*) DESC)`.',
            'A janela roda depois do `GROUP BY`, por isso pode usar `count(*)`.',
          ],
          solution: `SELECT p.criado_em AS pedido, count(*) AS itens,
       rank() OVER (ORDER BY count(*) DESC) AS rk,
       dense_rank() OVER (ORDER BY count(*) DESC) AS dr
FROM pedidos p
JOIN itens_pedido i ON i.pedido_id = p.id
GROUP BY p.id, p.criado_em
ORDER BY itens DESC, p.criado_em;`,
          wrong: [
            `SELECT p.criado_em AS pedido, count(*) AS itens, row_number() OVER (ORDER BY count(*) DESC) AS rk, dense_rank() OVER (ORDER BY count(*) DESC) AS dr
FROM pedidos p JOIN itens_pedido i ON i.pedido_id = p.id GROUP BY p.id, p.criado_em ORDER BY itens DESC, p.criado_em;`,
          ],
          ordered: true,
          also: [uses('dense_rank', 'Usou DENSE_RANK')],
        }),
      ],
    },
    {
      id: 'm08-l3',
      title: 'LAG, LEAD e totais acumulados',
      summary: 'Comparar com a linha anterior e somar até a linha atual.',
      theory: theoryLag,
      steps: [
        queryStep({
          id: 'm08-l3-s1',
          title: 'O pedido anterior do mesmo cliente',
          goal: 'Para cada pedido, mostre `cliente`, `pedido` (`criado_em`), `total` e `anterior` (o total do **pedido anterior do mesmo cliente**, vazio no primeiro). Ordene por cliente e data.',
          hints: [
            'O total de cada pedido vem de uma CTE que soma os itens.',
            '`lag(t.total) OVER (PARTITION BY c.id ORDER BY p.criado_em)`: a partição faz "anterior" valer só dentro do cliente.',
          ],
          solution: `WITH total_pedido AS (
  SELECT pedido_id, sum(quantidade * preco_unitario) AS total
  FROM itens_pedido
  GROUP BY pedido_id
)
SELECT c.nome AS cliente, p.criado_em AS pedido, t.total,
       lag(t.total) OVER (PARTITION BY c.id ORDER BY p.criado_em) AS anterior
FROM total_pedido t
JOIN pedidos p ON p.id = t.pedido_id
JOIN clientes c ON c.id = p.cliente_id
ORDER BY c.nome, p.criado_em;`,
          wrong: [
            `WITH total_pedido AS (SELECT pedido_id, sum(quantidade * preco_unitario) AS total FROM itens_pedido GROUP BY pedido_id)
SELECT c.nome AS cliente, p.criado_em AS pedido, t.total, lag(t.total) OVER (ORDER BY p.criado_em) AS anterior
FROM total_pedido t JOIN pedidos p ON p.id = t.pedido_id JOIN clientes c ON c.id = p.cliente_id ORDER BY c.nome, p.criado_em;`,
          ],
          ordered: true,
          also: [uses('\\blag\\s*\\(', 'Usou LAG')],
        }),
        queryStep({
          id: 'm08-l3-s2',
          title: 'Faturamento acumulado',
          goal: 'Mostre, por `dia` (a **data** do pedido), o `faturamento` do dia e o `acumulado` (soma do faturamento de todos os dias até aquele), só de pedidos **não cancelados**, em ordem cronológica.',
          hints: [
            'Agrupe por dia e some os itens; depois some **o resultado** com uma janela ordenada por dia.',
            '`sum(sum(i.quantidade * i.preco_unitario)) OVER (ORDER BY p.criado_em::date)`',
          ],
          solution: `SELECT p.criado_em::date AS dia,
       sum(i.quantidade * i.preco_unitario) AS faturamento,
       sum(sum(i.quantidade * i.preco_unitario)) OVER (ORDER BY p.criado_em::date) AS acumulado
FROM pedidos p
JOIN itens_pedido i ON i.pedido_id = p.id
WHERE p.status <> 'cancelado'
GROUP BY p.criado_em::date
ORDER BY dia;`,
          wrong: [
            `SELECT p.criado_em::date AS dia, sum(i.quantidade * i.preco_unitario) AS faturamento, sum(sum(i.quantidade * i.preco_unitario)) OVER () AS acumulado
FROM pedidos p JOIN itens_pedido i ON i.pedido_id = p.id WHERE p.status <> 'cancelado' GROUP BY p.criado_em::date ORDER BY dia;`,
          ],
          ordered: true,
          also: [OVER],
        }),
        queryStep({
          id: 'm08-l3-s3',
          title: 'Dias até o próximo pedido',
          goal: 'Para cada pedido mostre `pedido` (a data `criado_em`, **sem hora**) e `dias_ate_o_proximo`: quantos dias faltam até o **próximo pedido da loja** (vazio no último). Ordene por data.',
          hints: ['`lead(data) OVER (ORDER BY ...)` pega a data da linha seguinte.', 'Subtrair duas datas (`date - date`) dá o número de dias: `lead(p.criado_em::date) OVER (ORDER BY p.criado_em) - p.criado_em::date`'],
          solution: `SELECT p.criado_em::date AS pedido,
       lead(p.criado_em::date) OVER (ORDER BY p.criado_em) - p.criado_em::date AS dias_ate_o_proximo
FROM pedidos p
ORDER BY p.criado_em;`,
          wrong: [
            `SELECT p.criado_em::date AS pedido, p.criado_em::date - lag(p.criado_em::date) OVER (ORDER BY p.criado_em) AS dias_ate_o_proximo FROM pedidos p ORDER BY p.criado_em;`,
          ],
          ordered: true,
          also: [uses('\\blead\\s*\\(', 'Usou LEAD')],
        }),
      ],
    },
    {
      id: 'm08-boss',
      title: 'Chefão: painel de vendas por categoria',
      summary: 'Agregação, ranking e participação numa só consulta.',
      boss: true,
      theory: `# 👹 Chefão do módulo 8

A diretoria quer o **painel de vendas por categoria**: dentro de cada categoria, quem vendeu mais e quanto cada produto pesa no total dela.

Você vai combinar \`GROUP BY\` com funções de janela **sobre as agregações**. Lembre da ordem: a janela roda **depois** do agrupamento.`,
      steps: [
        queryStep({
          id: 'm08-boss-s1',
          title: 'Painel por categoria',
          xp: BOSS_STEP_XP,
          goal: `Para cada produto **vendido** (só pedidos **não cancelados**), mostre:

- \`categoria\` e \`produto\` (nomes);
- \`faturamento\`: soma de quantidade × preço unitário;
- \`posicao\`: o ranking do produto **dentro da categoria** pelo faturamento (1 = quem mais faturou), com \`RANK\`;
- \`pct_categoria\`: o percentual que o faturamento do produto representa **do faturamento da categoria**, com 1 casa decimal.

Ordene por categoria e posição.`,
          hints: [
            'Agrupe por categoria e produto; as duas janelas rodam sobre `sum(...)`.',
            '`rank() OVER (PARTITION BY c.nome ORDER BY sum(...) DESC)`',
            '`round(100.0 * sum(...) / sum(sum(...)) OVER (PARTITION BY c.nome), 1)`: a soma da soma dá o total da categoria.',
          ],
          solution: `SELECT c.nome AS categoria, pr.nome AS produto,
       sum(i.quantidade * i.preco_unitario) AS faturamento,
       rank() OVER (PARTITION BY c.nome ORDER BY sum(i.quantidade * i.preco_unitario) DESC) AS posicao,
       round(100.0 * sum(i.quantidade * i.preco_unitario)
             / sum(sum(i.quantidade * i.preco_unitario)) OVER (PARTITION BY c.nome), 1) AS pct_categoria
FROM itens_pedido i
JOIN pedidos p ON p.id = i.pedido_id
JOIN produtos pr ON pr.id = i.produto_id
JOIN categorias c ON c.id = pr.categoria_id
WHERE p.status <> 'cancelado'
GROUP BY c.nome, pr.nome
ORDER BY c.nome, posicao;`,
          wrong: [
            `SELECT c.nome AS categoria, pr.nome AS produto, sum(i.quantidade * i.preco_unitario) AS faturamento,
       rank() OVER (PARTITION BY c.nome ORDER BY sum(i.quantidade * i.preco_unitario) DESC) AS posicao,
       round(100.0 * sum(i.quantidade * i.preco_unitario) / sum(sum(i.quantidade * i.preco_unitario)) OVER (PARTITION BY c.nome), 1) AS pct_categoria
FROM itens_pedido i JOIN pedidos p ON p.id = i.pedido_id JOIN produtos pr ON pr.id = i.produto_id JOIN categorias c ON c.id = pr.categoria_id
GROUP BY c.nome, pr.nome ORDER BY c.nome, posicao;`,
          ],
          ordered: true,
        }),
      ],
    },
  ],
}

import type { Module } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import { queryStep, uses } from '../helpers'
import theoryFuncoes from './theory/01-funcoes.md?raw'
import theoryGroup from './theory/02-group-by.md?raw'
import theoryHaving from './theory/03-having.md?raw'

export const m06: Module = {
  id: 'm06',
  title: 'Agregação: resumindo os dados',
  subtitle: 'COUNT, SUM, AVG, GROUP BY e HAVING: os relatórios da loja',
  emoji: '📊',
  lessons: [
    {
      id: 'm06-l1',
      title: 'Funções de agregação',
      summary: 'COUNT, MIN, MAX, AVG, SUM e o que fazem com NULL.',
      theory: theoryFuncoes,
      steps: [
        queryStep({
          id: 'm06-l1-s1',
          title: 'Quantos produtos?',
          goal: 'Mostre quantos produtos existem, numa coluna chamada `total`.',
          hints: ['`count(*)` conta linhas.', '`SELECT count(*) AS total FROM produtos;`'],
          solution: 'SELECT count(*) AS total FROM produtos;',
          wrong: ['SELECT count(*) AS total FROM categorias;'],
        }),
        queryStep({
          id: 'm06-l1-s2',
          title: 'Preço: menor, maior e médio',
          goal: 'Numa **única linha**, mostre o `menor` preço, o `maior` preço e a `media` dos preços **arredondada para 2 casas**.',
          hints: ['`min(preco)`, `max(preco)` e `avg(preco)`.', 'Arredonde com `round(avg(preco), 2)`.'],
          solution: 'SELECT min(preco) AS menor, max(preco) AS maior, round(avg(preco), 2) AS media FROM produtos;',
          wrong: ['SELECT min(preco) AS menor, max(preco) AS maior, avg(preco) AS media FROM produtos;'],
          also: [uses('round\\s*\\(', 'Arredondou com ROUND')],
        }),
        queryStep({
          id: 'm06-l1-s3',
          title: 'COUNT(*) e COUNT(coluna)',
          goal: 'Mostre, numa linha, `todos` (quantidade de produtos) e `com_sku` (quantos têm **SKU preenchido**). Veja como os dois números diferem.',
          hints: ['`count(*)` conta linhas; `count(sku)` ignora os vazios.'],
          solution: 'SELECT count(*) AS todos, count(sku) AS com_sku FROM produtos;',
          wrong: ['SELECT count(*) AS todos, count(*) AS com_sku FROM produtos;'],
        }),
        queryStep({
          id: 'm06-l1-s4',
          title: 'Quanto vale o estoque?',
          goal: 'Calcule o `valor_estoque`: a soma de **preço × estoque** de todos os produtos.',
          hints: ['Agregue uma expressão: `sum(preco * estoque)`.'],
          solution: 'SELECT sum(preco * estoque) AS valor_estoque FROM produtos;',
          wrong: ['SELECT sum(preco) AS valor_estoque FROM produtos;'],
        }),
      ],
    },
    {
      id: 'm06-l2',
      title: 'GROUP BY: agregando por grupo',
      summary: 'Produtos por categoria, total por pedido e a armadilha do COUNT.',
      theory: theoryGroup,
      steps: [
        queryStep({
          id: 'm06-l2-s1',
          title: 'Produtos por categoria',
          goal: 'Mostre cada `categoria` e quantos `produtos` ela tem (só categorias que **têm** produtos), em ordem alfabética.',
          hints: ['Junte `categorias` e `produtos` e agrupe pelo nome da categoria.', '`GROUP BY c.nome`'],
          solution: `SELECT c.nome AS categoria, count(*) AS produtos
FROM categorias c
JOIN produtos p ON p.categoria_id = c.id
GROUP BY c.nome
ORDER BY c.nome;`,
          wrong: [
            `SELECT c.nome AS categoria, count(*) AS produtos FROM categorias c LEFT JOIN produtos p ON p.categoria_id = c.id GROUP BY c.nome ORDER BY c.nome;`,
          ],
          ordered: true,
          also: [uses('group\\s+by', 'Usou GROUP BY')],
        }),
        queryStep({
          id: 'm06-l2-s2',
          title: 'Total de cada pedido',
          goal: 'Para cada pedido mostre `pedido` (a data `criado_em`) e `total` (soma de quantidade × preço unitário dos itens), do mais antigo ao mais novo.',
          hints: ['Junte `pedidos` e `itens_pedido`, agrupe por pedido e some `i.quantidade * i.preco_unitario`.', 'Agrupe por `p.id, p.criado_em`.'],
          solution: `SELECT p.criado_em AS pedido, sum(i.quantidade * i.preco_unitario) AS total
FROM pedidos p
JOIN itens_pedido i ON i.pedido_id = p.id
GROUP BY p.id, p.criado_em
ORDER BY p.criado_em;`,
          wrong: [`SELECT p.criado_em AS pedido, sum(i.preco_unitario) AS total FROM pedidos p JOIN itens_pedido i ON i.pedido_id = p.id GROUP BY p.id, p.criado_em ORDER BY p.criado_em;`],
          ordered: true,
        }),
        queryStep({
          id: 'm06-l2-s3',
          title: 'Pedidos por status',
          goal: 'Mostre cada `status` e quantos `pedidos` há nele, em ordem alfabética de status.',
          hints: ['Agrupe por `status` e use `count(*)`.'],
          solution: 'SELECT status, count(*) AS pedidos FROM pedidos GROUP BY status ORDER BY status;',
          wrong: ["SELECT status, count(*) AS pedidos FROM pedidos WHERE status <> 'pago' GROUP BY status ORDER BY status;"],
          ordered: true,
        }),
        queryStep({
          id: 'm06-l2-s4',
          title: 'Pedidos por cliente (inclusive zero)',
          goal: 'Mostre o `nome` de **todos** os clientes e quantos `pedidos` cada um fez, **inclusive 0**, em ordem alfabética. Cuidado com a armadilha do `COUNT` depois de um `LEFT JOIN`.',
          hints: ['`LEFT JOIN` mantém quem não comprou. Mas `count(*)` contaria a linha vazia como 1.', 'Conte uma coluna da tabela da direita: `count(p.id)`.'],
          solution: `SELECT c.nome, count(p.id) AS pedidos
FROM clientes c
LEFT JOIN pedidos p ON p.cliente_id = c.id
GROUP BY c.nome
ORDER BY c.nome;`,
          wrong: [`SELECT c.nome, count(*) AS pedidos FROM clientes c LEFT JOIN pedidos p ON p.cliente_id = c.id GROUP BY c.nome ORDER BY c.nome;`],
          ordered: true,
        }),
      ],
    },
    {
      id: 'm06-l3',
      title: 'HAVING: filtrando grupos',
      summary: 'WHERE × HAVING, clientes que mais gastam e o ranking de produtos.',
      theory: theoryHaving,
      steps: [
        queryStep({
          id: 'm06-l3-s1',
          title: 'Categorias cheias',
          goal: 'Mostre as `categoria`s com **mais de 2 produtos** e a quantidade (`produtos`).',
          hints: ['A condição é sobre o resultado da contagem: use `HAVING`.', '`HAVING count(*) > 2`'],
          solution: `SELECT c.nome AS categoria, count(*) AS produtos
FROM categorias c
JOIN produtos p ON p.categoria_id = c.id
GROUP BY c.nome
HAVING count(*) > 2;`,
          wrong: [`SELECT c.nome AS categoria, count(*) AS produtos FROM categorias c JOIN produtos p ON p.categoria_id = c.id GROUP BY c.nome HAVING count(*) > 1;`],
          also: [uses('\\bhaving\\b', 'Usou HAVING')],
        }),
        queryStep({
          id: 'm06-l3-s2',
          title: 'Quem gastou mais de R$ 300',
          goal: 'Mostre o `nome` e o `total_gasto` dos clientes que gastaram **mais de 300** em pedidos **não cancelados**, do que mais gastou para o que menos gastou.',
          hints: [
            'O filtro de cancelados é sobre **linhas**: vai no `WHERE`. O de "mais de 300" é sobre o **grupo**: vai no `HAVING`.',
            'Junte `clientes`, `pedidos` e `itens_pedido` e some `i.quantidade * i.preco_unitario`.',
          ],
          solution: `SELECT c.nome, sum(i.quantidade * i.preco_unitario) AS total_gasto
FROM clientes c
JOIN pedidos p ON p.cliente_id = c.id
JOIN itens_pedido i ON i.pedido_id = p.id
WHERE p.status <> 'cancelado'
GROUP BY c.nome
HAVING sum(i.quantidade * i.preco_unitario) > 300
ORDER BY total_gasto DESC;`,
          wrong: [
            `SELECT c.nome, sum(i.quantidade * i.preco_unitario) AS total_gasto FROM clientes c JOIN pedidos p ON p.cliente_id = c.id JOIN itens_pedido i ON i.pedido_id = p.id
GROUP BY c.nome HAVING sum(i.quantidade * i.preco_unitario) > 300 ORDER BY total_gasto DESC;`,
          ],
          ordered: true,
        }),
        queryStep({
          id: 'm06-l3-s3',
          title: 'Os 3 que mais faturam',
          goal: 'Mostre os **3 produtos** que mais faturaram (colunas `produto` e `faturamento`, soma de quantidade × preço unitário), considerando só pedidos **não cancelados**, do maior para o menor.',
          hints: ['Agrupe por produto, ordene pelo faturamento decrescente e limite a 3.', "Filtre os cancelados no `WHERE p.status <> 'cancelado'`."],
          solution: `SELECT pr.nome AS produto, sum(i.quantidade * i.preco_unitario) AS faturamento
FROM itens_pedido i
JOIN produtos pr ON pr.id = i.produto_id
JOIN pedidos p ON p.id = i.pedido_id
WHERE p.status <> 'cancelado'
GROUP BY pr.nome
ORDER BY faturamento DESC
LIMIT 3;`,
          wrong: [
            `SELECT pr.nome AS produto, sum(i.quantidade * i.preco_unitario) AS faturamento FROM itens_pedido i JOIN produtos pr ON pr.id = i.produto_id JOIN pedidos p ON p.id = i.pedido_id
GROUP BY pr.nome ORDER BY faturamento DESC LIMIT 3;`,
          ],
          ordered: true,
        }),
      ],
    },
    {
      id: 'm06-boss',
      title: 'Chefão: relatório de clientes',
      summary: 'Quantos pedidos e quanto cada cliente gastou.',
      boss: true,
      theory: `# 👹 Chefão do módulo 6

A diretoria quer um **ranking de clientes**. Você junta, filtra, agrupa e ordena, tudo de uma vez.

Cuidado com contagens: um pedido com 3 itens aparece em **3 linhas** depois do \`JOIN\`.`,
      steps: [
        queryStep({
          id: 'm06-boss-s1',
          title: 'Ranking de clientes',
          xp: BOSS_STEP_XP,
          goal: `Para cada cliente que **comprou** (só pedidos **não cancelados**), mostre:

\`cliente\` (nome), \`pedidos\` (quantos pedidos distintos) e \`total_gasto\` (soma de quantidade × preço unitário).

Ordene por \`total_gasto\` decrescente e, em caso de empate, por nome.`,
          hints: [
            'Um pedido com 3 itens gera 3 linhas: para contar **pedidos**, conte ids **distintos**.',
            '`count(DISTINCT p.id)`',
            "Os cancelados saem no `WHERE`; o ranking sai do `ORDER BY total_gasto DESC, c.nome`.",
          ],
          solution: `SELECT c.nome AS cliente,
       count(DISTINCT p.id) AS pedidos,
       sum(i.quantidade * i.preco_unitario) AS total_gasto
FROM clientes c
JOIN pedidos p ON p.cliente_id = c.id
JOIN itens_pedido i ON i.pedido_id = p.id
WHERE p.status <> 'cancelado'
GROUP BY c.nome
ORDER BY total_gasto DESC, c.nome;`,
          wrong: [
            `SELECT c.nome AS cliente, count(*) AS pedidos, sum(i.quantidade * i.preco_unitario) AS total_gasto
FROM clientes c JOIN pedidos p ON p.cliente_id = c.id JOIN itens_pedido i ON i.pedido_id = p.id
WHERE p.status <> 'cancelado' GROUP BY c.nome ORDER BY total_gasto DESC, c.nome;`,
          ],
          ordered: true,
        }),
      ],
    },
  ],
}

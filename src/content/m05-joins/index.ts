import type { Module } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import { catalog, queryStep, uses } from '../helpers'
import theoryInner from './theory/01-inner-join.md?raw'
import theoryLeft from './theory/02-left-join.md?raw'
import theoryRightFull from './theory/03-right-full.md?raw'
import theorySelf from './theory/04-self-join.md?raw'

export const m05: Module = {
  id: 'm05',
  title: 'JOINs: cruzando as tabelas',
  subtitle: 'INNER, LEFT, RIGHT, FULL e self join sobre o LojaDB',
  emoji: '🔗',
  lessons: [
    {
      id: 'm05-l1',
      title: 'INNER JOIN: juntando tabelas',
      summary: 'Pedidos com clientes, itens com produtos, e a cadeia completa.',
      theory: theoryInner,
      steps: [
        queryStep({
          id: 'm05-l1-s1',
          title: 'Pedidos com o nome do cliente',
          goal: 'Liste cada pedido com `nome` do cliente, `criado_em` e `status`, **do mais antigo ao mais novo**. Use `JOIN`.',
          hints: [
            '`FROM pedidos p JOIN clientes c ON ...` e o `ON` liga `c.id` a `p.cliente_id`.',
            'Ordene com `ORDER BY p.criado_em`.',
          ],
          solution: 'SELECT c.nome, p.criado_em, p.status\nFROM pedidos p\nJOIN clientes c ON c.id = p.cliente_id\nORDER BY p.criado_em;',
          wrong: ['SELECT c.nome, p.criado_em, p.status FROM pedidos p, clientes c ORDER BY p.criado_em;'],
          ordered: true,
          also: [uses('\\bjoin\\b', 'Usou JOIN')],
        }),
        queryStep({
          id: 'm05-l1-s2',
          title: 'O que tem no pedido?',
          goal: 'Mostre os itens do pedido de `2026-01-10 10:00`: o nome do produto (coluna `produto`), `quantidade` e `preco_unitario`, em ordem alfabética do produto.',
          hints: ['Junte `itens_pedido` com `produtos` (para o nome) e com `pedidos` (para filtrar pela data).', "Filtre com `WHERE p.criado_em = '2026-01-10 10:00'`."],
          solution: `SELECT pr.nome AS produto, i.quantidade, i.preco_unitario
FROM itens_pedido i
JOIN produtos pr ON pr.id = i.produto_id
JOIN pedidos p ON p.id = i.pedido_id
WHERE p.criado_em = '2026-01-10 10:00'
ORDER BY pr.nome;`,
          wrong: ['SELECT pr.nome AS produto, i.quantidade, i.preco_unitario FROM itens_pedido i JOIN produtos pr ON pr.id = i.produto_id JOIN pedidos p ON p.id = i.pedido_id ORDER BY pr.nome;'],
          ordered: true,
        }),
        queryStep({
          id: 'm05-l1-s3',
          title: 'Quem comprou o quê',
          goal: 'Liste todos os pares `cliente` × `produto` comprados (colunas `cliente` e `produto`), ordenados por cliente e depois por produto. Isso atravessa **quatro tabelas**: `clientes`, `pedidos`, `itens_pedido` e `produtos`.',
          hints: ['Encadeie os `JOIN`s na ordem do caminho: clientes → pedidos → itens_pedido → produtos.', 'Cada `ON` liga a chave estrangeira à chave primária.'],
          solution: `SELECT c.nome AS cliente, pr.nome AS produto
FROM clientes c
JOIN pedidos p ON p.cliente_id = c.id
JOIN itens_pedido i ON i.pedido_id = p.id
JOIN produtos pr ON pr.id = i.produto_id
ORDER BY c.nome, pr.nome;`,
          wrong: ['SELECT c.nome AS cliente, pr.nome AS produto FROM clientes c JOIN pedidos p ON p.cliente_id = c.id JOIN produtos pr ON pr.id = pr.id ORDER BY c.nome, pr.nome;'],
          ordered: true,
          also: [uses('(\\bjoin\\b[\\s\\S]*){3}', 'Usou três JOINs')],
        }),
      ],
    },
    {
      id: 'm05-l2',
      title: 'LEFT JOIN: não perder quem não tem par',
      summary: 'Clientes sem pedidos, produtos nunca vendidos e o anti-join.',
      theory: theoryLeft,
      steps: [
        queryStep({
          id: 'm05-l2-s1',
          title: 'Todos os clientes, com ou sem pedido',
          goal: 'Liste **todos** os clientes com o `status` dos seus pedidos (colunas `nome` e `status`), ordenados por nome e depois pela data do pedido. Cliente sem pedido deve aparecer, com `status` vazio.',
          hints: ['Com `INNER JOIN` quem não comprou some. Qual `JOIN` mantém a tabela da esquerda inteira?', '`FROM clientes c LEFT JOIN pedidos p ON p.cliente_id = c.id`'],
          solution: 'SELECT c.nome, p.status\nFROM clientes c\nLEFT JOIN pedidos p ON p.cliente_id = c.id\nORDER BY c.nome, p.criado_em;',
          wrong: ['SELECT c.nome, p.status FROM clientes c JOIN pedidos p ON p.cliente_id = c.id ORDER BY c.nome, p.criado_em;'],
          ordered: true,
          also: [uses('left\\s+(outer\\s+)?join', 'Usou LEFT JOIN')],
        }),
        queryStep({
          id: 'm05-l2-s2',
          title: 'Quem nunca comprou',
          goal: 'Mostre o `nome` dos clientes que **nunca fizeram pedido** (o anti-join).',
          hints: ['Faça o `LEFT JOIN` e filtre as linhas em que o lado dos pedidos ficou vazio.', '`WHERE p.id IS NULL`'],
          solution: 'SELECT c.nome\nFROM clientes c\nLEFT JOIN pedidos p ON p.cliente_id = c.id\nWHERE p.id IS NULL\nORDER BY c.nome;',
          wrong: ['SELECT c.nome FROM clientes c LEFT JOIN pedidos p ON p.cliente_id = c.id WHERE p.id IS NOT NULL ORDER BY c.nome;'],
          ordered: true,
          also: [uses('left\\s+(outer\\s+)?join', 'Usou LEFT JOIN')],
        }),
        queryStep({
          id: 'm05-l2-s3',
          title: 'Produtos encalhados',
          goal: 'Mostre o `nome` dos produtos que **nunca foram vendidos** (nunca aparecem em `itens_pedido`).',
          hints: ['Mesmo padrão: parta de `produtos` e faça `LEFT JOIN` com `itens_pedido`.', 'Procure `NULL` numa coluna de `itens_pedido`, como `i.produto_id`.'],
          solution: 'SELECT pr.nome\nFROM produtos pr\nLEFT JOIN itens_pedido i ON i.produto_id = pr.id\nWHERE i.produto_id IS NULL\nORDER BY pr.nome;',
          wrong: ['SELECT pr.nome FROM produtos pr JOIN itens_pedido i ON i.produto_id = pr.id ORDER BY pr.nome;'],
          ordered: true,
        }),
      ],
    },
    {
      id: 'm05-l3',
      title: 'RIGHT JOIN e FULL JOIN',
      summary: 'Categorias vazias e os quatro tipos de JOIN lado a lado.',
      theory: theoryRightFull,
      steps: [
        {
          id: 'm05-l3-s1',
          title: 'Uma categoria vazia',
          goal: 'Cadastre a categoria `Promoções`. Ela ainda **não tem produtos**: é a que vai revelar a diferença entre os `JOIN`s.',
          hints: ["`INSERT INTO categorias (nome) VALUES ('Promoções');`"],
          solution: "INSERT INTO categorias (nome) VALUES ('Promoções');",
          checks: [
            { kind: 'rowCount', table: 'categorias', equals: 4 },
            catalog('A categoria Promoções existe', "SELECT count(*) = 1 FROM categorias WHERE nome = 'Promoções'", 'Confira a grafia, com o til.'),
          ],
        },
        queryStep({
          id: 'm05-l3-s2',
          title: 'Todas as categorias, com seus produtos',
          goal: 'Liste cada `categoria` com seus `produto`s, **incluindo categorias sem produtos** (que aparecem com `produto` vazio). Ordene por categoria e depois por produto. Use `LEFT JOIN`.',
          hints: ['Parta de `categorias` e faça `LEFT JOIN produtos`.', '`ON pr.categoria_id = c.id`'],
          solution: `SELECT c.nome AS categoria, pr.nome AS produto
FROM categorias c
LEFT JOIN produtos pr ON pr.categoria_id = c.id
ORDER BY c.nome, pr.nome;`,
          wrong: ['SELECT c.nome AS categoria, pr.nome AS produto FROM categorias c JOIN produtos pr ON pr.categoria_id = c.id ORDER BY c.nome, pr.nome;'],
          ordered: true,
          also: [uses('left\\s+(outer\\s+)?join', 'Usou LEFT JOIN')],
        }),
        queryStep({
          id: 'm05-l3-s3',
          title: 'O mesmo resultado, com RIGHT JOIN',
          goal: 'Obtenha **exatamente o mesmo resultado**, mas escrevendo `produtos` à esquerda e `categorias` à direita, com `RIGHT JOIN`.',
          hints: ['Se `categorias` passa para a direita, o `LEFT` vira `RIGHT`.', '`FROM produtos pr RIGHT JOIN categorias c ON ...`'],
          solution: `SELECT c.nome AS categoria, pr.nome AS produto
FROM produtos pr
RIGHT JOIN categorias c ON pr.categoria_id = c.id
ORDER BY c.nome, pr.nome;`,
          wrong: ['SELECT c.nome AS categoria, pr.nome AS produto FROM produtos pr JOIN categorias c ON pr.categoria_id = c.id ORDER BY c.nome, pr.nome;'],
          ordered: true,
          also: [uses('right\\s+(outer\\s+)?join', 'Usou RIGHT JOIN')],
        }),
        queryStep({
          id: 'm05-l3-s4',
          title: 'FULL JOIN',
          goal: 'Mais uma vez o mesmo resultado, agora com `FULL JOIN`. Aqui ele coincide com o `LEFT` porque **nenhum produto fica sem categoria**; em dados que podem faltar dos dois lados, a diferença apareceria.',
          hints: ['`FROM categorias c FULL JOIN produtos pr ON ...`'],
          solution: `SELECT c.nome AS categoria, pr.nome AS produto
FROM categorias c
FULL JOIN produtos pr ON pr.categoria_id = c.id
ORDER BY c.nome, pr.nome;`,
          wrong: ['SELECT c.nome AS categoria, pr.nome AS produto FROM categorias c LEFT JOIN produtos pr ON pr.categoria_id = c.id ORDER BY c.nome, pr.nome;'],
          ordered: true,
          also: [uses('full\\s+(outer\\s+)?join', 'Usou FULL JOIN')],
        }),
      ],
    },
    {
      id: 'm05-l4',
      title: 'Self join: a tabela com ela mesma',
      summary: 'Hierarquia de categorias com chave estrangeira autorreferenciada.',
      theory: theorySelf,
      steps: [
        {
          id: 'm05-l4-s1',
          title: 'Categoria pai',
          goal: 'Acrescente a `categorias` a coluna `categoria_pai_id`: inteiro **opcional**, com chave estrangeira para a **própria** `categorias(id)`.',
          hints: ['Uma coluna nova com `REFERENCES categorias (id)`, sem `NOT NULL`.', '`ALTER TABLE categorias ADD COLUMN categoria_pai_id INTEGER REFERENCES categorias (id);`'],
          solution: 'ALTER TABLE categorias ADD COLUMN categoria_pai_id INTEGER REFERENCES categorias (id);',
          wrong: ['ALTER TABLE categorias ADD COLUMN categoria_pai_id INTEGER NOT NULL REFERENCES categorias (id);'],
          checks: [
            { kind: 'column', table: 'categorias', name: 'categoria_pai_id', type: 'integer', nullable: true },
            { kind: 'constraint', table: 'categorias', constraint: 'foreign', columns: ['categoria_pai_id'], refTable: 'categorias' },
          ],
        },
        {
          id: 'm05-l4-s2',
          title: 'Monte a árvore',
          goal: 'Cadastre a categoria `Vestuário` e faça `Camisetas`, `Calçados` e `Acessórios` serem **filhas** dela. `Vestuário` e `Promoções` ficam sem pai. Resolva com um `INSERT` e **um** `UPDATE` com subconsulta.',
          hints: [
            'O `UPDATE` define `categoria_pai_id` com `(SELECT id FROM categorias WHERE nome = \'Vestuário\')`.',
            "Restrinja com `WHERE nome IN ('Camisetas', 'Calçados', 'Acessórios')`: sem isso, `Vestuário` viraria filha de si mesma.",
          ],
          solution: `INSERT INTO categorias (nome) VALUES ('Vestuário');
UPDATE categorias
SET categoria_pai_id = (SELECT id FROM categorias WHERE nome = 'Vestuário')
WHERE nome IN ('Camisetas', 'Calçados', 'Acessórios');`,
          wrong: [
            `INSERT INTO categorias (nome) VALUES ('Vestuário');
UPDATE categorias SET categoria_pai_id = (SELECT id FROM categorias WHERE nome = 'Vestuário');`,
          ],
          checks: [
            { kind: 'rowCount', table: 'categorias', equals: 5 },
            catalog(
              'Camisetas, Calçados e Acessórios são filhas de Vestuário',
              `SELECT count(*) = 3 FROM categorias c JOIN categorias pai ON pai.id = c.categoria_pai_id
               WHERE pai.nome = 'Vestuário' AND c.nome IN ('Camisetas', 'Calçados', 'Acessórios')`,
              'Confira quem são os filhos de Vestuário.',
            ),
            catalog('Só Vestuário e Promoções ficam sem pai', 'SELECT count(*) = 2 FROM categorias WHERE categoria_pai_id IS NULL', 'Mais categorias ficaram com pai do que o esperado.'),
          ],
        },
        queryStep({
          id: 'm05-l4-s3',
          title: 'Lendo a hierarquia',
          goal: 'Liste cada `categoria` com o nome da sua `pai` (vazio para as raízes), ordenado por categoria. A tabela `categorias` aparece **duas vezes** na consulta.',
          hints: ['Dois apelidos para a mesma tabela: `c` (a categoria) e `pai`.', '`LEFT JOIN categorias pai ON pai.id = c.categoria_pai_id`'],
          solution: 'SELECT c.nome AS categoria, pai.nome AS pai\nFROM categorias c\nLEFT JOIN categorias pai ON pai.id = c.categoria_pai_id\nORDER BY c.nome;',
          wrong: ['SELECT c.nome AS categoria, pai.nome AS pai FROM categorias c JOIN categorias pai ON pai.id = c.categoria_pai_id ORDER BY c.nome;'],
          ordered: true,
        }),
      ],
    },
    {
      id: 'm05-boss',
      title: 'Chefão: relatório de pedidos',
      summary: 'Quatro tabelas, um filtro e uma conta.',
      boss: true,
      theory: `# 👹 Chefão do módulo 5

O atendimento pediu um **relatório de vendas por linha de pedido**. Sem roteiro: você decide as tabelas, o tipo de \`JOIN\` e o filtro.

Dica: existem pedidos cancelados, e o relatório é só do que **realmente vendeu**.`,
      steps: [
        queryStep({
          id: 'm05-boss-s1',
          title: 'Relatório de vendas',
          xp: BOSS_STEP_XP,
          goal: `Uma linha por **item vendido**, **sem os pedidos cancelados**, com as colunas, nesta ordem:

\`cliente\` (nome), \`data\` (a data do pedido, **sem a hora**), \`produto\` (nome), \`quantidade\` e \`subtotal\` (quantidade × preço unitário).

Ordene por data do pedido e, dentro dela, pelo nome do produto.`,
          hints: [
            'Quatro tabelas: `clientes`, `pedidos`, `itens_pedido` e `produtos`.',
            "Para tirar a hora: `p.criado_em::date` (ou `CAST(p.criado_em AS date)`). Filtre com `p.status <> 'cancelado'`.",
            '`ORDER BY p.criado_em, pr.nome`',
          ],
          solution: `SELECT c.nome AS cliente,
       p.criado_em::date AS data,
       pr.nome AS produto,
       i.quantidade,
       i.quantidade * i.preco_unitario AS subtotal
FROM pedidos p
JOIN clientes c ON c.id = p.cliente_id
JOIN itens_pedido i ON i.pedido_id = p.id
JOIN produtos pr ON pr.id = i.produto_id
WHERE p.status <> 'cancelado'
ORDER BY p.criado_em, pr.nome;`,
          wrong: [
            `SELECT c.nome AS cliente, p.criado_em::date AS data, pr.nome AS produto, i.quantidade, i.quantidade * i.preco_unitario AS subtotal
FROM pedidos p JOIN clientes c ON c.id = p.cliente_id JOIN itens_pedido i ON i.pedido_id = p.id JOIN produtos pr ON pr.id = i.produto_id
ORDER BY p.criado_em, pr.nome;`,
          ],
          ordered: true,
        }),
      ],
    },
  ],
}

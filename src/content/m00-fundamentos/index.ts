import type { Module } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import theoryBanco from './theory/01-banco-relacional.md?raw'
import theoryComandos from './theory/02-comandos-sql.md?raw'

export const m00: Module = {
  id: 'm00',
  title: 'Fundamentos',
  subtitle: 'Conheça o terreno antes de construir',
  emoji: '🧭',
  lessons: [
    {
      id: 'm00-l1',
      title: 'O que é um banco relacional?',
      summary: 'Tabelas, colunas, linhas e o seu primeiro SELECT.',
      theory: theoryBanco,
      steps: [
        {
          id: 'm00-l1-s1',
          title: 'Diga olá',
          goal: 'Escreva um `SELECT` que devolva **uma coluna** chamada `mensagem` com o texto `Olá, LojaDB!`.',
          context: 'Todo `SELECT` devolve uma tabela. Aqui ela terá 1 coluna e 1 linha.',
          hints: [
            'O comando começa com `SELECT`, seguido do valor que você quer ver.',
            'Textos ficam entre aspas simples: `\'assim\'`.',
            'Use `AS` para dar nome à coluna: `SELECT \'x\' AS nome_da_coluna;`',
          ],
          solution: "SELECT 'Olá, LojaDB!' AS mensagem;",
          wrong: ["SELECT 'Olá, LojaDB!';", "SELECT 'Oi' AS mensagem;"],
          checks: [{ kind: 'resultMatches', expectedSql: "SELECT 'Olá, LojaDB!' AS mensagem" }],
        },
        {
          id: 'm00-l1-s2',
          title: 'Faça uma conta',
          goal: 'Um cliente comprou **3 unidades** de um produto de **R$ 19,90**. Calcule o total em uma coluna chamada `total`.',
          context: 'O SQL também é uma calculadora: `+`, `-`, `*` e `/`.',
          hints: ['Multiplique o preço pela quantidade.', 'Decimais usam **ponto**, não vírgula: `19.90`.'],
          solution: 'SELECT 19.90 * 3 AS total;',
          wrong: ['SELECT 19.90 + 3 AS total;'],
          checks: [{ kind: 'resultMatches', expectedSql: 'SELECT 19.90 * 3 AS total' }],
        },
      ],
    },
    {
      id: 'm00-l2',
      title: 'Falando SQL: os tipos de comando',
      summary: 'DDL, DML e DQL; comentários e vários comandos em um script.',
      theory: theoryComandos,
      steps: [
        {
          id: 'm00-l2-s1',
          title: 'Comentários são seus amigos',
          goal: 'Escreva um **comentário** (linha começando com `--`) e, abaixo dele, um `SELECT` que mostre a coluna `loja` com o texto `LojaDB`.',
          hints: ['Comentário: `-- qualquer texto`.', "O comando: `SELECT 'LojaDB' AS loja;`"],
          solution: "-- Mostra o nome da loja\nSELECT 'LojaDB' AS loja;",
          wrong: ["SELECT 'LojaDB' AS loja;"],
          checks: [
            { kind: 'sqlMatches', pattern: '--', raw: true, label: 'O código tem um comentário (--)' },
            { kind: 'resultMatches', expectedSql: "SELECT 'LojaDB' AS loja" },
          ],
        },
        {
          id: 'm00-l2-s2',
          title: 'Vários comandos, um script',
          goal: "Em **um único script**, escreva dois `SELECT`: o primeiro mostra o texto `LojaDB` (coluna `loja`); o segundo mostra o número `3` (coluna `itens`). Rode os dois juntos e veja um resultado para cada comando.",
          hints: ['Separe os comandos com `;`.', "`SELECT 'LojaDB' AS loja; SELECT 3 AS itens;`"],
          solution: "SELECT 'LojaDB' AS loja;\nSELECT 3 AS itens;",
          wrong: ['SELECT 3 AS itens;'],
          checks: [
            { kind: 'sqlMatches', pattern: 'select[\\s\\S]*;[\\s\\S]*select', label: 'O script tem dois SELECT' },
            { kind: 'resultMatches', expectedSql: 'SELECT 3 AS itens' },
          ],
        },
      ],
    },
    {
      id: 'm00-boss',
      title: 'Chefão: a calculadora da loja',
      summary: 'Sem passo a passo: só o requisito de negócio.',
      boss: true,
      theory: `# 👹 Chefão do módulo 0

Desta vez **não há roteiro**. Você recebe o pedido do dono da loja e decide como resolver.

Use o que aprendeu: \`SELECT\`, contas, textos e apelidos de coluna (\`AS\`). Dicas custam XP, mas o chefão vale muito mais.`,
      steps: [
        {
          id: 'm00-boss-s1',
          title: 'Fechando a conta da camiseta',
          xp: BOSS_STEP_XP,
          goal: 'Uma camiseta custa **R$ 80,00**. A loja dá **15% de desconto** e cobra **R$ 15,00 de frete**. Mostre **uma linha** com as colunas `preco` (80), `desconto` (o valor do desconto, em reais) e `total` (preço − desconto + frete).',
          hints: [
            'O desconto em reais é `80 * 15 / 100`.',
            'O total é `80 - desconto + 15`. Você pode repetir a conta do desconto dentro da expressão.',
            'Três colunas, cada uma com seu `AS`: `SELECT 80 AS preco, ... AS desconto, ... AS total;`',
          ],
          solution: 'SELECT 80 AS preco, 80 * 15 / 100 AS desconto, 80 - 80 * 15 / 100 + 15 AS total;',
          wrong: ['SELECT 80 AS preco, 15 AS desconto, 80 AS total;'],
          checks: [{ kind: 'resultMatches', expectedSql: 'SELECT 80 AS preco, 12 AS desconto, 83 AS total' }],
        },
      ],
    },
  ],
}

import type { Check, Module } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import { catalog, seedStep, uses } from '../helpers'
import theoryExplain from './theory/01-explain.md?raw'
import theoryBtree from './theory/02-indices-btree.md?raw'
import theoryParciais from './theory/03-parciais-unicos.md?raw'

/**
 * 60 mil visitas. `origem` e `produto_id` vêm de contadores independentes (g/8 e g%8) para não ficarem
 * correlacionados; `sessao` repete cada valor ~12 vezes (seletivo o bastante para o índice compensar).
 */
const VISITAS_SEED = `-- Carga: 60 mil visitas ao site (leva alguns segundos)
CREATE TABLE visitas (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  produto_id INTEGER NOT NULL REFERENCES produtos (id),
  cliente_id INTEGER REFERENCES clientes (id),   -- vazio = visitante anônimo
  sessao     INTEGER NOT NULL,
  visto_em   TIMESTAMP NOT NULL,
  origem     VARCHAR(20) NOT NULL
);

INSERT INTO visitas (produto_id, cliente_id, sessao, visto_em, origem)
SELECT p.ids[(g % cardinality(p.ids)) + 1],
       CASE WHEN g % 5 = 0 THEN NULL ELSE c.ids[(g % cardinality(c.ids)) + 1] END,
       g % 5000,
       timestamp '2026-01-01' + g * interval '3 minutes',
       (ARRAY['busca', 'email', 'anuncio', 'direto'])[((g / 8) % 4) + 1]
FROM generate_series(1, 60000) AS g,
     (SELECT array_agg(id ORDER BY id) AS ids FROM produtos) p,
     (SELECT array_agg(id ORDER BY id) AS ids FROM clientes) c;

-- Atualiza as estatísticas: sem isso o planejador escolheria às cegas.
ANALYZE visitas;
`

const EXECUTION_TIME: Check = { kind: 'resultText', pattern: 'Execution Time', label: 'Foi um EXPLAIN ANALYZE (mostra o tempo real de execução)' }
const SEQ_SCAN: Check = { kind: 'resultText', pattern: 'Seq Scan on visitas', label: 'O plano mostra a leitura sequencial (Seq Scan) da tabela visitas' }
/** O plano usa algum índice e NÃO lê visitas inteira. (O Seq Scan de `produtos`, de 8 linhas, não conta.) */
const USES_INDEX: Check = {
  kind: 'resultText',
  pattern: '^(?![\\s\\S]*Seq Scan on visitas)[\\s\\S]*Index',
  label: 'O plano usa um índice e não lê a tabela visitas inteira',
}
const EXPLAIN_ANALYZE = uses('explain\\s+analyze', 'Usou EXPLAIN ANALYZE')

export const m11: Module = {
  id: 'm11',
  title: 'Índices e performance',
  subtitle: 'EXPLAIN, B-tree, índices compostos, parciais e únicos sobre 60 mil visitas',
  emoji: '🚀',
  lessons: [
    {
      id: 'm11-l1',
      title: 'Lendo planos: EXPLAIN',
      summary: 'Uma tabela grande, uma consulta lenta e o plano que mostra por quê.',
      theory: theoryExplain,
      steps: [
        seedStep({
          id: 'm11-l1-s1',
          title: 'Carga: 60 mil visitas',
          goal: 'Para sentir a diferença de um índice é preciso **massa de dados**. Rode a carga abaixo: ela cria a tabela `visitas` e a enche com **60 mil linhas** geradas por `generate_series`. Leia o script antes (veja como `ANALYZE` aparece no fim).',
          context: 'A aba **Dados** passa a comparar só o **total** de linhas, não linha a linha, porque a tabela é grande.',
          hints: ['Execute o script do editor (pode levar alguns segundos) e clique em Verificar.'],
          script: VISITAS_SEED,
          checks: [
            { kind: 'rowCount', table: 'visitas', equals: 60000 },
            catalog('As estatísticas da tabela foram atualizadas (ANALYZE)', "SELECT reltuples >= 59000 FROM pg_class WHERE relname = 'visitas'", 'Rode o script inteiro, inclusive o ANALYZE do final.'),
          ],
        }),
        {
          id: 'm11-l1-s2',
          title: 'Meça a consulta sem índice',
          goal: 'Rode `EXPLAIN ANALYZE` sobre `SELECT * FROM visitas WHERE sessao = 1234` e leia o resultado: o Postgres lê a tabela **toda** (`Seq Scan`) para devolver umas poucas linhas. Note o `Rows Removed by Filter` e o `Execution Time`.',
          hints: ['Basta escrever `EXPLAIN ANALYZE` na frente da consulta.', '`EXPLAIN ANALYZE SELECT * FROM visitas WHERE sessao = 1234;`'],
          solution: 'EXPLAIN ANALYZE SELECT * FROM visitas WHERE sessao = 1234;',
          wrong: ['EXPLAIN SELECT * FROM visitas WHERE sessao = 1234;'],
          checks: [EXPLAIN_ANALYZE, SEQ_SCAN, EXECUTION_TIME],
        },
      ],
    },
    {
      id: 'm11-l2',
      title: 'Índices B-tree',
      summary: 'Criar índices simples e compostos e ver o plano mudar.',
      theory: theoryBtree,
      steps: [
        {
          id: 'm11-l2-s1',
          title: 'O primeiro índice',
          goal: 'Crie o índice `idx_visitas_sessao` sobre a coluna `sessao` de `visitas`.',
          hints: ['`CREATE INDEX nome ON tabela (coluna);`', '`CREATE INDEX idx_visitas_sessao ON visitas (sessao);`'],
          solution: 'CREATE INDEX idx_visitas_sessao ON visitas (sessao);',
          wrong: ['CREATE INDEX idx_visitas_sessao ON visitas (produto_id);'],
          checks: [{ kind: 'index', table: 'visitas', columns: ['sessao'], unique: false, method: 'btree' }],
        },
        {
          id: 'm11-l2-s2',
          title: 'Meça de novo',
          goal: 'Rode **a mesma** `EXPLAIN ANALYZE SELECT * FROM visitas WHERE sessao = 1234` e compare com a leitura anterior: o `Seq Scan` deu lugar a um **índice**, e o tempo caiu várias vezes.',
          hints: ['É o mesmo comando do passo anterior.'],
          solution: 'EXPLAIN ANALYZE SELECT * FROM visitas WHERE sessao = 1234;',
          wrong: ['EXPLAIN SELECT * FROM visitas WHERE sessao = 1234;'],
          checks: [EXPLAIN_ANALYZE, USES_INDEX, EXECUTION_TIME],
        },
        {
          id: 'm11-l2-s3',
          title: 'Filtro + ordenação: índice composto',
          goal: `Esta consulta pega os **20 acessos mais recentes** da Mochila desde março:

\`\`\`sql
SELECT visto_em FROM visitas
WHERE produto_id = (SELECT id FROM produtos WHERE nome = 'Mochila')
  AND visto_em >= '2026-03-01'
ORDER BY visto_em DESC
LIMIT 20;
\`\`\`

No **mesmo script**, crie o índice composto **que serve ao filtro e à ordenação** (a igualdade primeiro, depois a coluna de intervalo/ordem) e rode \`EXPLAIN ANALYZE\` sobre a consulta, confirmando que o plano usa o índice.`,
          starter: '-- 1) CREATE INDEX ...\n-- 2) EXPLAIN ANALYZE ...\n',
          hints: [
            'Duas colunas: a comparada com `=` vem primeiro (`produto_id`), depois a de ordenação (`visto_em`).',
            '`CREATE INDEX idx_visitas_produto_visto ON visitas (produto_id, visto_em);`',
          ],
          solution: `CREATE INDEX idx_visitas_produto_visto ON visitas (produto_id, visto_em);

EXPLAIN ANALYZE
SELECT visto_em FROM visitas
WHERE produto_id = (SELECT id FROM produtos WHERE nome = 'Mochila')
  AND visto_em >= '2026-03-01'
ORDER BY visto_em DESC
LIMIT 20;`,
          wrong: [
            `CREATE INDEX idx_visitas_visto_produto ON visitas (visto_em, produto_id);
EXPLAIN ANALYZE SELECT visto_em FROM visitas WHERE produto_id = (SELECT id FROM produtos WHERE nome = 'Mochila') AND visto_em >= '2026-03-01' ORDER BY visto_em DESC LIMIT 20;`,
            `CREATE INDEX idx_visitas_produto ON visitas (produto_id);
EXPLAIN ANALYZE SELECT visto_em FROM visitas WHERE produto_id = (SELECT id FROM produtos WHERE nome = 'Mochila') AND visto_em >= '2026-03-01' ORDER BY visto_em DESC LIMIT 20;`,
          ],
          checks: [
            { kind: 'index', table: 'visitas', columns: ['produto_id', 'visto_em'] },
            EXPLAIN_ANALYZE,
            USES_INDEX,
          ],
        },
      ],
    },
    {
      id: 'm11-l3',
      title: 'Índices parciais, de expressão e únicos',
      summary: 'Indexar só o que importa, ignorar maiúsculas e apagar o que não compensa.',
      theory: theoryParciais,
      steps: [
        {
          id: 'm11-l3-s1',
          title: 'Um índice só para anônimos',
          goal: 'O relatório de tráfego anônimo só olha visitas **sem cliente**. Crie o índice **parcial** `idx_visitas_anonimas` sobre `visto_em`, **só** para as linhas em que `cliente_id IS NULL`.',
          hints: ['Acrescente `WHERE condição` no fim do `CREATE INDEX`.', '`CREATE INDEX idx_visitas_anonimas ON visitas (visto_em) WHERE cliente_id IS NULL;`'],
          solution: 'CREATE INDEX idx_visitas_anonimas ON visitas (visto_em) WHERE cliente_id IS NULL;',
          wrong: ['CREATE INDEX idx_visitas_anonimas ON visitas (visto_em);'],
          checks: [
            { kind: 'index', table: 'visitas', columns: ['visto_em'], partial: true },
            catalog('O índice se chama idx_visitas_anonimas', "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_visitas_anonimas')", 'Use exatamente o nome idx_visitas_anonimas.'),
          ],
        },
        {
          id: 'm11-l3-s2',
          title: 'Prove que ele é usado',
          goal: 'Rode `EXPLAIN ANALYZE` sobre `SELECT count(*) FROM visitas WHERE cliente_id IS NULL AND visto_em >= \'2026-04-01\'` e confirme que o plano cita `idx_visitas_anonimas`. (A condição `cliente_id IS NULL` é o que autoriza o planejador a usar o índice parcial.)',
          hints: ["`EXPLAIN ANALYZE SELECT count(*) FROM visitas WHERE cliente_id IS NULL AND visto_em >= '2026-04-01';`"],
          solution: "EXPLAIN ANALYZE SELECT count(*) FROM visitas WHERE cliente_id IS NULL AND visto_em >= '2026-04-01';",
          wrong: ["EXPLAIN ANALYZE SELECT count(*) FROM visitas WHERE visto_em >= '2026-04-01';"],
          checks: [EXPLAIN_ANALYZE, { kind: 'resultText', pattern: 'idx_visitas_anonimas', label: 'O plano usa o índice idx_visitas_anonimas' }],
        },
        {
          id: 'm11-l3-s3',
          title: 'Nome único, sem ligar para maiúsculas',
          goal: 'Hoje `Meia` e `MEIA` são nomes **diferentes** para o banco. Crie o índice **único** `uq_produtos_nome_ci` sobre `lower(nome)` em `produtos`, para que eles colidam.',
          hints: ['`CREATE UNIQUE INDEX nome ON tabela (expressão);`', '`CREATE UNIQUE INDEX uq_produtos_nome_ci ON produtos (lower(nome));`'],
          solution: 'CREATE UNIQUE INDEX uq_produtos_nome_ci ON produtos (lower(nome));',
          wrong: ['CREATE UNIQUE INDEX uq_produtos_nome_ci ON produtos (nome);'],
          checks: [
            catalog(
              'Existe um índice único sobre lower(nome)',
              "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'produtos' AND indexdef ILIKE 'CREATE UNIQUE INDEX%lower%')",
              'Não achei um índice único sobre lower(nome).',
            ),
          ],
        },
        {
          id: 'm11-l3-s4',
          title: 'Tente cadastrar "MEIA"',
          goal: 'Tente cadastrar um produto `MEIA` (R$ 9,90) na categoria `Acessórios`. O índice único de expressão deve recusar: já existe a `Meia`.',
          hints: ["`INSERT INTO produtos (categoria_id, nome, preco) SELECT id, 'MEIA', 9.90 FROM categorias WHERE nome = 'Acessórios';`"],
          solution: "INSERT INTO produtos (categoria_id, nome, preco)\nSELECT id, 'MEIA', 9.90 FROM categorias WHERE nome = 'Acessórios';",
          expectError: true,
          wrong: ["INSERT INTO produtos (categoria_id, nome, preco) SELECT id, 'Gorro', 9.90 FROM categorias WHERE nome = 'Acessórios';"],
          checks: [
            { kind: 'lastRunError', code: '23505', label: 'O banco recusou: nome repetido, ignorando maiúsculas (23505)' },
            { kind: 'rowCount', table: 'produtos', equals: 8 },
          ],
        },
        {
          id: 'm11-l3-s5',
          title: 'Apague o que não compensa',
          goal: 'O índice parcial era só para o relatório de teste. Apague `idx_visitas_anonimas`. Os dados continuam intactos: só deixa de haver o atalho (e o custo de mantê-lo).',
          hints: ['`DROP INDEX nome;`', '`DROP INDEX idx_visitas_anonimas;`'],
          solution: 'DROP INDEX idx_visitas_anonimas;',
          wrong: ['DROP INDEX uq_produtos_nome_ci;'],
          checks: [
            catalog('O índice idx_visitas_anonimas não existe mais', "SELECT NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_visitas_anonimas')", 'O índice ainda existe.'),
            catalog('O índice único de nomes continua lá', "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_produtos_nome_ci')", 'Você apagou o índice errado.'),
            { kind: 'rowCount', table: 'visitas', equals: 60000 },
          ],
        },
      ],
    },
    {
      id: 'm11-boss',
      title: 'Chefão: a consulta lenta',
      summary: 'Diagnosticar com EXPLAIN e escolher o índice certo.',
      boss: true,
      theory: `# 👹 Chefão do módulo 11

O time de marketing reclama que o painel "**últimos acessos da Ana vindos de anúncios**" está lento:

\`\`\`sql
SELECT visto_em FROM visitas
WHERE cliente_id = (SELECT id FROM clientes WHERE nome = 'Ana Souza')
  AND origem = 'anuncio'
ORDER BY visto_em DESC
LIMIT 20;
\`\`\`

**Nenhum** dos índices que você criou atende esta consulta. Diagnostique com \`EXPLAIN ANALYZE\`, escolha as colunas **e a ordem** certas, crie o índice e **prove** que o plano melhorou.`,
      steps: [
        {
          id: 'm11-boss-s1',
          title: 'Conserte a consulta lenta',
          xp: BOSS_STEP_XP,
          goal: `No **mesmo script**:

1. crie **um índice** que sirva a essa consulta (pense: quais colunas são comparadas com \`=\`, e qual dá a ordenação?);
2. rode \`EXPLAIN ANALYZE\` sobre **a consulta do painel** e confirme que o plano **não lê mais a tabela inteira**.`,
          starter: '-- 1) o índice\n-- 2) EXPLAIN ANALYZE da consulta do painel\n',
          hints: [
            'As colunas filtradas com `=` são `cliente_id` e `origem`; a ordenação é por `visto_em`.',
            'Igualdades primeiro, ordenação por último: `(cliente_id, origem, visto_em)`.',
            "`CREATE INDEX idx_visitas_cliente_origem ON visitas (cliente_id, origem, visto_em);` e depois o `EXPLAIN ANALYZE` com a consulta completa.",
          ],
          solution: `CREATE INDEX idx_visitas_cliente_origem ON visitas (cliente_id, origem, visto_em);

EXPLAIN ANALYZE
SELECT visto_em FROM visitas
WHERE cliente_id = (SELECT id FROM clientes WHERE nome = 'Ana Souza')
  AND origem = 'anuncio'
ORDER BY visto_em DESC
LIMIT 20;`,
          wrong: [
            `EXPLAIN ANALYZE SELECT visto_em FROM visitas WHERE cliente_id = (SELECT id FROM clientes WHERE nome = 'Ana Souza') AND origem = 'anuncio' ORDER BY visto_em DESC LIMIT 20;`,
            `CREATE INDEX idx_visitas_sessao_2 ON visitas (sessao, origem);
EXPLAIN ANALYZE SELECT visto_em FROM visitas WHERE cliente_id = (SELECT id FROM clientes WHERE nome = 'Ana Souza') AND origem = 'anuncio' ORDER BY visto_em DESC LIMIT 20;`,
          ],
          checks: [
            uses('create\\s+index', 'Criou um índice'),
            EXPLAIN_ANALYZE,
            { kind: 'resultText', pattern: "'anuncio'", label: 'O plano é o da consulta do painel (filtra origem = anuncio)' },
            USES_INDEX,
          ],
        },
      ],
    },
  ],
}

import type { Module, Step } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import { catalog, checkDefinition } from '../helpers'
import theoryRel from './theory/01-relacionamentos.md?raw'
import theoryPedidos from './theory/02-pedidos.md?raw'
import theoryJuncao from './theory/03-tabela-de-juncao.md?raw'
import theoryNorm from './theory/04-normalizacao.md?raw'

/** Passo de carga: o aluno lê (com a explicação ao lado) e roda um script pronto. */
function seedStep(s: Pick<Step, 'id' | 'title' | 'goal' | 'context' | 'hints' | 'checks'> & { script: string }): Step {
  const { script, ...rest } = s
  return { ...rest, starter: script, solution: script }
}

const ENDERECOS_SEED = `-- Carga: endereços de Bruno e Carla (Carla tem dois)
INSERT INTO enderecos (cliente_id, rua, cidade, uf, cep)
SELECT id, 'Av. Atlântica, 200', 'Rio de Janeiro', 'RJ', '22021-000' FROM clientes WHERE cpf = '222.222.222-22';

INSERT INTO enderecos (cliente_id, rua, cidade, uf, cep)
SELECT id, 'Rua XV de Novembro, 300', 'Curitiba', 'PR', '80020-310' FROM clientes WHERE cpf = '333.333.333-33';

INSERT INTO enderecos (cliente_id, rua, cidade, uf, cep)
SELECT id, 'Rua Augusta, 400', 'São Paulo', 'SP', '01305-000' FROM clientes WHERE cpf = '333.333.333-33';
`

const PEDIDOS_SEED = `-- Carga: mais quatro pedidos
INSERT INTO pedidos (cliente_id, criado_em, status)
SELECT id, '2026-02-05 15:30', 'enviado' FROM clientes WHERE cpf = '111.111.111-11';

INSERT INTO pedidos (cliente_id, criado_em, status)
SELECT id, '2026-02-20 09:15', 'pago' FROM clientes WHERE cpf = '222.222.222-22';

INSERT INTO pedidos (cliente_id, criado_em, status)
SELECT id, '2026-03-02 18:45', 'novo' FROM clientes WHERE cpf = '333.333.333-33';

INSERT INTO pedidos (cliente_id, criado_em, status)
SELECT id, '2026-03-15 11:00', 'cancelado' FROM clientes WHERE cpf = '333.333.333-33';
`

const PRODUTOS_SEED = `-- Carga: estoque dos produtos existentes e o resto do catálogo
UPDATE produtos SET estoque = 30 WHERE nome = 'Camiseta Básica';
UPDATE produtos SET estoque = 20 WHERE nome = 'Camiseta Estampada';

INSERT INTO produtos (categoria_id, nome, preco, estoque)
SELECT c.id, v.nome, v.preco, v.estoque
FROM (VALUES
  ('Calçados',   'Tênis Corrida',  299.90, 15),
  ('Calçados',   'Chinelo',         39.90, 40),
  ('Acessórios', 'Boné',            59.90, 25),
  ('Acessórios', 'Mochila',        189.90,  8),
  ('Acessórios', 'Meia',            19.90, 100),
  ('Acessórios', 'Cinto de Couro',  89.90, 12)
) AS v(categoria, nome, preco, estoque)
JOIN categorias c ON c.nome = v.categoria;
`

const ITENS_SEED = `-- Carga: os itens dos outros quatro pedidos
-- O preço do item é copiado do produto NO MOMENTO da venda.
INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
SELECT p.id, pr.id, v.quantidade, pr.preco
FROM (VALUES
  ('2026-02-05 15:30', 'Tênis Corrida',      1),
  ('2026-02-20 09:15', 'Camiseta Estampada', 1),
  ('2026-02-20 09:15', 'Meia',               3),
  ('2026-02-20 09:15', 'Chinelo',            1),
  ('2026-03-02 18:45', 'Mochila',            1),
  ('2026-03-02 18:45', 'Camiseta Básica',    1),
  ('2026-03-15 11:00', 'Tênis Corrida',      1)
) AS v(pedido, produto, quantidade)
JOIN pedidos  p  ON p.criado_em = v.pedido::timestamp
JOIN produtos pr ON pr.nome = v.produto;
`

export const m04: Module = {
  id: 'm04',
  title: 'Modelagem: desenhando relações',
  subtitle: '1:1, 1:N, N:N e normalização: endereços, pedidos, itens e pagamentos',
  emoji: '🧩',
  lessons: [
    {
      id: 'm04-l1',
      title: 'Relacionamentos: endereços (1:N)',
      summary: 'Escolher o tipo de relação e criar a tabela de endereços do cliente.',
      theory: theoryRel,
      steps: [
        {
          id: 'm04-l1-s1',
          title: 'A tabela enderecos',
          goal: `Um cliente tem **vários** endereços (1:N). Crie \`enderecos\` com:

- \`id\`: inteiro, chave primária, automático;
- \`cliente_id\`: inteiro obrigatório, **chave estrangeira** para \`clientes(id)\` com \`ON DELETE CASCADE\`;
- \`rua\`: texto até 150, obrigatório;
- \`cidade\`: texto até 80, obrigatório;
- \`uf\`: **exatamente 2 caracteres** (\`CHAR(2)\`), obrigatório;
- \`cep\`: texto até 9, obrigatório.`,
          starter: '-- Crie a tabela enderecos\n',
          hints: [
            '`cliente_id INTEGER NOT NULL REFERENCES clientes (id) ON DELETE CASCADE`',
            '`uf CHAR(2) NOT NULL`: tamanho fixo.',
          ],
          solution: `CREATE TABLE enderecos (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes (id) ON DELETE CASCADE,
  rua        VARCHAR(150) NOT NULL,
  cidade     VARCHAR(80)  NOT NULL,
  uf         CHAR(2)      NOT NULL,
  cep        VARCHAR(9)   NOT NULL
);`,
          wrong: [
            `CREATE TABLE enderecos (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES clientes (id),
  rua VARCHAR(150) NOT NULL, cidade VARCHAR(80) NOT NULL, uf CHAR(2) NOT NULL, cep VARCHAR(9) NOT NULL);`,
          ],
          checks: [
            { kind: 'tableExists', table: 'enderecos' },
            { kind: 'column', table: 'enderecos', name: 'id', primaryKey: true, autoGenerated: true },
            { kind: 'column', table: 'enderecos', name: 'cliente_id', type: 'integer', nullable: false },
            { kind: 'constraint', table: 'enderecos', constraint: 'foreign', columns: ['cliente_id'], refTable: 'clientes', onDelete: 'CASCADE' },
            { kind: 'column', table: 'enderecos', name: 'rua', type: 'character varying(150)', nullable: false },
            { kind: 'column', table: 'enderecos', name: 'cidade', type: 'character varying(80)', nullable: false },
            { kind: 'column', table: 'enderecos', name: 'uf', type: 'character(2)', nullable: false },
            { kind: 'column', table: 'enderecos', name: 'cep', type: 'character varying(9)', nullable: false },
          ],
        },
        {
          id: 'm04-l1-s2',
          title: 'O endereço da Ana',
          goal: 'Cadastre o endereço da **Ana** (CPF `111.111.111-11`): `Rua das Flores, 100`, `São Paulo`, `SP`, CEP `01001-000`. Use `INSERT ... SELECT` para buscar o `id` dela **pelo CPF**.',
          hints: [
            'O `SELECT` devolve o `id` do cliente e os textos fixos, filtrando por `WHERE cpf = ...`.',
            "`INSERT INTO enderecos (cliente_id, rua, cidade, uf, cep) SELECT id, 'Rua das Flores, 100', 'São Paulo', 'SP', '01001-000' FROM clientes WHERE cpf = '111.111.111-11';`",
          ],
          solution: `INSERT INTO enderecos (cliente_id, rua, cidade, uf, cep)
SELECT id, 'Rua das Flores, 100', 'São Paulo', 'SP', '01001-000'
FROM clientes WHERE cpf = '111.111.111-11';`,
          wrong: [
            `INSERT INTO enderecos (cliente_id, rua, cidade, uf, cep)
SELECT id, 'Rua das Flores, 100', 'São Paulo', 'SP', '01001-000' FROM clientes WHERE cpf = '222.222.222-22';`,
          ],
          checks: [
            { kind: 'rowCount', table: 'enderecos', equals: 1 },
            catalog(
              'O endereço está ligado à Ana',
              `SELECT count(*) = 1 FROM enderecos e JOIN clientes c ON c.id = e.cliente_id
               WHERE c.cpf = '111.111.111-11' AND e.rua = 'Rua das Flores, 100' AND e.cidade = 'São Paulo' AND e.uf = 'SP' AND e.cep = '01001-000'`,
              'Confira cliente, rua, cidade, UF e CEP.',
            ),
          ],
        },
        seedStep({
          id: 'm04-l1-s3',
          title: 'Carga: os demais endereços',
          goal: 'Para não repetir o mesmo `INSERT` à mão, rode a **carga de endereços** abaixo. **Leia antes**: veja na aba *Explicação do código* como cada linha encontra o cliente pelo CPF. Note que a **Carla tem dois endereços** (isso é o "N" do 1:N).',
          hints: ['É só executar o script que já está no editor e clicar em Verificar.'],
          script: ENDERECOS_SEED,
          checks: [
            { kind: 'rowCount', table: 'enderecos', equals: 4 },
            catalog(
              'A Carla tem dois endereços',
              "SELECT count(*) = 2 FROM enderecos e JOIN clientes c ON c.id = e.cliente_id WHERE c.cpf = '333.333.333-33'",
              'Rode o script inteiro, sem apagar nenhum INSERT.',
            ),
          ],
        }),
      ],
    },
    {
      id: 'm04-l2',
      title: 'Pedidos: o coração da loja',
      summary: 'Cabeçalho do pedido, status restrito por CHECK e datas.',
      theory: theoryPedidos,
      steps: [
        {
          id: 'm04-l2-s1',
          title: 'A tabela pedidos',
          goal: `Crie \`pedidos\` com:

- \`id\`: inteiro, chave primária, automático;
- \`cliente_id\`: inteiro obrigatório, chave estrangeira para \`clientes(id)\` (**sem** \`CASCADE\`: o histórico não some);
- \`criado_em\`: \`TIMESTAMP\` obrigatório, padrão **agora** (\`now()\`);
- \`status\`: texto até 20, obrigatório, padrão \`'novo'\`, e **só** aceita \`'novo'\`, \`'pago'\`, \`'enviado'\` ou \`'cancelado'\`.`,
          starter: '-- Crie a tabela pedidos\n',
          hints: [
            '`criado_em TIMESTAMP NOT NULL DEFAULT now()`',
            "`status VARCHAR(20) NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'pago', 'enviado', 'cancelado'))`",
          ],
          solution: `CREATE TABLE pedidos (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes (id),
  criado_em  TIMESTAMP NOT NULL DEFAULT now(),
  status     VARCHAR(20) NOT NULL DEFAULT 'novo'
             CHECK (status IN ('novo', 'pago', 'enviado', 'cancelado'))
);`,
          wrong: [
            `CREATE TABLE pedidos (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES clientes (id),
  criado_em TIMESTAMP NOT NULL DEFAULT now(), status VARCHAR(20) NOT NULL DEFAULT 'novo');`,
          ],
          checks: [
            { kind: 'tableExists', table: 'pedidos' },
            { kind: 'column', table: 'pedidos', name: 'id', primaryKey: true, autoGenerated: true },
            { kind: 'constraint', table: 'pedidos', constraint: 'foreign', columns: ['cliente_id'], refTable: 'clientes' },
            { kind: 'column', table: 'pedidos', name: 'cliente_id', type: 'integer', nullable: false },
            { kind: 'column', table: 'pedidos', name: 'criado_em', type: 'timestamp without time zone', nullable: false, hasDefault: true },
            { kind: 'column', table: 'pedidos', name: 'status', type: 'character varying(20)', nullable: false, hasDefault: true },
            checkDefinition('pedidos', 'cancelado', 'O status só aceita os valores permitidos'),
          ],
        },
        {
          id: 'm04-l2-s2',
          title: 'O primeiro pedido',
          goal: 'Registre um pedido da **Ana** (CPF `111.111.111-11`) criado em `2026-01-10 10:00` com status `pago`. Busque o cliente pelo CPF com `INSERT ... SELECT`.',
          hints: ["O `SELECT` devolve `id, '2026-01-10 10:00', 'pago'` da tabela `clientes`.", "`INSERT INTO pedidos (cliente_id, criado_em, status) SELECT id, '2026-01-10 10:00', 'pago' FROM clientes WHERE cpf = '111.111.111-11';`"],
          solution: `INSERT INTO pedidos (cliente_id, criado_em, status)
SELECT id, '2026-01-10 10:00', 'pago' FROM clientes WHERE cpf = '111.111.111-11';`,
          wrong: [`INSERT INTO pedidos (cliente_id, criado_em, status) SELECT id, '2026-01-10 10:00', 'novo' FROM clientes WHERE cpf = '111.111.111-11';`],
          checks: [
            { kind: 'rowCount', table: 'pedidos', equals: 1 },
            catalog(
              'O pedido é da Ana, de 10/01/2026 às 10:00, com status pago',
              `SELECT count(*) = 1 FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
               WHERE c.cpf = '111.111.111-11' AND p.criado_em = '2026-01-10 10:00' AND p.status = 'pago'`,
              'Confira cliente, data e status.',
            ),
          ],
        },
        seedStep({
          id: 'm04-l2-s3',
          title: 'Carga: mais quatro pedidos',
          goal: 'Rode a **carga de pedidos** abaixo (leia antes). Repare que o cliente é sempre encontrado **pelo CPF**, nunca por um `id` decorado, e que a **Elisa fica sem pedidos** de propósito: vamos precisar dela nas aulas de JOIN.',
          hints: ['Execute o script que está no editor e clique em Verificar.'],
          script: PEDIDOS_SEED,
          checks: [
            { kind: 'rowCount', table: 'pedidos', equals: 5 },
            catalog(
              'Há 2 pagos, 1 enviado, 1 novo e 1 cancelado',
              `SELECT count(*) FILTER (WHERE status = 'pago') = 2 AND count(*) FILTER (WHERE status = 'enviado') = 1
                  AND count(*) FILTER (WHERE status = 'novo') = 1 AND count(*) FILTER (WHERE status = 'cancelado') = 1 FROM pedidos`,
              'Rode o script inteiro.',
            ),
          ],
        }),
        {
          id: 'm04-l2-s4',
          title: 'Um status que não existe',
          goal: 'Tente registrar um pedido da Ana (CPF `111.111.111-11`) com status `entregue`. O `CHECK` deve recusar.',
          hints: ["`INSERT INTO pedidos (cliente_id, status) SELECT id, 'entregue' FROM clientes WHERE cpf = '111.111.111-11';`"],
          solution: "INSERT INTO pedidos (cliente_id, status)\nSELECT id, 'entregue' FROM clientes WHERE cpf = '111.111.111-11';",
          expectError: true,
          wrong: ["INSERT INTO pedidos (cliente_id, status) SELECT id, 'enviado' FROM clientes WHERE cpf = '111.111.111-11';"],
          checks: [
            { kind: 'lastRunError', code: '23514', label: 'O banco recusou o status (23514)' },
            { kind: 'rowCount', table: 'pedidos', equals: 5 },
          ],
        },
      ],
    },
    {
      id: 'm04-l3',
      title: 'N:N: produtos em pedidos',
      summary: 'Tabela de junção com chave primária composta.',
      theory: theoryJuncao,
      steps: [
        seedStep({
          id: 'm04-l3-s1',
          title: 'Carga: o catálogo completo',
          goal: 'Para ter o que vender, rode a **carga do catálogo**. Ela atualiza o estoque dos dois produtos que você cadastrou e insere seis novos. Veja no script como o `JOIN` troca o **nome** da categoria pelo seu `id`.',
          hints: ['Execute o script do editor e clique em Verificar.'],
          script: PRODUTOS_SEED,
          checks: [
            { kind: 'rowCount', table: 'produtos', equals: 8 },
            catalog('Todos os produtos têm estoque', 'SELECT count(*) = 8 FROM produtos WHERE estoque > 0', 'Rode o script inteiro, inclusive os UPDATE.'),
          ],
        }),
        {
          id: 'm04-l3-s2',
          title: 'A tabela itens_pedido',
          goal: `Crie a tabela de junção \`itens_pedido\` com:

- \`pedido_id\`: inteiro obrigatório, chave estrangeira para \`pedidos(id)\` com \`ON DELETE CASCADE\`;
- \`produto_id\`: inteiro obrigatório, chave estrangeira para \`produtos(id)\`;
- \`quantidade\`: inteiro obrigatório, **maior que zero**;
- \`preco_unitario\`: \`NUMERIC(10,2)\` obrigatório, **não negativo**;
- chave primária **composta** por (\`pedido_id\`, \`produto_id\`).`,
          starter: '-- Crie a tabela itens_pedido\n',
          hints: [
            'A chave primária composta vai **à parte**: `PRIMARY KEY (pedido_id, produto_id)`.',
            '`quantidade INTEGER NOT NULL CHECK (quantidade > 0)`',
          ],
          solution: `CREATE TABLE itens_pedido (
  pedido_id      INTEGER NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
  produto_id     INTEGER NOT NULL REFERENCES produtos (id),
  quantidade     INTEGER NOT NULL CHECK (quantidade > 0),
  preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),
  PRIMARY KEY (pedido_id, produto_id)
);`,
          wrong: [
            `CREATE TABLE itens_pedido (pedido_id INTEGER NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE, produto_id INTEGER NOT NULL REFERENCES produtos (id),
  quantidade INTEGER NOT NULL CHECK (quantidade > 0), preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0), PRIMARY KEY (pedido_id));`,
          ],
          checks: [
            { kind: 'tableExists', table: 'itens_pedido' },
            { kind: 'constraint', table: 'itens_pedido', constraint: 'primary', columns: ['pedido_id', 'produto_id'] },
            { kind: 'constraint', table: 'itens_pedido', constraint: 'foreign', columns: ['pedido_id'], refTable: 'pedidos', onDelete: 'CASCADE' },
            { kind: 'constraint', table: 'itens_pedido', constraint: 'foreign', columns: ['produto_id'], refTable: 'produtos' },
            { kind: 'column', table: 'itens_pedido', name: 'quantidade', type: 'integer', nullable: false },
            { kind: 'column', table: 'itens_pedido', name: 'preco_unitario', type: 'numeric(10,2)', nullable: false },
            checkDefinition('itens_pedido', 'quantidade > \\(?0\\)?', 'A quantidade precisa ser maior que zero'),
          ],
        },
        {
          id: 'm04-l3-s3',
          title: 'Os itens do primeiro pedido',
          goal: 'O pedido de `2026-01-10 10:00` (da Ana) tem **2 × Camiseta Básica a 49.90** e **1 × Boné a 59.90**. Cadastre os dois itens num `INSERT` com **subconsultas** no `VALUES`, para achar os ids pelo que você conhece.',
          hints: [
            "O pedido se acha por `(SELECT id FROM pedidos WHERE criado_em = '2026-01-10 10:00')` e o produto por `(SELECT id FROM produtos WHERE nome = '...')`.",
            'Cada linha do `VALUES` é: pedido, produto, quantidade, preço.',
          ],
          solution: `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario) VALUES
  ((SELECT id FROM pedidos WHERE criado_em = '2026-01-10 10:00'), (SELECT id FROM produtos WHERE nome = 'Camiseta Básica'), 2, 49.90),
  ((SELECT id FROM pedidos WHERE criado_em = '2026-01-10 10:00'), (SELECT id FROM produtos WHERE nome = 'Boné'), 1, 59.90);`,
          wrong: [
            `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario) VALUES
  ((SELECT id FROM pedidos WHERE criado_em = '2026-01-10 10:00'), (SELECT id FROM produtos WHERE nome = 'Camiseta Básica'), 1, 49.90),
  ((SELECT id FROM pedidos WHERE criado_em = '2026-01-10 10:00'), (SELECT id FROM produtos WHERE nome = 'Boné'), 1, 59.90);`,
          ],
          checks: [
            { kind: 'rowCount', table: 'itens_pedido', equals: 2 },
            catalog(
              'Os dois itens estão no pedido certo, com quantidade e preço corretos',
              `SELECT count(*) = 2 FROM itens_pedido i
               JOIN pedidos p ON p.id = i.pedido_id JOIN produtos pr ON pr.id = i.produto_id
               WHERE p.criado_em = '2026-01-10 10:00'
                 AND ((pr.nome = 'Camiseta Básica' AND i.quantidade = 2 AND i.preco_unitario = 49.90)
                   OR (pr.nome = 'Boné' AND i.quantidade = 1 AND i.preco_unitario = 59.90))`,
              'Confira produto, quantidade e preço de cada item.',
            ),
          ],
        },
        seedStep({
          id: 'm04-l3-s4',
          title: 'Carga: os itens dos demais pedidos',
          goal: 'Rode a **carga de itens**. Leia o comentário no topo: o `preco_unitario` é **copiado** do produto na hora da venda (`pr.preco`). Veja também como o `VALUES` vira uma tabela temporária que o `JOIN` consome.',
          hints: ['Execute o script do editor e clique em Verificar.'],
          script: ITENS_SEED,
          checks: [
            { kind: 'rowCount', table: 'itens_pedido', equals: 9 },
            catalog('O total de todos os itens soma R$ 1.178,80', 'SELECT sum(quantidade * preco_unitario) = 1178.80 FROM itens_pedido', 'Rode o script inteiro, sem alterar nada.'),
          ],
        }),
        {
          id: 'm04-l3-s5',
          title: 'O mesmo produto duas vezes',
          goal: 'Tente acrescentar **de novo** a `Camiseta Básica` ao pedido de `2026-01-10 10:00`. A chave primária composta deve recusar: para comprar mais, aumenta-se a quantidade.',
          hints: ['Use `INSERT ... SELECT` juntando `pedidos` e `produtos` com `WHERE` para escolher o par.', "`INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario) SELECT p.id, pr.id, 1, 49.90 FROM pedidos p, produtos pr WHERE p.criado_em = '2026-01-10 10:00' AND pr.nome = 'Camiseta Básica';`"],
          solution: `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
SELECT p.id, pr.id, 1, 49.90 FROM pedidos p, produtos pr
WHERE p.criado_em = '2026-01-10 10:00' AND pr.nome = 'Camiseta Básica';`,
          expectError: true,
          wrong: [
            `INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
SELECT p.id, pr.id, 1, 19.90 FROM pedidos p, produtos pr WHERE p.criado_em = '2026-01-10 10:00' AND pr.nome = 'Meia';`,
          ],
          checks: [
            { kind: 'lastRunError', code: '23505', label: 'O banco recusou: o par pedido + produto já existe (23505)' },
            { kind: 'rowCount', table: 'itens_pedido', equals: 9 },
          ],
        },
      ],
    },
    {
      id: 'm04-l4',
      title: 'Normalização: 1FN, 2FN e 3FN',
      summary: 'Corrigir uma coluna com valor múltiplo, migrando os dados sem perder nada.',
      theory: theoryNorm,
      steps: [
        {
          id: 'm04-l4-s1',
          title: 'Uma tabela para telefones',
          goal: `A loja descobriu que clientes têm **mais de um telefone**, e a coluna \`clientes.telefone\` só comporta um (ou vira uma lista, que viola a 1FN). Crie \`telefones\` com:

- \`id\`: inteiro, chave primária, automático;
- \`cliente_id\`: inteiro obrigatório, chave estrangeira para \`clientes(id)\` com \`ON DELETE CASCADE\`;
- \`numero\`: texto até 20, obrigatório;
- \`tipo\`: texto até 10, obrigatório, padrão \`'celular'\`.`,
          starter: '-- Crie a tabela telefones\n',
          hints: ["`tipo VARCHAR(10) NOT NULL DEFAULT 'celular'`", 'Mesma ideia da tabela `enderecos`.'],
          solution: `CREATE TABLE telefones (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes (id) ON DELETE CASCADE,
  numero     VARCHAR(20) NOT NULL,
  tipo       VARCHAR(10) NOT NULL DEFAULT 'celular'
);`,
          wrong: ['CREATE TABLE telefones (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, cliente_id INTEGER NOT NULL REFERENCES clientes (id) ON DELETE CASCADE, numero VARCHAR(20) NOT NULL, tipo VARCHAR(10) NOT NULL);'],
          checks: [
            { kind: 'tableExists', table: 'telefones' },
            { kind: 'column', table: 'telefones', name: 'id', primaryKey: true, autoGenerated: true },
            { kind: 'constraint', table: 'telefones', constraint: 'foreign', columns: ['cliente_id'], refTable: 'clientes', onDelete: 'CASCADE' },
            { kind: 'column', table: 'telefones', name: 'numero', type: 'character varying(20)', nullable: false },
            { kind: 'column', table: 'telefones', name: 'tipo', type: 'character varying(10)', nullable: false, hasDefault: true },
          ],
        },
        {
          id: 'm04-l4-s2',
          title: 'Migre os números existentes',
          goal: 'Copie os telefones que **já estão** em `clientes.telefone` para a tabela nova (só os clientes que têm telefone), **num único `INSERT ... SELECT`**. Não apague nada ainda.',
          context: 'A ordem segura de uma migração: criar, **copiar**, conferir e só depois apagar.',
          hints: ['O `SELECT` devolve `id` e `telefone` de `clientes`.', 'Filtre quem tem telefone: `WHERE telefone IS NOT NULL`.'],
          solution: 'INSERT INTO telefones (cliente_id, numero)\nSELECT id, telefone FROM clientes WHERE telefone IS NOT NULL;',
          wrong: ["INSERT INTO telefones (cliente_id, numero) SELECT id, telefone FROM clientes WHERE cpf = '333.333.333-33';"],
          checks: [
            { kind: 'rowCount', table: 'telefones', equals: 2 },
            catalog(
              'Os números da Carla e da Elisa foram copiados',
              `SELECT count(*) = 2 FROM telefones t JOIN clientes c ON c.id = t.cliente_id
               WHERE (c.cpf = '333.333.333-33' AND t.numero = '(11) 98888-0003') OR (c.cpf = '555.555.555-55' AND t.numero = '(21) 97777-0005')`,
              'Confira se os dois clientes que tinham telefone foram copiados.',
            ),
          ],
        },
        {
          id: 'm04-l4-s3',
          title: 'Apague a coluna antiga',
          goal: 'Os dados estão a salvo na tabela nova. **Agora sim**, apague a coluna `telefone` de `clientes`.',
          hints: ['`ALTER TABLE ... DROP COLUMN ...`', '`ALTER TABLE clientes DROP COLUMN telefone;`'],
          solution: 'ALTER TABLE clientes DROP COLUMN telefone;',
          wrong: ['ALTER TABLE clientes DROP COLUMN criado_em;'],
          checks: [
            catalog(
              'A coluna clientes.telefone não existe mais',
              "SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'telefone')",
              'A coluna telefone ainda existe em clientes.',
            ),
            catalog('A coluna criado_em continua em clientes', "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'criado_em')", 'Você apagou a coluna errada.'),
            { kind: 'rowCount', table: 'telefones', equals: 2 },
          ],
        },
      ],
    },
    {
      id: 'm04-boss',
      title: 'Chefão: pagamentos',
      summary: 'Uma relação 1:1 desenhada só com requisitos.',
      boss: true,
      theory: `# 👹 Chefão do módulo 4

O financeiro quer registrar **pagamentos**. Você recebe as regras de negócio e **desenha a tabela**: quais chaves, quais restrições, o que acontece ao apagar.

Dica de modelagem: leia "no máximo um" como uma pista sobre o **tipo de relação**.`,
      steps: [
        {
          id: 'm04-boss-s1',
          title: 'A tabela pagamentos',
          xp: BOSS_STEP_XP,
          goal: `Crie a tabela \`pagamentos\` e registre um pagamento.

**Regras:**
- Cada pagamento tem um \`id\` automático (chave primária).
- Cada pedido pode ter **no máximo um** pagamento (\`pedido_id\`, obrigatório). Se o pedido for apagado, o pagamento vai junto.
- \`valor\`: decimal exato com 10 dígitos e 2 casas, obrigatório, **maior que zero**.
- \`metodo\`: texto de até 10 caracteres, obrigatório, **só** \`'pix'\`, \`'cartao'\` ou \`'boleto'\`.
- \`pago_em\`: data e hora obrigatória, padrão **agora**.

**Depois,** registre o pagamento do pedido de \`2026-01-10 10:00\`: \`99.80\` via \`pix\`.`,
          starter: '-- Crie a tabela pagamentos e registre o pagamento\n',
          hints: [
            '"No máximo um pagamento por pedido" é uma relação 1:1: chave estrangeira **com** `UNIQUE`.',
            '`pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos (id) ON DELETE CASCADE`',
            "O `metodo` precisa de `CHECK (metodo IN ('pix', 'cartao', 'boleto'))`.",
          ],
          solution: `CREATE TABLE pagamentos (
  id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos (id) ON DELETE CASCADE,
  valor     NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  metodo    VARCHAR(10) NOT NULL CHECK (metodo IN ('pix', 'cartao', 'boleto')),
  pago_em   TIMESTAMP NOT NULL DEFAULT now()
);

INSERT INTO pagamentos (pedido_id, valor, metodo)
SELECT id, 99.80, 'pix' FROM pedidos WHERE criado_em = '2026-01-10 10:00';`,
          wrong: [
            `CREATE TABLE pagamentos (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
  valor NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  metodo VARCHAR(10) NOT NULL CHECK (metodo IN ('pix', 'cartao', 'boleto')),
  pago_em TIMESTAMP NOT NULL DEFAULT now());
INSERT INTO pagamentos (pedido_id, valor, metodo) SELECT id, 99.80, 'pix' FROM pedidos WHERE criado_em = '2026-01-10 10:00';`,
          ],
          checks: [
            { kind: 'tableExists', table: 'pagamentos' },
            { kind: 'column', table: 'pagamentos', name: 'id', primaryKey: true, autoGenerated: true },
            { kind: 'column', table: 'pagamentos', name: 'pedido_id', type: 'integer', nullable: false, unique: true },
            { kind: 'constraint', table: 'pagamentos', constraint: 'foreign', columns: ['pedido_id'], refTable: 'pedidos', onDelete: 'CASCADE' },
            { kind: 'column', table: 'pagamentos', name: 'valor', type: 'numeric(10,2)', nullable: false },
            { kind: 'column', table: 'pagamentos', name: 'metodo', type: 'character varying(10)', nullable: false },
            { kind: 'column', table: 'pagamentos', name: 'pago_em', type: 'timestamp without time zone', nullable: false, hasDefault: true },
            checkDefinition('pagamentos', 'valor > \\(?0\\)?', 'O valor precisa ser maior que zero'),
            checkDefinition('pagamentos', ['pix', 'cartao', 'boleto'], 'O método só aceita pix, cartao e boleto'),
            { kind: 'rowCount', table: 'pagamentos', equals: 1 },
            catalog(
              'O pagamento do pedido de 10/01/2026 é de 99,80 via pix',
              `SELECT count(*) = 1 FROM pagamentos g JOIN pedidos p ON p.id = g.pedido_id
               WHERE p.criado_em = '2026-01-10 10:00' AND g.valor = 99.80 AND g.metodo = 'pix'`,
              'Confira o pedido, o valor e o método do pagamento registrado.',
            ),
          ],
        },
      ],
    },
  ],
}

import type { Module } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import theoryInsert from './theory/01-insert.md?raw'
import theorySelect from './theory/02-select.md?raw'
import theoryWhere from './theory/03-where.md?raw'
import theoryOrder from './theory/04-order-limit.md?raw'
import theoryUpdate from './theory/05-update.md?raw'
import theoryDelete from './theory/06-delete.md?raw'

export const m02: Module = {
  id: 'm02',
  title: 'Dados: inserir, consultar e corrigir',
  subtitle: 'INSERT, SELECT, WHERE, ORDER BY, UPDATE e DELETE nos clientes',
  emoji: '📦',
  lessons: [
    {
      id: 'm02-l1',
      title: 'INSERT: cadastrando clientes',
      summary: 'Acrescentar linhas e entender o que o banco recusa.',
      theory: theoryInsert,
      steps: [
        {
          id: 'm02-l1-s1',
          title: 'A primeira cliente',
          goal: 'Cadastre **Ana Souza**: email `ana@email.com`, CPF `111.111.111-11`. Não informe `id` nem `criado_em`: o banco preenche.',
          context: 'Repare que as colunas `id` (identity) e `criado_em` (DEFAULT) vão se preencher sozinhas.',
          starter: '-- Cadastre a Ana Souza\n',
          hints: [
            'Liste as colunas: `INSERT INTO clientes (nome, email, cpf)`',
            "Depois `VALUES ('...', '...', '...')`, na mesma ordem das colunas.",
            "`INSERT INTO clientes (nome, email, cpf) VALUES ('Ana Souza', 'ana@email.com', '111.111.111-11');`",
          ],
          solution:
            "INSERT INTO clientes (nome, email, cpf)\nVALUES ('Ana Souza', 'ana@email.com', '111.111.111-11');",
          wrong: ["INSERT INTO clientes (nome, email, cpf) VALUES ('Ana', 'ana@email.com', '111.111.111-11');"],
          checks: [
            { kind: 'rowCount', table: 'clientes', equals: 1 },
            {
              kind: 'sqlTrue',
              label: 'Ana Souza está cadastrada com o email e CPF corretos',
              sql: "SELECT count(*) = 1 FROM clientes WHERE nome = 'Ana Souza' AND email = 'ana@email.com' AND cpf = '111.111.111-11'",
              message: 'Confira nome, email e CPF: precisam ser exatamente os do enunciado.',
            },
            {
              kind: 'sqlTrue',
              label: 'O banco preencheu criado_em sozinho',
              sql: "SELECT bool_and(criado_em IS NOT NULL) FROM clientes WHERE nome = 'Ana Souza'",
              message: 'A coluna criado_em ficou vazia. Você informou algum valor para ela?',
            },
          ],
        },
        {
          id: 'm02-l1-s2',
          title: 'Quatro clientes de uma vez',
          goal: `Com **um único \`INSERT\`**, cadastre as quatro clientes abaixo (a coluna \`telefone\` é opcional: deixe de fora quando for "—").

| nome | email | cpf | data_nascimento | telefone |
|------|-------|-----|-----------------|----------|
| Bruno Lima | bruno@email.com | 222.222.222-22 | 1990-05-14 | — |
| Carla Mendes | carla@email.com | 333.333.333-33 | 1985-11-30 | (11) 98888-0003 |
| Diego Rocha | diego@email.com | 444.444.444-44 | 2001-02-09 | — |
| Elisa Prado | elisa@email.com | 555.555.555-55 | 1995-07-21 | (21) 97777-0005 |`,
          hints: [
            'Todas as linhas compartilham a **mesma lista de colunas**. Para quem não tem telefone, use `NULL` no lugar.',
            "Cada linha é um grupo `( ... )`; separe os grupos com vírgula: `VALUES (...), (...), (...)`.",
            "`INSERT INTO clientes (nome, email, cpf, data_nascimento, telefone) VALUES ('Bruno Lima', 'bruno@email.com', '222.222.222-22', '1990-05-14', NULL), ...`",
          ],
          solution: `INSERT INTO clientes (nome, email, cpf, data_nascimento, telefone) VALUES
  ('Bruno Lima',   'bruno@email.com', '222.222.222-22', '1990-05-14', NULL),
  ('Carla Mendes', 'carla@email.com', '333.333.333-33', '1985-11-30', '(11) 98888-0003'),
  ('Diego Rocha',  'diego@email.com', '444.444.444-44', '2001-02-09', NULL),
  ('Elisa Prado',  'elisa@email.com', '555.555.555-55', '1995-07-21', '(21) 97777-0005');`,
          wrong: [
            `INSERT INTO clientes (nome, email, cpf) VALUES
  ('Bruno Lima', 'bruno@email.com', '222.222.222-22'),
  ('Carla Mendes', 'carla@email.com', '333.333.333-33'),
  ('Diego Rocha', 'diego@email.com', '444.444.444-44'),
  ('Elisa Prado', 'elisa@email.com', '555.555.555-55');`,
          ],
          checks: [
            { kind: 'rowCount', table: 'clientes', equals: 5 },
            { kind: 'sqlMatches', pattern: 'values[\\s\\S]*\\)\\s*,\\s*\\(', label: 'Usou um único INSERT com várias linhas' },
            {
              kind: 'sqlTrue',
              label: 'Os quatro clientes estão com os dados corretos',
              sql: `SELECT count(*) = 4 FROM clientes WHERE
                (email = 'bruno@email.com' AND cpf = '222.222.222-22' AND data_nascimento = '1990-05-14' AND telefone IS NULL)
             OR (email = 'carla@email.com' AND cpf = '333.333.333-33' AND data_nascimento = '1985-11-30' AND telefone = '(11) 98888-0003')
             OR (email = 'diego@email.com' AND cpf = '444.444.444-44' AND data_nascimento = '2001-02-09' AND telefone IS NULL)
             OR (email = 'elisa@email.com' AND cpf = '555.555.555-55' AND data_nascimento = '1995-07-21' AND telefone = '(21) 97777-0005')`,
              message: 'Algum valor não bate com a tabela do enunciado. Confira data e telefone.',
            },
          ],
        },
        {
          id: 'm02-l1-s3',
          title: 'Quando o banco diz não',
          goal: 'Tente cadastrar **Fulano** (`fulano@email.com`) **sem informar o CPF** e leia a mensagem de erro. Aqui o erro **é** o objetivo.',
          context: 'O CPF é `NOT NULL`. O banco protege você de gravar um cliente sem dados fiscais.',
          hints: [
            'Informe só `nome` e `email` no `INSERT`.',
            "`INSERT INTO clientes (nome, email) VALUES ('Fulano', 'fulano@email.com');`",
          ],
          solution: "INSERT INTO clientes (nome, email) VALUES ('Fulano', 'fulano@email.com');",
          expectError: true,
          wrong: ["INSERT INTO clientes (nome, email, cpf) VALUES ('Fulano', 'fulano@email.com', '999.999.999-99');"],
          checks: [
            { kind: 'lastRunError', code: '23502', label: 'O banco recusou: coluna obrigatória sem valor (23502)' },
            { kind: 'rowCount', table: 'clientes', equals: 5 },
          ],
        },
      ],
    },
    {
      id: 'm02-l2',
      title: 'SELECT: escolhendo colunas',
      summary: 'Todas as colunas, só algumas e apelidos.',
      theory: theorySelect,
      steps: [
        {
          id: 'm02-l2-s1',
          title: 'Veja tudo',
          goal: 'Mostre **todas as colunas e linhas** de `clientes`.',
          hints: ['`*` significa todas as colunas.', '`SELECT * FROM clientes;`'],
          solution: 'SELECT * FROM clientes;',
          checks: [{ kind: 'resultMatches', expectedSql: 'SELECT * FROM clientes' }],
        },
        {
          id: 'm02-l2-s2',
          title: 'Só o essencial',
          goal: 'Mostre apenas `nome` e `email` de todos os clientes.',
          hints: ['Liste as colunas separadas por vírgula, no lugar do `*`.', '`SELECT nome, email FROM clientes;`'],
          solution: 'SELECT nome, email FROM clientes;',
          wrong: ['SELECT nome FROM clientes;'],
          checks: [{ kind: 'resultMatches', expectedSql: 'SELECT nome, email FROM clientes' }],
        },
        {
          id: 'm02-l2-s3',
          title: 'Dê apelidos',
          goal: 'Mostre `nome` com o apelido `cliente` e `email` com o apelido `contato`.',
          hints: ['`coluna AS apelido`', '`SELECT nome AS cliente, email AS contato FROM clientes;`'],
          solution: 'SELECT nome AS cliente, email AS contato FROM clientes;',
          wrong: ['SELECT nome, email FROM clientes;'],
          checks: [{ kind: 'resultMatches', expectedSql: 'SELECT nome AS cliente, email AS contato FROM clientes' }],
        },
      ],
    },
    {
      id: 'm02-l3',
      title: 'WHERE: filtrando linhas',
      summary: 'Igualdade, AND/OR, IS NOT NULL e LIKE.',
      theory: theoryWhere,
      steps: [
        {
          id: 'm02-l3-s1',
          title: 'Busca por CPF',
          goal: 'Mostre `nome` e `email` da cliente cujo CPF é `333.333.333-33`.',
          hints: ['Filtre com `WHERE cpf = ...`.', "`SELECT nome, email FROM clientes WHERE cpf = '333.333.333-33';`"],
          solution: "SELECT nome, email FROM clientes WHERE cpf = '333.333.333-33';",
          wrong: ["SELECT nome, email FROM clientes WHERE cpf = '111.111.111-11';"],
          checks: [{ kind: 'resultMatches', expectedSql: "SELECT nome, email FROM clientes WHERE cpf = '333.333.333-33'" }],
        },
        {
          id: 'm02-l3-s2',
          title: 'Duas condições juntas',
          goal: 'Mostre o `nome` dos clientes que **nasceram a partir de 1990-01-01** **e** têm **telefone cadastrado**.',
          hints: [
            'Duas condições que precisam valer ao mesmo tempo: `AND`.',
            'Para "tem telefone", lembre da pegadinha do NULL: `telefone IS NOT NULL`.',
            "`WHERE data_nascimento >= '1990-01-01' AND telefone IS NOT NULL`",
          ],
          solution: "SELECT nome FROM clientes\nWHERE data_nascimento >= '1990-01-01' AND telefone IS NOT NULL;",
          wrong: ["SELECT nome FROM clientes WHERE data_nascimento >= '1990-01-01' OR telefone IS NOT NULL;"],
          checks: [
            {
              kind: 'resultMatches',
              expectedSql: "SELECT nome FROM clientes WHERE data_nascimento >= '1990-01-01' AND telefone IS NOT NULL",
            },
          ],
        },
        {
          id: 'm02-l3-s3',
          title: 'Procurando por padrão',
          goal: 'Mostre o `nome` dos clientes cujo nome **começa com `C` ou com `D`**.',
          hints: [
            '`LIKE \'C%\'` pega textos que começam com C.',
            'Junte duas condições `LIKE` com `OR`.',
            "`WHERE nome LIKE 'C%' OR nome LIKE 'D%'`",
          ],
          solution: "SELECT nome FROM clientes WHERE nome LIKE 'C%' OR nome LIKE 'D%';",
          wrong: ["SELECT nome FROM clientes WHERE nome LIKE 'C%';"],
          checks: [{ kind: 'resultMatches', expectedSql: "SELECT nome FROM clientes WHERE nome LIKE 'C%' OR nome LIKE 'D%'" }],
        },
      ],
    },
    {
      id: 'm02-l4',
      title: 'ORDER BY e LIMIT',
      summary: 'Ordenar o resultado e paginar.',
      theory: theoryOrder,
      steps: [
        {
          id: 'm02-l4-s1',
          title: 'De Z a A',
          goal: 'Liste o `nome` dos clientes em **ordem alfabética inversa** (Z → A).',
          hints: ['`ORDER BY nome` ordena de A a Z.', 'Acrescente `DESC` para inverter.'],
          solution: 'SELECT nome FROM clientes ORDER BY nome DESC;',
          wrong: ['SELECT nome FROM clientes ORDER BY nome;'],
          checks: [{ kind: 'resultMatches', expectedSql: 'SELECT nome FROM clientes ORDER BY nome DESC', ordered: true }],
        },
        {
          id: 'm02-l4-s2',
          title: 'Os dois últimos',
          goal: 'Liste o `nome` dos **2 clientes que vêm por último** no alfabeto, começando pelo último (ordem Z → A).',
          hints: [
            'Ordene do Z ao A e depois limite o resultado.',
            '`ORDER BY nome DESC LIMIT ...`',
          ],
          solution: 'SELECT nome FROM clientes ORDER BY nome DESC LIMIT 2;',
          // Sem ORDER BY o banco devolve na ordem de inserção (Ana, Bruno): precisa ser rejeitado.
          wrong: ['SELECT nome FROM clientes LIMIT 2;', 'SELECT nome FROM clientes ORDER BY nome LIMIT 2;'],
          checks: [
            { kind: 'resultMatches', expectedSql: 'SELECT nome FROM clientes ORDER BY nome DESC LIMIT 2', ordered: true },
          ],
        },
        {
          id: 'm02-l4-s3',
          title: 'Página 2',
          goal: 'Imagine páginas de **2 clientes**. Mostre a **página 2** (nomes em ordem alfabética).',
          hints: ['A página 2 pula os 2 primeiros: `OFFSET 2`.', '`ORDER BY nome LIMIT 2 OFFSET 2`'],
          solution: 'SELECT nome FROM clientes ORDER BY nome LIMIT 2 OFFSET 2;',
          wrong: ['SELECT nome FROM clientes ORDER BY nome LIMIT 2;'],
          checks: [
            { kind: 'resultMatches', expectedSql: 'SELECT nome FROM clientes ORDER BY nome LIMIT 2 OFFSET 2', ordered: true },
          ],
        },
      ],
    },
    {
      id: 'm02-l5',
      title: 'UPDATE: corrigindo dados',
      summary: 'Mudar linhas existentes e nunca esquecer o WHERE.',
      theory: theoryUpdate,
      steps: [
        {
          id: 'm02-l5-s1',
          title: 'Novo email da Ana',
          goal: 'A Ana Souza trocou de email: o novo é `ana.souza@email.com`. Atualize **só** a linha dela.',
          hints: [
            'Estrutura: `UPDATE tabela SET coluna = valor WHERE ...`',
            "Para achar a Ana use o CPF dela: `WHERE cpf = '111.111.111-11'`.",
            "`UPDATE clientes SET email = 'ana.souza@email.com' WHERE cpf = '111.111.111-11';`",
          ],
          solution: "UPDATE clientes SET email = 'ana.souza@email.com' WHERE cpf = '111.111.111-11';",
          wrong: ["UPDATE clientes SET email = 'ana.souza@email.com';"],
          checks: [
            { kind: 'sqlMatches', pattern: 'update[\\s\\S]*where', label: 'Usou WHERE' },
            {
              kind: 'sqlTrue',
              label: 'A Ana tem o novo email',
              sql: "SELECT count(*) = 1 FROM clientes WHERE nome = 'Ana Souza' AND email = 'ana.souza@email.com'",
              message: 'A linha da Ana não está com o novo email.',
            },
            { kind: 'rowCount', table: 'clientes', where: "email = 'ana.souza@email.com'", equals: 1 },
          ],
        },
        {
          id: 'm02-l5-s2',
          title: 'Duas colunas de uma vez',
          goal: 'Diego Rocha informou o telefone `(31) 96666-0004` e corrigiu a data de nascimento para `2001-03-09`. Atualize as **duas colunas num só comando**, apenas para ele.',
          hints: ['No `SET`, separe as colunas por vírgula.', "`SET telefone = '...', data_nascimento = '...'` e `WHERE cpf = '444.444.444-44'`"],
          solution:
            "UPDATE clientes\nSET telefone = '(31) 96666-0004', data_nascimento = '2001-03-09'\nWHERE cpf = '444.444.444-44';",
          wrong: ["UPDATE clientes SET telefone = '(31) 96666-0004', data_nascimento = '2001-03-09';"],
          checks: [
            {
              kind: 'sqlTrue',
              label: 'Diego está com telefone e data corretos',
              sql: "SELECT count(*) = 1 FROM clientes WHERE nome = 'Diego Rocha' AND telefone = '(31) 96666-0004' AND data_nascimento = '2001-03-09'",
              message: 'Os dados do Diego ainda não estão como pedido.',
            },
            { kind: 'rowCount', table: 'clientes', where: "telefone = '(31) 96666-0004'", equals: 1 },
          ],
        },
      ],
    },
    {
      id: 'm02-l6',
      title: 'DELETE: removendo linhas',
      summary: 'Apagar com segurança.',
      theory: theoryDelete,
      steps: [
        {
          id: 'm02-l6-s1',
          title: 'Um cliente de teste',
          goal: 'Para treinar, cadastre o cliente `Teste Teste` (email `teste@email.com`, CPF `000.000.000-00`).',
          hints: ['É um `INSERT` simples, como o da Ana.', "`INSERT INTO clientes (nome, email, cpf) VALUES ('Teste Teste', 'teste@email.com', '000.000.000-00');`"],
          solution: "INSERT INTO clientes (nome, email, cpf)\nVALUES ('Teste Teste', 'teste@email.com', '000.000.000-00');",
          checks: [
            { kind: 'rowCount', table: 'clientes', equals: 6 },
            { kind: 'rowCount', table: 'clientes', where: "email = 'teste@email.com'", equals: 1 },
          ],
        },
        {
          id: 'm02-l6-s2',
          title: 'Apague só o teste',
          goal: 'Apague o cliente de teste **sem encostar nos outros**.',
          context: 'Antes de apagar, um `SELECT` com o mesmo filtro confirma que é a linha certa.',
          hints: ['`DELETE FROM clientes WHERE ...`', "`DELETE FROM clientes WHERE email = 'teste@email.com';`"],
          solution: "DELETE FROM clientes WHERE email = 'teste@email.com';",
          wrong: ['DELETE FROM clientes;'],
          checks: [
            { kind: 'sqlMatches', pattern: 'delete\\s+from\\s+clientes[\\s\\S]*where', label: 'Usou WHERE' },
            { kind: 'rowCount', table: 'clientes', where: "email = 'teste@email.com'", equals: 0 },
            { kind: 'rowCount', table: 'clientes', equals: 5 },
          ],
        },
      ],
    },
    {
      id: 'm02-boss',
      title: 'Chefão: manutenção do cadastro',
      summary: 'UPDATE, DELETE e SELECT num só pedido.',
      boss: true,
      theory: `# 👹 Chefão do módulo 2

Chegou um pedido do atendimento com **três tarefas**. Resolva-as, **sem WHERE esquecido**: um deslize aqui apaga ou muda a tabela inteira, e o banco não vai perguntar nada.

Se errar, o botão **Reiniciar passo** devolve o banco ao início do desafio.`,
      steps: [
        {
          id: 'm02-boss-s1',
          title: 'Cadastro em dia',
          xp: BOSS_STEP_XP,
          goal: `1. **Carla Mendes** (CPF \`333.333.333-33\`) casou e agora se chama **Carla Mendes Silva**, com o email \`carla.silva@email.com\`.
2. **Diego Rocha** (CPF \`444.444.444-44\`) pediu para sair: **remova** o cadastro dele.
3. Por fim, liste \`nome\` e \`email\` dos clientes que restaram, **em ordem alfabética de nome**.`,
          hints: [
            'São três comandos: um `UPDATE`, um `DELETE` e um `SELECT`, nessa ordem.',
            'Use o **CPF** no `WHERE` do `UPDATE` e do `DELETE`: ele identifica a pessoa sem ambiguidade.',
            "`UPDATE clientes SET nome = '...', email = '...' WHERE cpf = '333.333.333-33';`",
          ],
          solution: `UPDATE clientes SET nome = 'Carla Mendes Silva', email = 'carla.silva@email.com'
WHERE cpf = '333.333.333-33';
DELETE FROM clientes WHERE cpf = '444.444.444-44';
SELECT nome, email FROM clientes ORDER BY nome;`,
          wrong: [
            `UPDATE clientes SET nome = 'Carla Mendes Silva', email = 'carla.silva@email.com';
DELETE FROM clientes WHERE cpf = '444.444.444-44';
SELECT nome, email FROM clientes ORDER BY nome;`,
          ],
          checks: [
            {
              kind: 'sqlTrue',
              label: 'Só a Carla mudou; Ana, Bruno e Elisa continuam intactos',
              sql: `SELECT count(*) = 4 FROM clientes WHERE (cpf, nome, email) IN (
                ('111.111.111-11', 'Ana Souza', 'ana.souza@email.com'),
                ('222.222.222-22', 'Bruno Lima', 'bruno@email.com'),
                ('333.333.333-33', 'Carla Mendes Silva', 'carla.silva@email.com'),
                ('555.555.555-55', 'Elisa Prado', 'elisa@email.com'))`,
              message: 'A Carla não está com o nome e o email novos, ou outras clientes foram alteradas sem querer.',
            },
            { kind: 'rowCount', table: 'clientes', where: "cpf = '444.444.444-44'", equals: 0 },
            { kind: 'rowCount', table: 'clientes', equals: 4 },
            { kind: 'resultMatches', expectedSql: 'SELECT nome, email FROM clientes ORDER BY nome', ordered: true },
          ],
        },
      ],
    },
  ],
}

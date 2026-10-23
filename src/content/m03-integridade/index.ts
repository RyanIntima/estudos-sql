import type { Module } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import { catalog, checkDefinition } from '../helpers'
import theoryUnique from './theory/01-unique.md?raw'
import theoryCheck from './theory/02-check.md?raw'
import theoryFk from './theory/03-chave-estrangeira.md?raw'
import theoryRegras from './theory/04-regras-nos-produtos.md?raw'

export const m03: Module = {
  id: 'm03',
  title: 'Integridade: o banco se defende sozinho',
  subtitle: 'UNIQUE, CHECK e chaves estrangeiras: nascem categorias e produtos',
  emoji: '🛡️',
  lessons: [
    {
      id: 'm03-l1',
      title: 'Valores únicos: UNIQUE',
      summary: 'Impedir email e CPF repetidos, e ler o erro quando alguém tenta.',
      theory: theoryUnique,
      steps: [
        {
          id: 'm03-l1-s1',
          title: 'Email único',
          goal: 'Dois clientes não podem ter o mesmo email. Acrescente a `clientes` uma regra `UNIQUE` sobre `email`, com o nome `uq_clientes_email`.',
          hints: [
            'Use `ALTER TABLE clientes ADD CONSTRAINT nome UNIQUE (coluna)`.',
            '`ALTER TABLE clientes ADD CONSTRAINT uq_clientes_email UNIQUE (email);`',
          ],
          solution: 'ALTER TABLE clientes ADD CONSTRAINT uq_clientes_email UNIQUE (email);',
          wrong: ['ALTER TABLE clientes ADD CONSTRAINT uq_clientes_nome UNIQUE (nome);'],
          checks: [{ kind: 'constraint', table: 'clientes', constraint: 'unique', columns: ['email'] }],
        },
        {
          id: 'm03-l1-s2',
          title: 'CPF único',
          goal: 'O mesmo vale para o **CPF**: uma pessoa, um cadastro. Acrescente uma regra `UNIQUE` sobre `cpf`.',
          hints: ['Mesmo comando do passo anterior, trocando a coluna.', '`ALTER TABLE clientes ADD CONSTRAINT uq_clientes_cpf UNIQUE (cpf);`'],
          solution: 'ALTER TABLE clientes ADD CONSTRAINT uq_clientes_cpf UNIQUE (cpf);',
          checks: [{ kind: 'constraint', table: 'clientes', constraint: 'unique', columns: ['cpf'] }],
        },
        {
          id: 'm03-l1-s3',
          title: 'Tentando repetir um email',
          goal: 'Tente cadastrar `Bruno Clone` com o email `bruno@email.com` (que já existe) e o CPF `999.999.999-99`. Leia o erro: **ele é o objetivo**.',
          context: 'O banco recusa o `INSERT` inteiro. Nenhum dado ruim entra.',
          hints: ['É um `INSERT` comum, só que com um email que já está na tabela.', "`INSERT INTO clientes (nome, email, cpf) VALUES ('Bruno Clone', 'bruno@email.com', '999.999.999-99');`"],
          solution: "INSERT INTO clientes (nome, email, cpf) VALUES ('Bruno Clone', 'bruno@email.com', '999.999.999-99');",
          expectError: true,
          wrong: ["INSERT INTO clientes (nome, email, cpf) VALUES ('Bruno Clone', 'clone@email.com', '999.999.999-99');"],
          checks: [
            { kind: 'lastRunError', code: '23505', label: 'O banco recusou: valor repetido em coluna única (23505)' },
            { kind: 'rowCount', table: 'clientes', equals: 4 },
          ],
        },
      ],
    },
    {
      id: 'm03-l2',
      title: 'Regras de negócio: CHECK',
      summary: 'Fazer o banco recusar valores que não fazem sentido.',
      theory: theoryCheck,
      steps: [
        {
          id: 'm03-l2-s1',
          title: 'Ninguém nasce no futuro',
          goal: 'Crie em `clientes` uma regra `CHECK` chamada `ck_clientes_nascimento`: `data_nascimento` não pode ser **depois de hoje** (use `CURRENT_DATE`).',
          hints: [
            'Dentro do `CHECK (...)` vai uma condição, como no `WHERE`.',
            '"Não pode ser depois de hoje" é o mesmo que "menor ou igual a hoje": `<=`.',
            '`ALTER TABLE clientes ADD CONSTRAINT ck_clientes_nascimento CHECK (data_nascimento <= CURRENT_DATE);`',
          ],
          solution: 'ALTER TABLE clientes ADD CONSTRAINT ck_clientes_nascimento\n  CHECK (data_nascimento <= CURRENT_DATE);',
          wrong: ["ALTER TABLE clientes ADD CONSTRAINT ck_clientes_nascimento CHECK (data_nascimento <= '2100-01-01');"],
          checks: [
            { kind: 'constraint', table: 'clientes', constraint: 'check', columns: ['data_nascimento'] },
            checkDefinition('clientes', 'current_date', 'A regra compara com a data de hoje (CURRENT_DATE)'),
          ],
        },
        {
          id: 'm03-l2-s2',
          title: 'Um viajante do tempo',
          goal: 'Tente cadastrar `Viajante` (email `v@email.com`, CPF `888.888.888-88`) nascido em `2999-01-01`. O banco deve recusar.',
          hints: ['Inclua `data_nascimento` no `INSERT`, com uma data no futuro.', "`INSERT INTO clientes (nome, email, cpf, data_nascimento) VALUES ('Viajante', 'v@email.com', '888.888.888-88', '2999-01-01');`"],
          solution: "INSERT INTO clientes (nome, email, cpf, data_nascimento)\nVALUES ('Viajante', 'v@email.com', '888.888.888-88', '2999-01-01');",
          expectError: true,
          wrong: ["INSERT INTO clientes (nome, email, cpf, data_nascimento) VALUES ('Viajante', 'v@email.com', '888.888.888-88', '1999-01-01');"],
          checks: [
            { kind: 'lastRunError', code: '23514', label: 'O banco recusou: regra CHECK violada (23514)' },
            { kind: 'rowCount', table: 'clientes', equals: 4 },
          ],
        },
      ],
    },
    {
      id: 'm03-l3',
      title: 'Chave estrangeira: ligando tabelas',
      summary: 'Categorias e produtos: a relação 1:N do catálogo.',
      theory: theoryFk,
      steps: [
        {
          id: 'm03-l3-s1',
          title: 'A tabela pai: categorias',
          goal: 'Crie `categorias` com: `id` (inteiro, **chave primária**, gerado automaticamente com `IDENTITY`) e `nome` (texto de até 80 caracteres, **obrigatório** e **único**).',
          context: 'Criamos primeiro o **pai**: os produtos vão apontar para ela.',
          starter: '-- Crie a tabela categorias\n',
          hints: [
            '`id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY`',
            '`nome VARCHAR(80) NOT NULL UNIQUE`: as regras podem vir logo depois do tipo.',
          ],
          solution: 'CREATE TABLE categorias (\n  id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  nome VARCHAR(80) NOT NULL UNIQUE\n);',
          wrong: ['CREATE TABLE categorias (id INTEGER PRIMARY KEY, nome VARCHAR(80) NOT NULL UNIQUE);'],
          checks: [
            { kind: 'tableExists', table: 'categorias' },
            { kind: 'column', table: 'categorias', name: 'id', primaryKey: true, autoGenerated: true },
            { kind: 'column', table: 'categorias', name: 'nome', type: 'character varying(80)', nullable: false, unique: true },
          ],
        },
        {
          id: 'm03-l3-s2',
          title: 'Três categorias',
          goal: 'Cadastre, em **um único `INSERT`**, as categorias `Camisetas`, `Calçados` e `Acessórios`.',
          hints: ['Só a coluna `nome` precisa ser informada: o `id` se gera sozinho.', "`INSERT INTO categorias (nome) VALUES ('Camisetas'), ('Calçados'), ('Acessórios');`"],
          solution: "INSERT INTO categorias (nome) VALUES ('Camisetas'), ('Calçados'), ('Acessórios');",
          checks: [
            { kind: 'rowCount', table: 'categorias', equals: 3 },
            catalog('As três categorias estão cadastradas', "SELECT count(*) = 3 FROM categorias WHERE nome IN ('Camisetas', 'Calçados', 'Acessórios')", 'Confira a grafia dos nomes, com acentos.'),
          ],
        },
        {
          id: 'm03-l3-s3',
          title: 'A tabela filha: produtos',
          goal: `Crie \`produtos\` com:

- \`id\`: inteiro, chave primária, gerado automaticamente;
- \`categoria_id\`: inteiro **obrigatório**, **chave estrangeira** para \`categorias(id)\`;
- \`nome\`: texto de até 120 caracteres, obrigatório;
- \`preco\`: decimal exato com 10 dígitos e 2 casas, obrigatório.`,
          starter: '-- Crie a tabela produtos\n',
          hints: [
            '`categoria_id INTEGER NOT NULL REFERENCES categorias (id)`',
            'Dinheiro é `NUMERIC(10,2)`.',
          ],
          solution:
            'CREATE TABLE produtos (\n  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  categoria_id INTEGER NOT NULL REFERENCES categorias (id),\n  nome         VARCHAR(120) NOT NULL,\n  preco        NUMERIC(10,2) NOT NULL\n);',
          wrong: ['CREATE TABLE produtos (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, categoria_id INTEGER NOT NULL, nome VARCHAR(120) NOT NULL, preco NUMERIC(10,2) NOT NULL);'],
          checks: [
            { kind: 'tableExists', table: 'produtos' },
            { kind: 'column', table: 'produtos', name: 'id', primaryKey: true, autoGenerated: true },
            { kind: 'column', table: 'produtos', name: 'categoria_id', type: 'integer', nullable: false },
            { kind: 'constraint', table: 'produtos', constraint: 'foreign', columns: ['categoria_id'], refTable: 'categorias' },
            { kind: 'column', table: 'produtos', name: 'nome', type: 'character varying(120)', nullable: false },
            { kind: 'column', table: 'produtos', name: 'preco', type: 'numeric(10,2)', nullable: false },
          ],
        },
        {
          id: 'm03-l3-s4',
          title: 'Dois produtos, sem decorar ids',
          goal: 'Cadastre na categoria `Camisetas`: `Camiseta Básica` por `49.90` e `Camiseta Estampada` por `79.90`. **Não digite o `id` da categoria**: busque-o pelo nome com `INSERT ... SELECT`.',
          context: 'É assim que se faz na prática: o `id` pode mudar de banco para banco, o nome não.',
          hints: [
            'O `SELECT` devolve o `id` da categoria e os valores fixos: `SELECT id, \'Camiseta Básica\', 49.90 FROM categorias WHERE nome = \'Camisetas\'`',
            'Faça um `INSERT ... SELECT` para cada produto.',
          ],
          solution: `INSERT INTO produtos (categoria_id, nome, preco)
SELECT id, 'Camiseta Básica', 49.90 FROM categorias WHERE nome = 'Camisetas';
INSERT INTO produtos (categoria_id, nome, preco)
SELECT id, 'Camiseta Estampada', 79.90 FROM categorias WHERE nome = 'Camisetas';`,
          wrong: [
            `INSERT INTO produtos (categoria_id, nome, preco)
SELECT id, 'Camiseta Básica', 49.90 FROM categorias WHERE nome = 'Calçados';
INSERT INTO produtos (categoria_id, nome, preco)
SELECT id, 'Camiseta Estampada', 79.90 FROM categorias WHERE nome = 'Calçados';`,
          ],
          checks: [
            { kind: 'rowCount', table: 'produtos', equals: 2 },
            {
              kind: 'sqlTrue',
              label: 'Os dois produtos estão em Camisetas, com os preços certos',
              sql: `SELECT count(*) = 2 FROM produtos p JOIN categorias c ON c.id = p.categoria_id
                    WHERE c.nome = 'Camisetas'
                      AND ((p.nome = 'Camiseta Básica' AND p.preco = 49.90) OR (p.nome = 'Camiseta Estampada' AND p.preco = 79.90))`,
              message: 'Confira a categoria, os nomes e os preços.',
            },
          ],
        },
        {
          id: 'm03-l3-s5',
          title: 'Uma categoria que não existe',
          goal: 'Tente cadastrar o produto `Produto Fantasma` (`10.00`) apontando para a categoria de `id` **999999**. O banco deve recusar.',
          hints: ['Dessa vez informe o `categoria_id` direto no `VALUES`.', "`INSERT INTO produtos (categoria_id, nome, preco) VALUES (999999, 'Produto Fantasma', 10.00);`"],
          solution: "INSERT INTO produtos (categoria_id, nome, preco) VALUES (999999, 'Produto Fantasma', 10.00);",
          expectError: true,
          wrong: ["INSERT INTO produtos (categoria_id, nome, preco) SELECT id, 'Produto Real', 10.00 FROM categorias WHERE nome = 'Calçados';"],
          checks: [
            { kind: 'lastRunError', code: '23503', label: 'O banco recusou: chave estrangeira violada (23503)' },
            { kind: 'rowCount', table: 'produtos', equals: 2 },
          ],
        },
      ],
    },
    {
      id: 'm03-l4',
      title: 'Protegendo o catálogo: CHECK e ON DELETE',
      summary: 'Preço positivo, estoque nunca negativo e o que fazer ao apagar uma categoria.',
      theory: theoryRegras,
      steps: [
        {
          id: 'm03-l4-s1',
          title: 'Preço sempre positivo',
          goal: 'Crie em `produtos` a regra `ck_produtos_preco`: o `preco` precisa ser **maior que zero**.',
          hints: ['`CHECK (preco > 0)`', '`ALTER TABLE produtos ADD CONSTRAINT ck_produtos_preco CHECK (preco > 0);`'],
          solution: 'ALTER TABLE produtos ADD CONSTRAINT ck_produtos_preco CHECK (preco > 0);',
          wrong: ['ALTER TABLE produtos ADD CONSTRAINT ck_produtos_preco CHECK (preco >= 0);'],
          checks: [
            { kind: 'constraint', table: 'produtos', constraint: 'check', columns: ['preco'] },
            // O Postgres guarda `preco > 0` como `preco > (0)::numeric`.
            checkDefinition('produtos', 'preco > \\(?0\\)?', 'A regra exige preço maior que zero'),
          ],
        },
        {
          id: 'm03-l4-s2',
          title: 'Controle de estoque',
          goal: 'Acrescente a `produtos` a coluna `estoque`: inteiro, **obrigatório**, valor padrão **0**, e que **nunca seja negativo**, tudo na própria criação da coluna.',
          hints: ['`ADD COLUMN estoque INTEGER ...` seguido das regras, na ordem que quiser.', '`ALTER TABLE produtos ADD COLUMN estoque INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0);`'],
          solution: 'ALTER TABLE produtos ADD COLUMN estoque INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0);',
          wrong: ['ALTER TABLE produtos ADD COLUMN estoque INTEGER NOT NULL DEFAULT 0;'],
          checks: [
            { kind: 'column', table: 'produtos', name: 'estoque', type: 'integer', nullable: false, hasDefault: true },
            { kind: 'constraint', table: 'produtos', constraint: 'check', columns: ['estoque'] },
          ],
        },
        {
          id: 'm03-l4-s3',
          title: 'Brinde de graça?',
          goal: 'Tente cadastrar o produto `Brinde` com preço **0** na categoria `Acessórios` (use `INSERT ... SELECT`). O banco deve recusar.',
          hints: ['O `SELECT` busca a categoria pelo nome e devolve o preço 0.', "`INSERT INTO produtos (categoria_id, nome, preco) SELECT id, 'Brinde', 0 FROM categorias WHERE nome = 'Acessórios';`"],
          solution: "INSERT INTO produtos (categoria_id, nome, preco)\nSELECT id, 'Brinde', 0 FROM categorias WHERE nome = 'Acessórios';",
          expectError: true,
          wrong: ["INSERT INTO produtos (categoria_id, nome, preco) SELECT id, 'Brinde', 5 FROM categorias WHERE nome = 'Acessórios';"],
          checks: [
            { kind: 'lastRunError', code: '23514', label: 'O banco recusou: regra CHECK violada (23514)' },
            { kind: 'rowCount', table: 'produtos', equals: 2 },
          ],
        },
        {
          id: 'm03-l4-s4',
          title: 'Apagando uma categoria com produtos',
          goal: 'Tente apagar a categoria `Camisetas`. Ela tem produtos: leia o que o banco responde.',
          hints: ['É um `DELETE` com `WHERE nome = ...`.', "`DELETE FROM categorias WHERE nome = 'Camisetas';`"],
          solution: "DELETE FROM categorias WHERE nome = 'Camisetas';",
          expectError: true,
          wrong: ["DELETE FROM categorias WHERE nome = 'Acessórios';"],
          checks: [
            { kind: 'lastRunError', code: '23503', label: 'O banco recusou: ainda há produtos nessa categoria (23503)' },
            { kind: 'rowCount', table: 'categorias', equals: 3 },
          ],
        },
        {
          id: 'm03-l4-s5',
          title: 'Deixando a regra explícita',
          goal: 'O comportamento atual (`NO ACTION`) funciona, mas vale deixar a decisão **escrita**: recrie a chave estrangeira `produtos_categoria_id_fkey` com `ON DELETE RESTRICT`, **num único comando** `ALTER TABLE`.',
          context: 'O nome `produtos_categoria_id_fkey` é o que o Postgres escolheu quando você criou a tabela.',
          hints: [
            'Um `ALTER TABLE` pode ter duas ações separadas por vírgula: `DROP CONSTRAINT ...` e `ADD CONSTRAINT ...`.',
            'Ao recriar, repita `FOREIGN KEY (categoria_id) REFERENCES categorias (id)` e acrescente `ON DELETE RESTRICT`.',
          ],
          solution: `ALTER TABLE produtos
  DROP CONSTRAINT produtos_categoria_id_fkey,
  ADD CONSTRAINT produtos_categoria_id_fkey
      FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE RESTRICT;`,
          wrong: [
            `ALTER TABLE produtos
  DROP CONSTRAINT produtos_categoria_id_fkey,
  ADD CONSTRAINT produtos_categoria_id_fkey
      FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE CASCADE;`,
          ],
          checks: [{ kind: 'constraint', table: 'produtos', constraint: 'foreign', columns: ['categoria_id'], refTable: 'categorias', onDelete: 'RESTRICT' }],
        },
      ],
    },
    {
      id: 'm03-boss',
      title: 'Chefão: catálogo blindado',
      summary: 'SKU único e produtos ativos, só com requisitos de negócio.',
      boss: true,
      theory: `# 👹 Chefão do módulo 3

O time de logística pediu duas mudanças no catálogo. **Você decide** os tipos e as regras.

Pense em cada requisito: o dado é obrigatório? Pode repetir? Tem valor padrão? Lembre-se de que **já existem produtos cadastrados**.`,
      steps: [
        {
          id: 'm03-boss-s1',
          title: 'SKU e produto ativo',
          xp: BOSS_STEP_XP,
          goal: `1. Cada produto passa a ter um **SKU** (código de estoque) de até **20 caracteres**. Os produtos que já existem ainda não têm SKU, então ele é **opcional**, mas **quando existir não pode repetir** entre produtos.
2. Cada produto passa a ter o campo \`ativo\` (verdadeiro/falso): **sempre preenchido** e, se ninguém disser nada, o produto nasce **ativo**. Os que já existem devem ficar ativos.`,
          hints: [
            'São duas colunas novas em `produtos`: `sku` e `ativo`.',
            'Opcional = sem `NOT NULL`. Não repetir = `UNIQUE`. Sempre preenchido com padrão = `NOT NULL DEFAULT ...`.',
            '`ALTER TABLE produtos ADD COLUMN sku VARCHAR(20) UNIQUE;`',
          ],
          solution: 'ALTER TABLE produtos ADD COLUMN sku VARCHAR(20) UNIQUE;\nALTER TABLE produtos ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT TRUE;',
          wrong: [
            'ALTER TABLE produtos ADD COLUMN sku VARCHAR(20);\nALTER TABLE produtos ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT TRUE;',
            'ALTER TABLE produtos ADD COLUMN sku VARCHAR(20) UNIQUE;\nALTER TABLE produtos ADD COLUMN ativo BOOLEAN DEFAULT TRUE;',
            'ALTER TABLE produtos ADD COLUMN sku VARCHAR(20) UNIQUE;\nALTER TABLE produtos ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT FALSE;',
          ],
          checks: [
            { kind: 'column', table: 'produtos', name: 'sku', type: 'character varying(20)', nullable: true, unique: true },
            { kind: 'column', table: 'produtos', name: 'ativo', type: 'boolean', nullable: false, hasDefault: true },
            catalog('Os produtos que já existiam continuam ativos', 'SELECT bool_and(ativo) FROM produtos', 'Os produtos existentes precisam ficar com ativo = verdadeiro.'),
          ],
        },
      ],
    },
  ],
}

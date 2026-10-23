import type { Module } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import theoryCreate from './theory/01-create-table.md?raw'
import theoryTipos from './theory/02-tipos-de-dados.md?raw'
import theoryPk from './theory/03-chave-primaria.md?raw'
import theoryDefault from './theory/04-default-e-drop.md?raw'

export const m01: Module = {
  id: 'm01',
  title: 'Fundação: estrutura das tabelas',
  subtitle: 'CREATE, ALTER e DROP: nasce a tabela clientes',
  emoji: '🏗️',
  lessons: [
    {
      id: 'm01-l1',
      title: 'Criando sua primeira tabela',
      summary: 'CREATE TABLE e a primeira consulta a uma tabela vazia.',
      theory: theoryCreate,
      steps: [
        {
          id: 'm01-l1-s1',
          title: 'Crie a tabela clientes',
          goal: 'Crie a tabela `clientes` com duas colunas: `id` (número inteiro, `INTEGER`) e `nome` (texto de até 100 caracteres, `VARCHAR(100)`).',
          context: 'É a primeira peça do LojaDB: quem compra na loja.',
          starter: '-- Crie a tabela clientes\n',
          hints: [
            'O comando começa com `CREATE TABLE clientes (`.',
            'Cada coluna é `nome TIPO`, separadas por vírgula.',
            '`CREATE TABLE clientes (id INTEGER, nome VARCHAR(100));`',
          ],
          solution: 'CREATE TABLE clientes (\n  id   INTEGER,\n  nome VARCHAR(100)\n);',
          wrong: ['CREATE TABLE clientes (id INTEGER, nome TEXT);', 'CREATE TABLE cliente (id INTEGER, nome VARCHAR(100));'],
          checks: [
            { kind: 'tableExists', table: 'clientes' },
            { kind: 'column', table: 'clientes', name: 'id', type: 'integer' },
            { kind: 'column', table: 'clientes', name: 'nome', type: 'character varying(100)' },
          ],
        },
        {
          id: 'm01-l1-s2',
          title: 'Espie a tabela vazia',
          goal: 'Mostre **todas as colunas** de `clientes` com `SELECT * FROM clientes;`. A tabela existe, mas ainda não tem nenhuma linha.',
          hints: ['`*` significa "todas as colunas".', '`SELECT * FROM clientes;`'],
          solution: 'SELECT * FROM clientes;',
          checks: [{ kind: 'resultMatches', expectedSql: 'SELECT * FROM clientes' }],
        },
      ],
    },
    {
      id: 'm01-l2',
      title: 'Tipos de dados',
      summary: 'Escolha o tipo certo e acrescente colunas com ALTER TABLE.',
      theory: theoryTipos,
      steps: [
        {
          id: 'm01-l2-s1',
          title: 'Coluna email',
          goal: 'Acrescente a `clientes` a coluna `email`, texto de até **150** caracteres.',
          hints: ['Use `ALTER TABLE clientes ADD COLUMN ...`', '`ALTER TABLE clientes ADD COLUMN email VARCHAR(150);`'],
          solution: 'ALTER TABLE clientes ADD COLUMN email VARCHAR(150);',
          wrong: ['ALTER TABLE clientes ADD COLUMN email TEXT;'],
          checks: [{ kind: 'column', table: 'clientes', name: 'email', type: 'character varying(150)' }],
        },
        {
          id: 'm01-l2-s2',
          title: 'Coluna data_nascimento',
          goal: 'Acrescente a coluna `data_nascimento`, do tipo **data** (sem hora).',
          hints: ['O tipo para uma data sem hora é `DATE`.', '`ALTER TABLE clientes ADD COLUMN data_nascimento DATE;`'],
          solution: 'ALTER TABLE clientes ADD COLUMN data_nascimento DATE;',
          wrong: ['ALTER TABLE clientes ADD COLUMN data_nascimento TIMESTAMP;'],
          checks: [{ kind: 'column', table: 'clientes', name: 'data_nascimento', type: 'date' }],
        },
        {
          id: 'm01-l2-s3',
          title: 'Coluna criado_em',
          goal: 'Acrescente a coluna `criado_em`, que guardará **data e hora** do cadastro (`TIMESTAMP`).',
          hints: ['`TIMESTAMP` guarda data e hora.', '`ALTER TABLE clientes ADD COLUMN criado_em TIMESTAMP;`'],
          solution: 'ALTER TABLE clientes ADD COLUMN criado_em TIMESTAMP;',
          wrong: ['ALTER TABLE clientes ADD COLUMN criado_em DATE;'],
          checks: [{ kind: 'column', table: 'clientes', name: 'criado_em', type: 'timestamp without time zone' }],
        },
      ],
    },
    {
      id: 'm01-l3',
      title: 'Chave primária, NOT NULL e identity',
      summary: 'Identificar cada linha, exigir dados e gerar ids sozinho.',
      theory: theoryPk,
      steps: [
        {
          id: 'm01-l3-s1',
          title: 'A chave primária',
          goal: 'Torne `id` a **chave primária** de `clientes`.',
          hints: ['`ALTER TABLE clientes ADD PRIMARY KEY (...)`', '`ALTER TABLE clientes ADD PRIMARY KEY (id);`'],
          solution: 'ALTER TABLE clientes ADD PRIMARY KEY (id);',
          checks: [{ kind: 'constraint', table: 'clientes', constraint: 'primary', columns: ['id'] }],
        },
        {
          id: 'm01-l3-s2',
          title: 'Nome e email obrigatórios',
          goal: 'A loja não vive sem esses dados: torne `nome` e `email` **obrigatórios** (`NOT NULL`).',
          hints: [
            'Use `ALTER COLUMN ... SET NOT NULL`, uma vez para cada coluna.',
            '`ALTER TABLE clientes ALTER COLUMN nome SET NOT NULL;` e o mesmo para `email`.',
          ],
          solution: 'ALTER TABLE clientes ALTER COLUMN nome SET NOT NULL;\nALTER TABLE clientes ALTER COLUMN email SET NOT NULL;',
          wrong: ['ALTER TABLE clientes ALTER COLUMN nome SET NOT NULL;'],
          checks: [
            { kind: 'column', table: 'clientes', name: 'nome', nullable: false },
            { kind: 'column', table: 'clientes', name: 'email', nullable: false },
          ],
        },
        {
          id: 'm01-l3-s3',
          title: 'Ids automáticos',
          goal: 'Faça a coluna `id` **gerar o próprio número** (`GENERATED ALWAYS AS IDENTITY`).',
          hints: ['É um `ALTER COLUMN id ADD GENERATED ...`', '`ALTER TABLE clientes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;`'],
          solution: 'ALTER TABLE clientes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;',
          checks: [{ kind: 'column', table: 'clientes', name: 'id', primaryKey: true, autoGenerated: true }],
        },
      ],
    },
    {
      id: 'm01-l4',
      title: 'DEFAULT, renomear e apagar',
      summary: 'Valores padrão e como desfazer estruturas, com cuidado.',
      theory: theoryDefault,
      steps: [
        {
          id: 'm01-l4-s1',
          title: 'Data de cadastro automática',
          goal: 'Faça `criado_em` receber **a data e hora atuais** quando o cadastro não informar nada (`DEFAULT now()`).',
          hints: ['`ALTER COLUMN criado_em SET DEFAULT ...`', '`ALTER TABLE clientes ALTER COLUMN criado_em SET DEFAULT now();`'],
          solution: 'ALTER TABLE clientes ALTER COLUMN criado_em SET DEFAULT now();',
          checks: [{ kind: 'column', table: 'clientes', name: 'criado_em', hasDefault: true }],
        },
        {
          id: 'm01-l4-s2',
          title: 'Crie e apague um rascunho',
          goal: 'Em **um único script**, crie uma tabela `rascunho` (com uma coluna `id INTEGER`) e, logo depois, apague-a com `DROP TABLE`.',
          context: 'Treino seguro: o `DROP` é irreversível em produção.',
          hints: ['Dois comandos, separados por `;`.', '`CREATE TABLE rascunho (id INTEGER); DROP TABLE rascunho;`'],
          solution: 'CREATE TABLE rascunho (id INTEGER);\nDROP TABLE rascunho;',
          checks: [
            { kind: 'sqlMatches', pattern: 'create\\s+table\\s+rascunho', label: 'Criou a tabela rascunho' },
            { kind: 'sqlMatches', pattern: 'drop\\s+table\\s+(if\\s+exists\\s+)?rascunho', label: 'Apagou a tabela rascunho' },
            { kind: 'tableMissing', table: 'rascunho' },
          ],
        },
      ],
    },
    {
      id: 'm01-boss',
      title: 'Chefão: dados fiscais do cliente',
      summary: 'Traduza o pedido da loja em estrutura.',
      boss: true,
      theory: `# 👹 Chefão do módulo 1

Sem roteiro. O financeiro da loja fez um pedido e **você traduz em colunas**: nome, tipo e obrigatoriedade.

Releia as aulas sobre tipos e \`NOT NULL\` se precisar. Lembre-se: \`ALTER TABLE ... ADD COLUMN\`.`,
      steps: [
        {
          id: 'm01-boss-s1',
          title: 'CPF e telefone',
          xp: BOSS_STEP_XP,
          goal: 'Para emitir nota fiscal, a loja precisa guardar o **CPF** do cliente, sempre formatado (`000.000.000-00`, **14 caracteres**) e **obrigatório**. Também quer um **telefone** de contato, **opcional**, com no máximo **20 caracteres**.',
          hints: [
            'São duas colunas novas: `cpf` e `telefone`, ambas texto de tamanho limitado.',
            'Só o `cpf` leva `NOT NULL`. Pode ser na própria criação da coluna.',
            '`ALTER TABLE clientes ADD COLUMN cpf VARCHAR(14) NOT NULL;`',
          ],
          solution: 'ALTER TABLE clientes ADD COLUMN cpf VARCHAR(14) NOT NULL;\nALTER TABLE clientes ADD COLUMN telefone VARCHAR(20);',
          wrong: [
            'ALTER TABLE clientes ADD COLUMN cpf VARCHAR(14);\nALTER TABLE clientes ADD COLUMN telefone VARCHAR(20);',
            'ALTER TABLE clientes ADD COLUMN cpf VARCHAR(14) NOT NULL;\nALTER TABLE clientes ADD COLUMN telefone VARCHAR(20) NOT NULL;',
          ],
          checks: [
            { kind: 'column', table: 'clientes', name: 'cpf', type: 'character varying(14)', nullable: false },
            { kind: 'column', table: 'clientes', name: 'telefone', type: 'character varying(20)', nullable: true },
          ],
        },
      ],
    },
  ],
}

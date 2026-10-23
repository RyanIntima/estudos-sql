# 🧭 SQL Quest

Plataforma gamificada para aprender SQL e bancos relacionais **construindo um banco real**: o **LojaDB**, um e-commerce escrito por você, em código, aula após aula. Tudo roda no navegador, com **PostgreSQL de verdade** (via [PGlite](https://pglite.dev), WebAssembly), sem servidor e sem instalar banco.

## Como funciona

- **Teoria curta → prática imediata.** Cada aula tem uma teoria objetiva e logo em seguida desafios (passos) para resolver no editor.
- **Um único projeto.** Todos os passos constroem o mesmo banco. O estado esperado no início de cada aula é derivado das soluções das aulas anteriores; se o seu banco divergir, o app oferece sincronizar com o gabarito.
- **Você vê o banco ganhando forma.** Durante a prática há abas com:
  - **Diagrama** ER (tabelas, chaves, views, triggers) com destaque do que acabou de mudar;
  - **Dados** de cada tabela, com linhas inseridas/alteradas/apagadas destacadas;
  - **Execução**: a ordem lógica de uma consulta (FROM → JOIN → WHERE → GROUP BY → … ) com a contagem de linhas em cada etapa;
  - **Plano**: a árvore do `EXPLAIN (ANALYZE)` com alertas didáticos (leitura sequencial, uso de índice);
  - **Impacto**: um resumo em português do que o seu comando fez.
- **Explicação linha a linha.** Cada trecho do código que você escreve é explicado (a partir da AST do parser oficial do Postgres), e os erros do Postgres são traduzidos com a causa provável.
- **Gamificação.** XP, níveis, 1–3 estrelas por aula, chefões ao fim dos módulos, conquistas e sequência diária. Dicas custam XP.
- **Playground** à parte, para experimentar sem afetar o projeto.
- **Projeto**: visão consolidada do LojaDB, exportação em `lojadb.sql` (DDL + dados) e do diagrama em PNG.

## Currículo (13 módulos, do zero ao avançado)

| Mód. | Tema |
|---|---|
| 0 | Fundamentos: banco relacional, tabela, linha, coluna |
| 1 | DDL: CREATE/ALTER/DROP, tipos, PK, NOT NULL, DEFAULT |
| 2 | DML: INSERT, SELECT, WHERE, ORDER BY, LIMIT, UPDATE, DELETE |
| 3 | Integridade: UNIQUE, CHECK, FOREIGN KEY |
| 4 | Modelagem: 1:1, 1:N, N:N, normalização |
| 5 | JOINs |
| 6 | Agregação: GROUP BY, HAVING |
| 7 | Subqueries, CTEs (inclusive recursivas), UNION, CASE |
| 8 | Window functions |
| 9 | Transações e ACID |
| 10 | Views, funções PL/pgSQL, triggers |
| 11 | Índices e performance (EXPLAIN) |
| 12 | Schemas, papéis e permissões, chefão final |

## Rodando

Requer Node.js 20+.

```bash
npm install
npm run dev      # http://localhost:5173
```

Outros comandos:

```bash
npm test         # testes (vitest): motor, explicador, jogo e a integridade de TODO o conteúdo
npm run lint     # oxlint
npm run build    # tsc -b + build de produção em dist/
npm run preview  # serve o build
```

O progresso fica no `localStorage`; o LojaDB e o Playground ficam no IndexedDB do navegador.

## Stack

React 19 · Vite · TypeScript · Tailwind · Zustand · CodeMirror 6 · React Flow + ELK · PGlite (Postgres 18 em WASM) · libpg-query (parser do Postgres em WASM) · Vitest.

## Estrutura

```
src/
  db/        motor (PGlite), introspecção do catálogo, diffs de schema/dados, tradutor de erros, exportação SQL
  explain/   parser, explicador por trecho, etapas de execução, plano de execução
  lessons/   tipos, registro (checkpoints derivados), validação dos checks
  content/   módulos m00…m12 (index.ts + teoria em .md)
  game/      XP, níveis, estrelas, conquistas, store persistido
  ui/        páginas (Mapa, Aula, Playground, Projeto, Conquistas) e componentes
```

## Garantia de qualidade do conteúdo

O teste `src/lessons/content.test.ts` percorre **todos os passos de todas as aulas** em um Postgres real: cada passo precisa falhar antes da solução, passar depois dela, e as respostas erradas típicas cadastradas precisam ser rejeitadas. Outro teste reconstrói o banco do zero a partir do SQL exportado e compara com o original.

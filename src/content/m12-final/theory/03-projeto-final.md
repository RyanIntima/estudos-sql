# O seu LojaDB está pronto

> **Em uma frase:** olhe para trás: você construiu, só com SQL, um banco de dados completo.

## O que você tem agora

Conte o que o seu banco contém, e **como** cada peça entrou:

| Você aprendeu | O que construiu no LojaDB |
|---------------|---------------------------|
| Tabelas, tipos, chaves | `clientes`, `categorias`, `produtos` |
| Integridade | `UNIQUE`, `CHECK`, chaves estrangeiras com `ON DELETE` |
| Modelagem | `enderecos` (1:N), `itens_pedido` (N:N), `pagamentos` (1:1), normalização |
| Consultas | JOINs, agregação, subconsultas, CTEs, window functions |
| Transações | vendas e cancelamentos atômicos |
| Views, funções, triggers | `vw_vendas`, `baixar_estoque`, carimbo e auditoria |
| Índices | `visitas` com 60 mil linhas, consultas em milissegundos |
| Schemas e permissões | `relatorios`, o papel `analista` |

## Exporte o seu trabalho

Na página **Projeto** você encontra:

- o **diagrama completo** do LojaDB, que você pode baixar como imagem;
- um arquivo **`lojadb.sql`** com **toda a estrutura e os dados**: ao rodá-lo num PostgreSQL qualquer, o seu banco é recriado;
- as estatísticas do que você construiu.

Esse arquivo é um **backup lógico**, parente do que a ferramenta `pg_dump` gera. Guardar um `.sql` assim é o primeiro passo de qualquer rotina de backup.

## O que vem depois

Este curso cobre os fundamentos que você usa **todo dia**. Para continuar:

- **Migrações**: como mudar o schema de um banco em produção, com versão e reversão (ferramentas como Flyway, Alembic, Prisma Migrate).
- **Backup e recuperação**: `pg_dump`, `pg_basebackup`, *point-in-time recovery*.
- **Replicação e alta disponibilidade**: réplicas de leitura, failover.
- **Outros recursos do Postgres**: `JSONB`, busca de texto, particionamento de tabelas, extensões.
- **Concorrência na prática**: níveis de isolamento, locks, *deadlocks*.
- **Outros modelos**: quando um banco de documentos, chave-valor ou colunar faz sentido.

## Um último desafio

O chefão final reúne vários módulos num só pedido: um relatório **materializado**, em outro **schema**, com **window function**, **índice único** e **permissão mínima**. Boa sorte!

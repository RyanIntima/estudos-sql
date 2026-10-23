# Índices parciais, de expressão e únicos

> **Em uma frase:** um índice pode cobrir **só parte das linhas**, ou o **resultado de uma expressão**, e ainda garantir **unicidade**.

## Índice parcial

Se um relatório só olha as visitas **anônimas** (sem cliente), por que indexar todas?

```sql
CREATE INDEX idx_visitas_anonimas ON visitas (visto_em) WHERE cliente_id IS NULL;
```

- O índice guarda **só** as linhas em que `cliente_id IS NULL`: fica **menor** e mais barato de manter.
- O planejador o usa quando a consulta tem **a mesma condição**: `WHERE cliente_id IS NULL AND visto_em >= ...`.

Bom para dados em que **uma fatia** é a que se consulta: pedidos `novo`, produtos `ativo`, registros não processados.

## Índice de expressão

Se você sempre compara ignorando maiúsculas:

```sql
SELECT * FROM produtos WHERE lower(nome) = 'meia';
```

um índice comum em `nome` **não ajuda** (a consulta usa `lower(nome)`, não `nome`). Indexe a expressão:

```sql
CREATE INDEX idx_produtos_nome_lower ON produtos (lower(nome));
```

## Índice único: unicidade que o `UNIQUE` simples não dá

`UNIQUE (nome)` considera `'Meia'` e `'MEIA'` **diferentes**. Um índice único **de expressão** fecha essa brecha:

```sql
CREATE UNIQUE INDEX uq_produtos_nome_ci ON produtos (lower(nome));
```

Agora `'Meia'` e `'MEIA'` colidem, e o banco recusa o segundo com `duplicate key value violates unique constraint`.

## Apagando

```sql
DROP INDEX idx_visitas_anonimas;
```

Apagar um índice **não perde dado nenhum**: só deixa de acelerar. É seguro, e é o jeito de se livrar do custo de um índice que não compensa.

## Como saber se um índice é usado?

Rode `EXPLAIN ANALYZE` nas consultas que importam e procure o nome do índice no plano. Se ele **nunca** aparece, ele só está custando escrita e espaço.

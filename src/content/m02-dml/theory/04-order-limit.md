# ORDER BY e LIMIT

> **Em uma frase:** `ORDER BY` põe o resultado **em ordem** e `LIMIT` traz **só as primeiras** linhas.

## ORDER BY

```sql
SELECT nome FROM clientes
ORDER BY nome;         -- A → Z (ASC é o padrão)

SELECT nome FROM clientes
ORDER BY nome DESC;    -- Z → A
```

> **Sem `ORDER BY`, o banco não promete ordem nenhuma.** Mesmo que hoje pareça ordenado, amanhã pode não ser. Se a ordem importa, peça.

Você pode ordenar por várias colunas: `ORDER BY categoria, preco DESC`.

## LIMIT e OFFSET

```sql
SELECT nome FROM clientes
ORDER BY nome
LIMIT 2;              -- só as 2 primeiras

SELECT nome FROM clientes
ORDER BY nome
LIMIT 2 OFFSET 2;     -- pula 2, mostra as 2 seguintes
```

É a base da **paginação**: página 1 = `LIMIT 10 OFFSET 0`, página 2 = `LIMIT 10 OFFSET 10`…

## A ordem de escrita

`SELECT` → `FROM` → `WHERE` → `ORDER BY` → `LIMIT`. O banco exige essa sequência.

## NULL na ordenação

No Postgres, `NULL` vem **por último** em `ASC` e **primeiro** em `DESC`. Mude com `NULLS FIRST` ou `NULLS LAST`.

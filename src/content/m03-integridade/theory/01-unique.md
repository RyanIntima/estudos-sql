# Valores únicos: UNIQUE

> **Em uma frase:** `UNIQUE` garante que **nenhuma linha repete** o valor de uma coluna.

## Por que não confiar só no sistema

Se dois clientes puderem ter o mesmo email, qual deles entra no login? Validar na tela **não basta**: outro sistema, um script ou uma falha pode gravar direto no banco. A regra que não pode falhar mora **no banco**.

## Sintaxe

```sql
ALTER TABLE clientes
  ADD CONSTRAINT uq_clientes_email UNIQUE (email);
```

- `ADD CONSTRAINT nome` — dá um **nome** à regra. Nomes claros ajudam a ler os erros e a remover a regra depois.
- `UNIQUE (email)` — a coluna que não pode repetir. Com várias colunas, a **combinação** é que não repete: `UNIQUE (pedido_id, produto_id)`.

## UNIQUE × PRIMARY KEY

| | `PRIMARY KEY` | `UNIQUE` |
|---|---|---|
| Quantas por tabela | **uma** | várias |
| Aceita `NULL` | não | **sim** (e `NULL` nunca é igual a `NULL`: podem existir vários) |
| Serve para | identificar a linha | impedir repetição de um dado de negócio |

## Quando a regra é violada

```
ERROR: duplicate key value violates unique constraint "uq_clientes_email"
DETAIL: Key (email)=(ana@email.com) already exists.
```

O `INSERT` (ou `UPDATE`) é **recusado inteiro**. Se a tabela já tiver valores repetidos, o `ADD CONSTRAINT` também falha: é preciso limpar os dados antes.

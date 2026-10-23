# LEFT JOIN: não perder quem não tem par

> **Em uma frase:** o `LEFT JOIN` mantém **todas as linhas da tabela da esquerda**, mesmo sem par na direita.

## O problema do INNER JOIN

Com `INNER JOIN`, um cliente que **nunca comprou** simplesmente **desaparece** do resultado. Para um relatório de "todos os clientes e seus pedidos", isso esconde justamente quem importa.

## Sintaxe

```sql
SELECT c.nome, p.status
FROM clientes c
LEFT JOIN pedidos p ON p.cliente_id = c.id;
```

- Todo cliente aparece **pelo menos uma vez**.
- Se o cliente tem 3 pedidos, aparece 3 vezes (uma por pedido).
- Se não tem nenhum, aparece **uma vez**, com as colunas de `pedidos` em **`NULL`**.

## Achando quem NÃO tem par (anti-join)

O `NULL` vira uma pista: filtre as linhas onde a direita ficou vazia.

```sql
SELECT c.nome
FROM clientes c
LEFT JOIN pedidos p ON p.cliente_id = c.id
WHERE p.id IS NULL;           -- clientes sem nenhum pedido
```

Use uma coluna que **nunca é nula** quando existe par (a chave primária).

## ON × WHERE em LEFT JOIN

- Condição no **`ON`**: decide **quem casa**. Quem não casa continua, com `NULL`.
- Condição no **`WHERE`**: roda **depois** e **descarta** linhas, inclusive as com `NULL`.

```sql
LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.status <> 'cancelado'   -- mantém todos os clientes
LEFT JOIN pedidos p ON p.cliente_id = c.id WHERE p.status <> 'cancelado' -- derruba quem ficou com NULL
```

## Ao lado

Na aba **Execução**, compare as linhas depois do `FROM`/`JOIN` num `INNER JOIN` e num `LEFT JOIN`: a diferença são exatamente os "sem par".

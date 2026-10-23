# HAVING: filtrando grupos

> **Em uma frase:** `WHERE` filtra **linhas** antes de agrupar; `HAVING` filtra **grupos** depois.

## A pergunta que o WHERE não responde

"Quais categorias têm **mais de 2 produtos**?" depende do **resultado da contagem**, que só existe **depois** de agrupar. E o `WHERE` roda **antes**.

```sql
SELECT c.nome, count(*) AS produtos
FROM categorias c
JOIN produtos p ON p.categoria_id = c.id
GROUP BY c.nome
HAVING count(*) > 2;
```

## A ordem em que o banco executa

```
FROM / JOIN  →  WHERE  →  GROUP BY  →  HAVING  →  SELECT  →  ORDER BY  →  LIMIT
```

Por isso:

- `WHERE` **não pode** usar agregações (`WHERE count(*) > 2` dá erro: ainda não foram calculadas).
- `HAVING` **pode** (os grupos já existem).
- Apelidos do `SELECT` **não** existem ainda no `HAVING` (repita a expressão). No `ORDER BY` já existem.

## WHERE ou HAVING?

| Quero filtrar… | Use |
|----------------|-----|
| linhas **antes** de agrupar (ex.: ignorar pedidos cancelados) | `WHERE` |
| grupos **pelo resultado** da agregação (ex.: total > 300) | `HAVING` |

Filtrar com `WHERE` sempre que possível é mais rápido: o grupo se forma com **menos linhas**.

## Os melhores do ranking

Combine tudo com `ORDER BY` e `LIMIT`:

```sql
SELECT pr.nome, sum(i.quantidade * i.preco_unitario) AS faturamento
FROM itens_pedido i
JOIN produtos pr ON pr.id = i.produto_id
GROUP BY pr.nome
ORDER BY faturamento DESC
LIMIT 3;                 -- os 3 que mais faturaram
```

## Ao lado

A aba **Execução** mostra a ordem acima na prática, com a quantidade de linhas e grupos que sobra depois de cada etapa.

# Rankings: ROW_NUMBER, RANK e DENSE_RANK

> **Em uma frase:** as três numeram as linhas de uma partição; a diferença está em **como tratam os empates**.

## Os três, lado a lado

Quatro pedidos com 3, 2, 2 e 1 itens, ordenados do maior para o menor:

| itens | `row_number()` | `rank()` | `dense_rank()` |
|------:|---------------:|---------:|---------------:|
| 3 | 1 | 1 | 1 |
| 2 | 2 | 2 | 2 |
| 2 | 3 | **2** | **2** |
| 1 | 4 | **4** | **3** |

- **`ROW_NUMBER`** — sempre 1, 2, 3, 4. Empatados recebem números diferentes, e **qual** vem primeiro é arbitrário. Use quando precisar de **uma** linha por posição.
- **`RANK`** — empatados dividem a posição e **pula** as seguintes (1, 2, 2, **4**), como numa competição esportiva.
- **`DENSE_RANK`** — empatados dividem a posição e **não pula** (1, 2, 2, **3**).

```sql
SELECT categoria, produto, preco,
       rank() OVER (PARTITION BY categoria ORDER BY preco DESC) AS posicao
FROM ...;
```

Com `PARTITION BY categoria`, a numeração **recomeça em 1** a cada categoria.

## Top N por grupo

Uma pergunta clássica: "o produto mais caro **de cada** categoria". Você precisa filtrar pela posição, mas a janela não pode ficar no `WHERE`. Resolva em duas etapas:

```sql
WITH ranking AS (
  SELECT c.nome AS categoria, p.nome AS produto, p.preco,
         row_number() OVER (PARTITION BY c.nome ORDER BY p.preco DESC) AS pos
  FROM produtos p
  JOIN categorias c ON c.id = p.categoria_id
)
SELECT categoria, produto, preco
FROM ranking
WHERE pos = 1;
```

1. A CTE calcula a posição de cada produto na sua categoria.
2. A consulta de fora **filtra** `pos = 1`.

## Janela sobre agregação

A janela roda **depois** do `GROUP BY`, então pode ordenar por uma agregação:

```sql
SELECT p.criado_em, count(*) AS itens,
       rank() OVER (ORDER BY count(*) DESC) AS posicao
FROM pedidos p JOIN itens_pedido i ON i.pedido_id = p.id
GROUP BY p.id, p.criado_em;
```

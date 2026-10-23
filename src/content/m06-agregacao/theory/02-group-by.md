# GROUP BY: agregando por grupo

> **Em uma frase:** o `GROUP BY` divide as linhas em **grupos** e aplica a agregação **a cada grupo**.

## De uma resposta para uma por grupo

```sql
SELECT c.nome AS categoria, count(*) AS produtos
FROM categorias c
JOIN produtos p ON p.categoria_id = c.id
GROUP BY c.nome;
```

Em vez de "quantos produtos existem?", responde "quantos produtos **em cada categoria**?". Cada grupo vira **uma linha** do resultado.

## A regra do SELECT

Toda coluna do `SELECT` precisa estar **no `GROUP BY`** ou **dentro de uma agregação**. Do contrário, o banco não saberia qual valor mostrar para o grupo (erro `42803`).

Ao agrupar por uma coluna que **não é única** (como `nome`), pessoas com o mesmo nome caem no mesmo grupo. Quando a identidade importa, inclua a chave: `GROUP BY c.id, c.nome`.

## A armadilha do COUNT com LEFT JOIN

Um cliente **sem pedidos**, num `LEFT JOIN`, gera **uma linha com `NULL`**. Então:

- `count(*)` conta essa linha: o cliente aparece com **1** pedido (errado!).
- `count(p.id)` ignora o `NULL`: aparece com **0** (certo).

Para contar "filhos" depois de um `LEFT JOIN`, **conte uma coluna da tabela da direita**.

## Agrupando por mais de uma coluna

```sql
SELECT status, count(*) FROM pedidos GROUP BY status;
```

Com duas colunas, cada **combinação** distinta forma um grupo.

## Ao lado

Na aba **Execução**, o estágio `GROUP BY` mostra **quantos grupos** nasceram e **quantas linhas** caíram em cada um.

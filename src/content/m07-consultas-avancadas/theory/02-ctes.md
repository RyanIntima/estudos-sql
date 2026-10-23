# CTEs: consultas com nome (WITH)

> **Em uma frase:** a `WITH` dá um **nome** a uma consulta intermediária, para você usá-la como se fosse uma tabela.

## O problema

Consultas complicadas viram "sanduíches" de subconsultas dentro de subconsultas, difíceis de ler. A CTE (*Common Table Expression*) as organiza **de cima para baixo**:

```sql
WITH total_pedido AS (
  SELECT pedido_id, sum(quantidade * preco_unitario) AS total
  FROM itens_pedido
  GROUP BY pedido_id
)
SELECT round(avg(total), 2) AS ticket_medio
FROM total_pedido;
```

1. A CTE `total_pedido` calcula o total de cada pedido.
2. A consulta final **usa** `total_pedido` como qualquer tabela.

## Várias CTEs encadeadas

Separe com vírgula; uma pode usar as anteriores:

```sql
WITH total_pedido AS (...),
     medio AS (SELECT avg(total) AS valor FROM total_pedido)
SELECT ...
```

## Vantagens

- **Leitura**: cada etapa tem nome e responsabilidade.
- **Reuso**: use a mesma CTE várias vezes na consulta final.
- **Depuração**: rode só o `SELECT` de dentro para conferir o que ela devolve.

## O que a CTE **não** é

Ela existe **só durante aquela consulta**: não fica gravada no banco. Se você quiser guardar uma consulta com nome para sempre, o recurso é a **view** (módulo 10).

## Ao lado

A explicação do código mostra **cada CTE como um item** com as próprias cláusulas, e a consulta final como outro.

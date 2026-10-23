# Subconsultas

> **Em uma frase:** uma subconsulta é um `SELECT` **dentro de outro**, usado como valor, lista ou tabela.

## Três formas

**1. Um valor só (escalar):**

```sql
SELECT nome, preco
FROM produtos
WHERE preco > (SELECT avg(preco) FROM produtos);
```

A subconsulta calcula a média; a consulta de fora usa esse número. Sem subconsulta você teria de **digitar** a média, e ela mudaria a cada venda.

**2. Uma lista de valores (`IN`):**

```sql
SELECT nome FROM clientes
WHERE id IN (SELECT cliente_id FROM pedidos);   -- quem já comprou
```

**3. Existência (`EXISTS`):**

```sql
SELECT nome FROM produtos pr
WHERE NOT EXISTS (
  SELECT 1 FROM itens_pedido i WHERE i.produto_id = pr.id
);                                               -- produtos nunca vendidos
```

## Subconsulta correlacionada

No `EXISTS` acima, a subconsulta usa `pr.id`, **da consulta de fora**: ela é reavaliada **para cada produto**. Isso se chama subconsulta *correlacionada*. O `SELECT 1` não importa: o `EXISTS` só quer saber se **existe alguma linha**.

## Armadilha: `NOT IN` e `NULL`

Se a lista do `NOT IN` contiver **um único `NULL`**, o resultado inteiro vira "desconhecido" e **nenhuma linha** passa. Para "não está em", prefira **`NOT EXISTS`** (ou um anti-join).

## Subconsulta × JOIN

Muitas perguntas têm as duas respostas (`LEFT JOIN ... IS NULL` ou `NOT EXISTS`). Escolha pela **leitura**: a subconsulta costuma dizer melhor "o que se quer saber".

## Ao lado

Na explicação do código, a subconsulta aparece **destrinchada em um item próprio**, com as suas cláusulas.

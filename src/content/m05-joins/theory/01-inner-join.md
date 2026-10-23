# INNER JOIN: juntando tabelas

> **Em uma frase:** o `JOIN` combina **linhas de duas tabelas** quando uma condição (o `ON`) é verdadeira.

## Por que juntar?

Normalizamos para guardar cada fato uma vez: `pedidos` tem só o `cliente_id`, e o **nome** do cliente fica em `clientes`. Para mostrar "o pedido da Ana", é preciso **juntar** as duas.

## Sintaxe

```sql
SELECT c.nome, p.criado_em, p.status
FROM pedidos p
JOIN clientes c ON c.id = p.cliente_id;
```

- `FROM pedidos p` — tabela de partida, com o **apelido** `p`.
- `JOIN clientes c` — tabela a juntar, apelido `c`.
- `ON c.id = p.cliente_id` — a regra do par: "esta linha de pedido casa com a linha de cliente cujo `id` é igual ao `cliente_id`".
- `c.nome` — o apelido diz **de qual tabela** vem a coluna. Se duas tabelas têm `id`, escrever só `id` dá erro de ambiguidade.

`JOIN` sozinho é o mesmo que `INNER JOIN`: **só ficam os pares que casam**. Pedido sem cliente (ou cliente sem pedido) não aparece.

## Encadeando várias tabelas

Cada `JOIN` acrescenta uma tabela ao resultado:

```sql
FROM pedidos p
JOIN itens_pedido i ON i.pedido_id = p.id
JOIN produtos pr    ON pr.id = i.produto_id
```

## A armadilha: esquecer o ON

Sem condição, cada linha de uma tabela se junta com **todas** as da outra (produto cartesiano): 5 pedidos × 4 clientes = **20 linhas**, quase todas sem sentido. Se o número de linhas explodiu, procure o `ON` que faltou.

## Ao lado

A aba **Execução** mostra quantas linhas existem **depois do `FROM`/`JOIN`**: é a forma de ver a explosão (ou a perda) de linhas acontecendo.

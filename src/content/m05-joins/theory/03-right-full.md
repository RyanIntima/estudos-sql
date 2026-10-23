# RIGHT JOIN e FULL JOIN

> **Em uma frase:** `RIGHT JOIN` é um `LEFT JOIN` visto do outro lado; `FULL JOIN` mantém **os dois lados**.

## Os quatro tipos, num quadro

| JOIN | Mantém |
|------|--------|
| `INNER JOIN` | só os pares que casam |
| `LEFT JOIN` | **todas** da esquerda + os pares |
| `RIGHT JOIN` | **todas** da direita + os pares |
| `FULL JOIN` | **todas** das duas + os pares |

## RIGHT = LEFT trocado

Estas duas consultas devolvem **exatamente o mesmo**:

```sql
FROM categorias c LEFT  JOIN produtos pr ON pr.categoria_id = c.id
FROM produtos pr  RIGHT JOIN categorias c ON pr.categoria_id = c.id
```

Na prática quase todo mundo usa só `LEFT JOIN` e escolhe a ordem das tabelas: lê-se de cima para baixo, "a tabela principal primeiro". Você vai ver `RIGHT JOIN` em código dos outros.

## FULL JOIN: conciliar duas listas

Útil para **comparar** duas fontes: quem está só na esquerda, quem está só na direita, quem está nas duas.

```sql
SELECT a.nome, b.nome
FROM lista_a a
FULL JOIN lista_b b ON b.nome = a.nome;
```

Linhas só da esquerda trazem `NULL` à direita, e vice-versa.

## Na sua loja

Cada produto **precisa** ter categoria (a chave estrangeira é `NOT NULL`), então não existe produto "sem categoria". Mas **pode existir categoria sem produto**, e o `LEFT`/`RIGHT`/`FULL` mostram isso: a categoria vazia aparece com `NULL` no lado dos produtos.

## Ao lado

Na aba **Execução**, o número de linhas depois do `JOIN` mostra a diferença entre os tipos: o `INNER` tem menos que os outros.

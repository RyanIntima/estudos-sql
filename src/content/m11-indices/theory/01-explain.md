# Lendo planos de execução: EXPLAIN

> **Em uma frase:** `EXPLAIN` mostra **como** o Postgres vai (ou foi) buscar os dados, e é a ferramenta para descobrir por que uma consulta está lenta.

## Por que uma consulta fica lenta?

Com 8 produtos, qualquer consulta é instantânea. Com **milhões** de linhas, a forma de buscar importa muito. O banco escolhe um **plano**; o `EXPLAIN` deixa você vê-lo.

## EXPLAIN × EXPLAIN ANALYZE

```sql
EXPLAIN SELECT * FROM visitas WHERE sessao = 1234;           -- só o PLANO (estimativas)
EXPLAIN ANALYZE SELECT * FROM visitas WHERE sessao = 1234;   -- EXECUTA e mede de verdade
```

> ⚠️ **`EXPLAIN ANALYZE` executa o comando de verdade.** Com um `SELECT` é seguro; com `UPDATE` ou `DELETE`, ele **altera os dados**. Dentro de uma transação com `ROLLBACK`, dá para testar sem consequência.

## Lendo o resultado

```
Seq Scan on visitas  (cost=0.00..1192.00 rows=12 width=30)
                     (actual time=0.256..8.495 rows=12.00 loops=1)
  Filter: (sessao = 1234)
  Rows Removed by Filter: 59988
Planning Time: 0.553 ms
Execution Time: 8.713 ms
```

| Pedaço | Significa |
|--------|-----------|
| `Seq Scan` | **leitura sequencial**: leu a tabela **inteira** |
| `cost=0.00..1192.00` | custo **estimado** (unidade arbitrária: serve para comparar planos) |
| `rows=12` | quantas linhas o banco **estimou** que voltariam |
| `actual time`, `rows=12.00` | o que **realmente** aconteceu (só no `ANALYZE`) |
| `Rows Removed by Filter: 59988` | linhas lidas e **jogadas fora**: sinal de desperdício |
| `Execution Time` | tempo total real |

Planos são **árvores**: o nó mais **recuado** roda primeiro e alimenta o de cima. Leia **de dentro para fora**.

## Os tipos de leitura mais comuns

| Nó | O que faz | Quando é bom |
|----|-----------|--------------|
| **Seq Scan** | lê a tabela toda | tabelas pequenas, ou quando quase todas as linhas servem |
| **Index Scan** | usa um índice para ir direto às linhas | poucas linhas de uma tabela grande |
| **Bitmap Index/Heap Scan** | usa o índice e depois lê as páginas em lote | quantidade média de linhas |
| **Index Only Scan** | responde só com o índice, sem ir à tabela | índice cobre as colunas pedidas |

Um `Seq Scan` **não é sempre ruim**. Ele só é um problema quando lê uma tabela **grande** para devolver **poucas** linhas.

## Estatísticas

O planejador decide com base em **estatísticas** sobre os dados (quantas linhas, como os valores se distribuem). Depois de carregar muitos dados, rode `ANALYZE tabela;` para atualizá-las, ou o plano pode ser escolhido às cegas.

## Ao lado

A aba **Plano** desenha esse resultado como uma árvore, com barras proporcionais ao tempo e avisos sobre leituras sequenciais em tabelas grandes.

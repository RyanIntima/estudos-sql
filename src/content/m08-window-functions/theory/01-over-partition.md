# Funções de janela: OVER e PARTITION BY

> **Em uma frase:** uma função de janela calcula **sobre um conjunto de linhas** sem **juntá-las** em uma só, então cada linha continua aparecendo.

## O problema do GROUP BY

Você quer cada produto **e** a média de preço da categoria dele. Com `GROUP BY categoria` você teria **uma linha por categoria**: os produtos somem. Com uma função de janela, cada produto continua lá, com a média ao lado:

```sql
SELECT p.nome, c.nome AS categoria, p.preco,
       avg(p.preco) OVER (PARTITION BY c.nome) AS media_categoria
FROM produtos p
JOIN categorias c ON c.id = p.categoria_id;
```

## Anatomia do `OVER`

```
função(...) OVER ( PARTITION BY coluna  ORDER BY coluna )
```

- **`OVER (...)`** — é isso que transforma uma função comum numa função de **janela**.
- **`PARTITION BY`** — divide as linhas em **partições** (como o `GROUP BY`, mas sem colapsar). Sem ele, a janela é **a tabela inteira**: `sum(estoque) OVER ()`.
- **`ORDER BY`** — ordena dentro da partição (necessário para ranking e para totais acumulados).

## Qualquer agregação pode virar janela

`sum`, `avg`, `count`, `min`, `max`... acrescente `OVER` e ela passa a devolver **um valor por linha**:

```sql
SELECT nome, estoque,
       round(100.0 * estoque / sum(estoque) OVER (), 1) AS pct_do_estoque
FROM produtos;
```

## ROW_NUMBER: numerar linhas

```sql
SELECT row_number() OVER (ORDER BY preco DESC) AS posicao, nome, preco
FROM produtos;
```

## Quando a janela é calculada

Depois do `FROM`, `WHERE`, `GROUP BY` e `HAVING`, e **antes** do `ORDER BY` e do `LIMIT`. Duas consequências:

- Você **não pode** usar uma função de janela no `WHERE` (ela ainda não existe). A saída é uma CTE ou subconsulta, que você verá na próxima aula.
- Pode haver janela sobre uma agregação: `sum(sum(x)) OVER (...)`.

## Ao lado

Na aba **Execução**, uma etapa **Funções de janela** aparece entre o `HAVING` e o `SELECT`: ela **não muda** o número de linhas.

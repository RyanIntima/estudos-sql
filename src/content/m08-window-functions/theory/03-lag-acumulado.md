# LAG, LEAD e totais acumulados

> **Em uma frase:** `LAG`/`LEAD` olham a linha **anterior**/**seguinte**; `SUM ... OVER (ORDER BY ...)` soma **até a linha atual**.

## LAG e LEAD: espiando os vizinhos

```sql
SELECT criado_em, total,
       lag(total)  OVER (ORDER BY criado_em) AS anterior,
       lead(total) OVER (ORDER BY criado_em) AS proximo
FROM ...;
```

- `lag(x)` — o valor de `x` na linha **anterior** (na ordem da janela). Na primeira, devolve `NULL`.
- `lead(x)` — o da linha **seguinte**. Na última, `NULL`.
- Um segundo argumento anda mais linhas: `lag(x, 2)`. O terceiro é o valor para quando não existe: `lag(x, 1, 0)`.
- Com `PARTITION BY cliente`, "anterior" quer dizer **o pedido anterior do mesmo cliente**, e não o da tabela.

Aplicações: variação em relação ao período anterior, tempo entre eventos, detectar mudanças.

## Total acumulado (running total)

Com `ORDER BY` dentro do `OVER`, a soma passa a ser **cumulativa**:

```sql
SELECT dia, faturamento,
       sum(faturamento) OVER (ORDER BY dia) AS acumulado
FROM ...;
```

| dia | faturamento | acumulado |
|-----|------------:|----------:|
| 10/01 | 159,70 | 159,70 |
| 05/02 | 299,90 | 459,60 |
| 20/02 | 179,50 | 639,10 |

Cada linha soma **tudo desde o começo até ela**. Sem `ORDER BY`, a soma seria a **mesma** em todas as linhas (o total geral).

## A moldura (frame)

Por padrão, com `ORDER BY`, a janela vai do começo da partição até a linha atual. Dá para mudar:

```sql
avg(x) OVER (ORDER BY dia ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)   -- média móvel de 3 linhas
```

## Outras funções úteis

- `first_value(x)` / `last_value(x)` — o primeiro/último valor da janela.
- `ntile(4)` — divide as linhas em 4 faixas (quartis).
- `percent_rank()` — posição relativa de 0 a 1.

Todas funcionam do mesmo jeito: `função(...) OVER (PARTITION BY ... ORDER BY ...)`.

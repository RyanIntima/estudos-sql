# CASE, datas e textos

> **Em uma frase:** `CASE` decide um valor por linha; as funções de data e de texto transformam o que sai no resultado.

## CASE: um "se/senão" dentro do SELECT

```sql
SELECT nome, preco,
       CASE
         WHEN preco < 50  THEN 'barato'
         WHEN preco < 150 THEN 'médio'
         ELSE 'premium'
       END AS faixa
FROM produtos;
```

As condições são avaliadas **na ordem**; vale a **primeira** verdadeira. Sem `ELSE`, o que não casa vira `NULL`.

## COALESCE: troque o vazio por um valor

```sql
COALESCE(sum(valor), 0)     -- se a soma for NULL, devolve 0
```

## Datas

| Função | Exemplo | Resultado |
|--------|---------|-----------|
| `to_char(data, 'YYYY-MM')` | `to_char(criado_em, 'YYYY-MM')` | `'2026-02'` |
| `date_trunc('month', data)` | primeiro instante do mês | `2026-02-01 00:00` |
| `EXTRACT(year FROM data)` | só o ano | `2026` |
| `CURRENT_DATE` / `now()` | hoje / agora | |
| `data + INTERVAL '7 days'` | soma 7 dias | |

```sql
SELECT to_char(criado_em, 'YYYY-MM') AS mes, count(*) AS pedidos
FROM pedidos
GROUP BY mes
ORDER BY mes;
```

Agrupar pelo apelido do `SELECT` é permitido no Postgres.

## Textos

| Função | Faz |
|--------|-----|
| `upper(x)` / `lower(x)` | maiúsculas / minúsculas |
| `length(x)` | quantidade de caracteres |
| `split_part(x, '@', 2)` | o pedaço 2 do texto cortado por `@` |
| `a \|\| ' ' \|\| b` | concatena |
| `x ILIKE '%ana%'` | `LIKE` sem diferenciar maiúsculas |

```sql
SELECT split_part(email, '@', 2) AS dominio FROM clientes;   -- 'email.com'
```

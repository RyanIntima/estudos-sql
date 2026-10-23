# UPDATE: corrigindo dados

> **Em uma frase:** `UPDATE` muda valores de linhas que **já existem**.

## Sintaxe

```sql
UPDATE produtos
SET preco = 89.90
WHERE id = 3;
```

- `SET` — qual coluna recebe qual valor. Para várias: `SET preco = 89.90, nome = 'Camiseta Azul'`.
- `WHERE` — **quais linhas** mudam.

## ⚠️ Sem WHERE, vale para a tabela inteira

```sql
UPDATE produtos SET preco = 0;   -- TODOS os produtos ficam grátis
```

O banco não pergunta se você tem certeza. Hábito de profissional: **escreva o `WHERE` primeiro**, ou teste com um `SELECT` usando o mesmo filtro:

```sql
SELECT * FROM produtos WHERE id = 3;   -- é essa a linha?
```

## Confira o que mudou

O Postgres mostra quantas linhas foram afetadas (`UPDATE 1`). Esse número é seu alarme: se era para mudar uma e mudou cinco, algo está errado.

## Ao lado

Na aba **Dados**, as linhas alteradas aparecem com o novo valor assim que o comando roda.

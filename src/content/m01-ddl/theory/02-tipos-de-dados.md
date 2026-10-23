# Tipos de dados

> **Em uma frase:** o **tipo** diz o que a coluna aceita, e escolher o tipo certo evita bugs e desperdício.

## Os tipos que você mais vai usar

| Tipo | Guarda | Exemplo |
|------|--------|---------|
| `INTEGER` / `BIGINT` | números inteiros | `42` |
| `NUMERIC(10,2)` | decimais **exatos** (10 dígitos, 2 depois da vírgula) | `199.90` |
| `VARCHAR(n)` | texto de até `n` caracteres | `'Ana Souza'` |
| `TEXT` | texto sem limite | uma descrição longa |
| `BOOLEAN` | verdadeiro ou falso | `true` |
| `DATE` | uma data | `'1990-05-14'` |
| `TIMESTAMP` | data **e hora** | `'2026-01-10 14:30:00'` |

> **Dinheiro é `NUMERIC`, nunca `FLOAT`.** Números de ponto flutuante acumulam erros de arredondamento (`0.1 + 0.2` não dá exatamente `0.3`). Em uma loja, isso vira centavo sumindo.

## Acrescentando colunas depois

Não precisa acertar tudo no `CREATE TABLE`. `ALTER TABLE` muda uma tabela que já existe:

```sql
ALTER TABLE produtos ADD COLUMN preco NUMERIC(10,2);
```

- `ALTER TABLE produtos` — "vou mexer na tabela `produtos`".
- `ADD COLUMN preco NUMERIC(10,2)` — "acrescente a coluna `preco`".

Em uma tabela que já tem linhas, a nova coluna começa com `NULL` (vazio) nelas.

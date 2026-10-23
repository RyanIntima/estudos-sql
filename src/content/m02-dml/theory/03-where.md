# WHERE: filtrando linhas

> **Em uma frase:** `WHERE` deixa passar **só as linhas** que cumprem a condição.

## Sintaxe

```sql
SELECT nome, email
FROM clientes
WHERE cpf = '333.333.333-33';
```

## Operadores de comparação

| Operador | Significa |
|----------|-----------|
| `=` | igual (um único `=`, não `==`) |
| `<>` | diferente |
| `<`, `<=`, `>`, `>=` | menor, maior… |
| `BETWEEN a AND b` | entre `a` e `b` (inclusive) |
| `IN ('x', 'y')` | é um dentre vários valores |
| `LIKE 'C%'` | texto que **começa** com C (`%` = qualquer coisa) |

## Combinando condições

- `AND` — **as duas** precisam valer.
- `OR` — **pelo menos uma** precisa valer.
- Use parênteses quando misturar os dois: `(a OR b) AND c`.

```sql
WHERE data_nascimento >= '1990-01-01' AND telefone IS NOT NULL
```

## A pegadinha do NULL

`NULL` é "desconhecido". Nada é igual a `NULL`, nem outro `NULL`. Por isso `telefone = NULL` **nunca** é verdadeiro. O certo:

```sql
WHERE telefone IS NULL       -- sem telefone
WHERE telefone IS NOT NULL   -- com telefone
```

## Ao lado

Compare o resultado com a aba **Dados**: o `WHERE` descarta linhas só no resultado, a tabela não muda.

# INSERT: dando vida às tabelas

> **Em uma frase:** `INSERT` acrescenta **linhas** a uma tabela.

## Sintaxe

```sql
INSERT INTO produtos (nome, preco)
VALUES ('Camiseta', 79.90);
```

- `INSERT INTO produtos (nome, preco)` — em qual tabela e **em quais colunas** você vai gravar.
- `VALUES (...)` — os valores, **na mesma ordem** das colunas.
- Textos e datas ficam entre aspas simples: `'Camiseta'`, `'1990-05-14'`. Números, não.

## Colunas que você pode omitir

Não precisa informar tudo:

- colunas **identity** (como `id`) se preenchem sozinhas;
- colunas com **DEFAULT** (como `criado_em`) usam o valor padrão;
- colunas opcionais ficam `NULL`.

Já as colunas **`NOT NULL` sem default** são obrigatórias: se faltar uma, o banco recusa o `INSERT`.

## Várias linhas de uma vez

```sql
INSERT INTO produtos (nome, preco) VALUES
  ('Camiseta', 79.90),
  ('Boné', 49.90),
  ('Meia', 19.90);
```

Um comando só é mais rápido e **atômico**: ou entram todas as linhas, ou nenhuma.

## Ao lado

Abra a aba **Dados** para ver as linhas entrando na tabela.

# Índices B-tree

> **Em uma frase:** um índice é um **sumário ordenado** de uma coluna, que permite ir direto às linhas em vez de ler a tabela inteira.

## A analogia

Procurar "sessão 1234" numa tabela de 60 mil linhas sem índice é **folhear o livro inteiro**. Com índice é consultar o **índice remissivo** e ir direto à página.

## Criando

```sql
CREATE INDEX idx_visitas_sessao ON visitas (sessao);
```

- `idx_visitas_sessao` — o nome (convenção: `idx_tabela_colunas`).
- `ON visitas (sessao)` — a tabela e a(s) coluna(s).
- O tipo padrão é **B-tree**, ótimo para `=`, `<`, `>`, `BETWEEN` e `ORDER BY`.

Depois disso, o **mesmo** `SELECT` passa de `Seq Scan` (lê tudo) para `Index Scan`/`Bitmap Index Scan` (vai direto): a diferença pode ser de **dezenas de vezes**.

## O planejador decide

Criar o índice **não obriga** o banco a usá-lo. Ele só usa se estimar que compensa:

- Pouquíssimas linhas (`WHERE sessao = 1234`) → índice vale muito.
- **Quase todas** as linhas → ler a tabela direto é mais barato.
- Tabela minúscula → também não compensa.

## Índice composto: a ordem das colunas importa

```sql
CREATE INDEX idx_visitas_produto_visto ON visitas (produto_id, visto_em);
```

O índice fica ordenado por `produto_id` e, **dentro de cada produto**, por `visto_em`. Ele ajuda consultas que:

- filtram por `produto_id`;
- filtram por `produto_id` **e** `visto_em`;
- filtram por `produto_id` e **ordenam** por `visto_em` (já vem na ordem: sem etapa de `Sort`).

Mas **não** ajuda bem quem filtra **só** por `visto_em`: o índice não começa por ela. É a regra do **prefixo à esquerda**.

> **Regra prática:** coloque primeiro as colunas comparadas com **`=`**, depois a de **intervalo ou ordenação**.

## O custo dos índices

Nada é de graça:

- **Escritas mais lentas**: cada `INSERT`/`UPDATE`/`DELETE` atualiza **todos** os índices da tabela.
- **Espaço em disco**.

Por isso: **indexe o que as consultas realmente usam**, e apague os índices que ninguém usa. Não crie um índice "por garantia" em toda coluna.

## O que já tem índice sem você pedir

`PRIMARY KEY` e `UNIQUE` criam índices automaticamente. Chaves **estrangeiras**, não: se você junta ou filtra muito por uma FK, vale indexá-la.

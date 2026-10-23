# UNION e CTE recursiva

> **Em uma frase:** `UNION` empilha resultados; a CTE recursiva percorre estruturas em árvore de **qualquer profundidade**.

## UNION: empilhar consultas

```sql
SELECT nome, 'cliente'   AS tipo FROM clientes
UNION
SELECT nome, 'categoria' AS tipo FROM categorias
ORDER BY tipo, nome;
```

Regras:

- As consultas precisam ter **o mesmo número de colunas**, com **tipos compatíveis**.
- Os nomes das colunas vêm da **primeira** consulta.
- `UNION` **remove linhas repetidas**; `UNION ALL` mantém tudo (e é mais rápido). Também existem `INTERSECT` (só o que está nas duas) e `EXCEPT` (o que está na primeira e não na segunda).
- O `ORDER BY` vale para o conjunto todo e vai **no final**.

## CTE recursiva: percorrer a árvore

A hierarquia de categorias tem profundidade variável. Uma CTE recursiva tem **duas partes** ligadas por `UNION ALL`:

```sql
WITH RECURSIVE arvore AS (
  -- 1) âncora: onde começar (as raízes)
  SELECT id, nome, nome::text AS caminho
  FROM categorias
  WHERE categoria_pai_id IS NULL

  UNION ALL

  -- 2) passo recursivo: filhos de quem já está na árvore
  SELECT c.id, c.nome, a.caminho || ' > ' || c.nome
  FROM categorias c
  JOIN arvore a ON c.categoria_pai_id = a.id
)
SELECT caminho FROM arvore ORDER BY caminho;
```

Como funciona: o banco roda a **âncora**; depois repete o **passo recursivo** usando as linhas novas do passo anterior; **para** quando um passo não devolve nada.

- `nome::text` — a coluna acumulada precisa ter **o mesmo tipo** nas duas partes; por isso o `::text`.
- Se houver um **ciclo** nos dados (A é pai de B, B é pai de A), a recursão **não termina**. Num sistema real, limite a profundidade.

## Quando usar

Árvores de categorias, organogramas, respostas de comentários, rotas encadeadas: sempre que o dado aponta **para outro do mesmo tipo**, sem saber de antemão quantos níveis existem.

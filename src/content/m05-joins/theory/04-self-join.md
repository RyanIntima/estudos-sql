# Self join: a tabela juntando com ela mesma

> **Em uma frase:** quando uma tabela tem uma chave estrangeira **para si mesma**, você a junta consigo mesma usando **dois apelidos**.

## Hierarquias

Categorias costumam formar uma árvore: *Vestuário* contém *Camisetas*, *Calçados* e *Acessórios*. Em vez de uma tabela por nível, cada categoria aponta para a sua **pai**:

```sql
ALTER TABLE categorias
  ADD COLUMN categoria_pai_id INTEGER REFERENCES categorias (id);
```

A categoria raiz tem `categoria_pai_id` **vazio** (`NULL`). Isso é uma chave estrangeira **autorreferenciada**.

## Lendo a hierarquia

Para mostrar a categoria **e o nome da pai**, a tabela aparece duas vezes, com apelidos diferentes:

```sql
SELECT c.nome AS categoria, pai.nome AS pai
FROM categorias c
LEFT JOIN categorias pai ON pai.id = c.categoria_pai_id;
```

- `c` — a categoria em si.
- `pai` — a **mesma tabela**, no papel de "categoria pai".
- `LEFT JOIN` porque as raízes não têm pai e precisam continuar na lista.

## Mudando várias linhas com subconsulta

```sql
UPDATE categorias
SET categoria_pai_id = (SELECT id FROM categorias WHERE nome = 'Vestuário')
WHERE nome IN ('Camisetas', 'Calçados', 'Acessórios');
```

## Outros usos do self join

- Funcionário → gerente (`gerente_id` na própria tabela `funcionarios`).
- Comentário → comentário respondido.

Para percorrer uma árvore de **profundidade qualquer**, o self join não basta: é para isso que existe a CTE recursiva, no módulo 7.

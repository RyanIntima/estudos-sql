# N:N: a tabela de junção

> **Em uma frase:** para ligar "muitos a muitos" você cria uma **terceira tabela**, com uma linha para cada par.

## Itens do pedido

```
 pedidos ──< itens_pedido >── produtos
   (1)           (N)            (1)
```

Cada linha de `itens_pedido` liga **um** pedido a **um** produto e carrega o que pertence à ligação: a **quantidade** e o **preço unitário**.

## Chave primária composta

Um mesmo produto não deve aparecer duas vezes no mesmo pedido (para comprar mais, aumenta-se a quantidade). Então a chave primária é a **combinação** das duas colunas:

```sql
CREATE TABLE itens_pedido (
  pedido_id  INTEGER NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos (id),
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  PRIMARY KEY (pedido_id, produto_id)
);
```

- `PRIMARY KEY (a, b)` — declarada **à parte** (depois das colunas), porque envolve duas.
- `ON DELETE CASCADE` em `pedido_id` — apagou o pedido, apagam-se os itens.
- Sem `CASCADE` em `produto_id` — não se apaga um produto que já foi vendido.

## Por que copiar o preço?

`preco_unitario` repete o preço do produto **no momento da venda**. Parece redundante, mas é correto: se o preço do produto mudar amanhã, o pedido de ontem **não pode mudar**. É uma cópia **histórica**, não uma duplicata.

## Inserindo sem decorar ids

Subconsultas dentro do `VALUES` buscam os ids pelo que você conhece:

```sql
INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
VALUES (
  (SELECT id FROM pedidos  WHERE criado_em = '2026-01-10 10:00'),
  (SELECT id FROM produtos WHERE nome = 'Boné'),
  1, 59.90
);
```

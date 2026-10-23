# Pedidos: o coração da loja

> **Em uma frase:** o pedido é o **cabeçalho** da venda (quem, quando, em que situação); o que foi comprado fica em outra tabela.

## O que vai (e o que não vai) em `pedidos`

- `cliente_id` — quem comprou (chave estrangeira para `clientes`).
- `criado_em` — quando, com `DEFAULT now()`.
- `status` — em que ponto está: `novo`, `pago`, `enviado` ou `cancelado`.

Repare no que **não** está lá: o total. O total se **calcula** somando os itens. Guardar o total no pedido criaria duas verdades que podem divergir.

## Restringindo valores com CHECK + IN

```sql
status VARCHAR(20) NOT NULL DEFAULT 'novo'
       CHECK (status IN ('novo', 'pago', 'enviado', 'cancelado'))
```

- `DEFAULT 'novo'` — todo pedido nasce novo.
- `CHECK (status IN (...))` — qualquer outro texto (`'entregue'`, `'Pago '`…) é recusado. Sem isso, a tabela acumularia grafias diferentes para a mesma coisa.

## Inserindo com datas

Datas e horas são texto entre aspas no formato `'AAAA-MM-DD HH:MM'`:

```sql
INSERT INTO pedidos (cliente_id, criado_em, status)
SELECT id, '2026-01-10 10:00', 'pago'
FROM clientes
WHERE cpf = '111.111.111-11';
```

## Cargas de dados

Nos próximos passos você vai rodar **scripts prontos** que cadastram vários registros de uma vez. Antes de executar, **leia**: o painel *Explicação do código* ajuda. Cargas assim são rotina em projetos reais.

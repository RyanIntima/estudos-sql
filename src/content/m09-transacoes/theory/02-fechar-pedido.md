# Fechando um pedido: várias etapas, uma transação

> **Em uma frase:** fechar uma venda mexe em **várias tabelas**, e é a transação que garante que ela fique **inteira ou não aconteça**.

## As etapas de uma venda

1. Criar o **pedido** (`pedidos`).
2. Registrar os **itens** (`itens_pedido`).
3. **Baixar o estoque** (`produtos`).

```sql
BEGIN;

INSERT INTO pedidos (cliente_id, criado_em, status)
SELECT id, '2026-04-01 09:00', 'pago' FROM clientes WHERE cpf = '555.555.555-55';

INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
SELECT p.id, pr.id, 2, pr.preco
FROM pedidos p, produtos pr
WHERE p.criado_em = '2026-04-01 09:00' AND pr.nome = 'Boné';

UPDATE produtos SET estoque = estoque - 2 WHERE nome = 'Boné';

COMMIT;
```

## Quando algo falha no meio

Suponha que o estoque **não baste**. O `CHECK (estoque >= 0)` da tabela recusa o `UPDATE`, e o Postgres:

1. **Interrompe** a transação (ela entra em estado de erro);
2. **ignora** todos os comandos seguintes, até um `ROLLBACK`;
3. **desfaz** o que veio antes: o pedido e os itens que já tinham sido inseridos **somem**.

Resultado: nada de venda pela metade. As regras do módulo 3 (`CHECK`, `FOREIGN KEY`) e as transações trabalham **juntas**: as regras detectam o problema, e a transação garante que ele não deixe sujeira.

```
ERROR: new row for relation "produtos" violates check constraint
```

Se você usar um cliente de banco de dados de verdade e vir

```
ERROR: current transaction is aborted, commands ignored until end of transaction block
```

significa que um comando anterior falhou e falta o `ROLLBACK`.

## UPDATE com dados de outra tabela

Para devolver ao estoque os itens de um pedido cancelado, o `UPDATE` precisa **ler** a tabela de itens. A cláusula `FROM` faz isso:

```sql
UPDATE produtos pr
SET estoque = pr.estoque + i.quantidade
FROM itens_pedido i
WHERE i.produto_id = pr.id AND i.pedido_id = 42;
```

Cada linha de `produtos` é combinada com as linhas de `itens_pedido` que casam no `WHERE`, como num `JOIN`.

## Dica de modelagem

Guardar o estoque numa coluna e baixá-lo à mão é simples, mas exige **disciplina**: toda venda precisa fazer o `UPDATE`. Na aula de triggers você vai fazer o banco cuidar disso sozinho.

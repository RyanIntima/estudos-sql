# Views e views materializadas

> **Em uma frase:** uma view é uma **consulta com nome**, guardada no banco, que você usa como se fosse uma tabela.

## Para que serve

Aquela consulta de quatro `JOIN`s que a equipe de relatórios copia e cola em todo lugar? Em vez disso, dê um nome a ela:

```sql
CREATE VIEW vw_vendas AS
SELECT p.criado_em AS pedido, c.nome AS cliente, pr.nome AS produto,
       i.quantidade, i.quantidade * i.preco_unitario AS subtotal, p.status
FROM pedidos p
JOIN clientes c      ON c.id = p.cliente_id
JOIN itens_pedido i  ON i.pedido_id = p.id
JOIN produtos pr     ON pr.id = i.produto_id;
```

Agora qualquer um escreve:

```sql
SELECT cliente, sum(subtotal) FROM vw_vendas WHERE status <> 'cancelado' GROUP BY cliente;
```

## O que a view **não** é

- Ela **não guarda dados**. Cada vez que você a consulta, o banco roda a consulta de dentro **de novo**. Por isso está sempre **atualizada**.
- Não deixa a consulta mais **rápida**: o custo é o mesmo.
- Mas ela dá **um lugar só** para a regra: se a lógica mudar, você troca a view (`CREATE OR REPLACE VIEW`) e todos os relatórios mudam juntos.

Também serve para **segurança**: você pode dar acesso à view e **não** às tabelas de baixo (aula sobre permissões).

## View materializada: guarda o resultado

```sql
CREATE MATERIALIZED VIEW mv_faturamento_mensal AS
SELECT to_char(p.criado_em, 'YYYY-MM') AS mes,
       sum(i.quantidade * i.preco_unitario) AS faturamento
FROM pedidos p JOIN itens_pedido i ON i.pedido_id = p.id
WHERE p.status <> 'cancelado'
GROUP BY 1;
```

Aqui o resultado **fica gravado**: ler é rápido, mesmo que a consulta de origem seja pesada. O preço: os dados ficam **velhos** até você mandar atualizar:

```sql
REFRESH MATERIALIZED VIEW mv_faturamento_mensal;
```

| | View | View materializada |
|---|------|--------------------|
| Guarda dados | não | **sim** |
| Sempre atualizada | **sim** | só após `REFRESH` |
| Leitura | tão lenta quanto a consulta | rápida (pode até ter índice) |
| Use para | reaproveitar uma consulta | relatórios pesados que toleram atraso |

## Ao lado

No **diagrama**, views aparecem como cartões pontilhados ligados às tabelas de que dependem.

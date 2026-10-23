# Relacionamentos: 1:1, 1:N e N:N

> **Em uma frase:** modelar é decidir **quais tabelas existem** e **como elas se ligam**, e só há três jeitos de ligar.

## Os três tipos

| Tipo | Leitura | Como se implementa | Exemplo na loja |
|------|---------|--------------------|-----------------|
| **1:N** | um para muitos | chave estrangeira **no lado "N"** | um cliente tem vários endereços |
| **1:1** | um para um | chave estrangeira **+ `UNIQUE`** | um pedido tem no máximo um pagamento |
| **N:N** | muitos para muitos | **tabela de junção** com duas chaves estrangeiras | um pedido tem vários produtos, e um produto está em vários pedidos |

## Como descobrir o tipo

Faça duas perguntas, uma em cada sentido:

1. Um **cliente** pode ter vários **endereços**? Sim.
2. Um **endereço** pode pertencer a vários **clientes**? Não.

Sim + Não = **1:N**. A chave estrangeira vai na tabela que fica com o "N": `enderecos.cliente_id`.

Se as duas respostas forem **sim** (pedido ↔ produto), uma coluna não resolve: surge uma **tabela de junção**, que nesta loja se chama `itens_pedido`. Cada linha dela diz "este produto, neste pedido, nesta quantidade".

## ON DELETE na prática

- `enderecos` de um cliente: se o cliente for apagado, os endereços não têm mais sentido → `ON DELETE CASCADE`.
- `pedidos` de um cliente: o histórico de vendas **não deve sumir** → sem `CASCADE`: o banco recusa apagar cliente com pedidos.

## Nesta aula

Vamos ligar `enderecos` a `clientes` (1:N). Em seguida vêm `pedidos` e a tabela de junção.

# O que é um banco relacional?

> **Em uma frase:** um banco relacional guarda informações em **tabelas** e você conversa com ele usando **SQL**.

## Tabela, coluna e linha

Pense numa planilha. No banco ela se chama **tabela**:

| id | nome | email |
|----|------|-------|
| 1 | Ana Souza | ana@email.com |
| 2 | Bruno Lima | bruno@email.com |

- **Tabela** — um assunto (`clientes`).
- **Coluna** — uma característica do assunto (`nome`, `email`). Cada coluna tem um **tipo**: texto, número, data…
- **Linha** — um registro (a cliente "Ana Souza").

## Por que "relacional"?

Tabelas se **relacionam**. Um pedido não repete o nome do cliente: guarda só o `id` dele, que aponta para a tabela `clientes`. Assim cada informação existe em **um único lugar** e nunca fica contraditória. Você vai construir exatamente isso.

## Seu primeiro comando

```sql
SELECT 'Olá, banco!' AS mensagem;
```

- `SELECT` pede ao banco que **devolva** algo.
- `'Olá, banco!'` é um texto. Textos usam **aspas simples**.
- `AS mensagem` dá um **nome** à coluna do resultado.
- `;` encerra o comando.

O resultado de um `SELECT` é, de novo, uma tabela.

## O projeto

Ao longo do curso você vai construir o **LojaDB**, o banco de uma loja virtual: clientes, produtos, pedidos, pagamentos. Cada aula acrescenta uma peça, e o diagrama ao lado mostra o banco crescendo.

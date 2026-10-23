# DELETE: removendo linhas

> **Em uma frase:** `DELETE` apaga **linhas** (a tabela continua existindo).

## Sintaxe

```sql
DELETE FROM produtos
WHERE id = 3;
```

## DELETE × DROP TABLE

| Comando | Apaga | A tabela |
|---------|-------|----------|
| `DELETE FROM t WHERE ...` | algumas linhas | continua, com a estrutura |
| `DELETE FROM t` | **todas** as linhas | continua, vazia |
| `DROP TABLE t` | a tabela inteira | deixa de existir |

## ⚠️ A mesma regra do UPDATE

`DELETE FROM clientes;` **sem WHERE** esvazia a tabela. Antes de apagar, rode o `SELECT` com o mesmo filtro e confira se são as linhas certas.

## Na vida real

Muitos sistemas **não apagam**: marcam o registro como inativo (`ativo = false`). Apagar um cliente que já fez pedidos, por exemplo, quebra o histórico. Você vai ver como o banco protege isso com **chaves estrangeiras**, no módulo 3.

## Ao lado

Na aba **Dados**, a linha apagada some da tabela.

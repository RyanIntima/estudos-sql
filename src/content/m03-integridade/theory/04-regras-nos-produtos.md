# Protegendo o catálogo: CHECK e ON DELETE

> **Em uma frase:** combine `CHECK` e chaves estrangeiras para o banco **defender sozinho** a consistência do catálogo.

## E se alguém apagar uma categoria que tem produtos?

A chave estrangeira também vigia o **apagar**. Você escolhe o que acontece com as filhas com `ON DELETE`:

| Regra | O que acontece ao apagar o pai |
|-------|-------------------------------|
| `NO ACTION` (padrão) / `RESTRICT` | o banco **recusa** o `DELETE` enquanto houver filhas |
| `CASCADE` | as filhas são **apagadas junto** |
| `SET NULL` | a coluna da filha vira `NULL` (só se ela aceitar vazio) |
| `SET DEFAULT` | a coluna da filha volta ao valor padrão |

Para um catálogo, o mais seguro é **recusar**: apagar uma categoria não deve levar os produtos junto sem querer. Já os **itens de um pedido** fazem sentido com `CASCADE`: sem o pedido, eles não têm razão de existir (você verá no próximo módulo).

## Trocando a regra de uma chave estrangeira

Não existe "alterar" uma chave estrangeira: **remova e recrie**, no mesmo comando:

```sql
ALTER TABLE produtos
  DROP CONSTRAINT produtos_categoria_id_fkey,
  ADD CONSTRAINT produtos_categoria_id_fkey
      FOREIGN KEY (categoria_id) REFERENCES categorias (id)
      ON DELETE RESTRICT;
```

O Postgres dá nome às regras sozinho: `tabela_coluna_fkey`. Confira o nome no diagrama ou na mensagem de erro.

## Várias regras trabalhando juntas

- `NOT NULL` — o dado precisa existir.
- `CHECK (preco > 0)` — e precisa fazer sentido.
- `REFERENCES` — e precisa apontar para algo real.
- `UNIQUE` — e não pode repetir.

Cada regra barra um tipo de erro diferente. Juntas, elas garantem que **nenhum dado ruim entra**, venha de onde vier.

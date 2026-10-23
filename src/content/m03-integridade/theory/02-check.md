# Regras de negócio: CHECK

> **Em uma frase:** `CHECK` faz o banco **recusar valores** que violam uma regra que você escreveu.

## Sintaxe

```sql
ALTER TABLE produtos
  ADD CONSTRAINT ck_produtos_preco CHECK (preco > 0);
```

Dentro dos parênteses vai qualquer **condição** (a mesma lógica do `WHERE`). Toda linha gravada precisa torná-la verdadeira.

## Exemplos do mundo real

| Regra | Condição |
|-------|----------|
| Preço positivo | `CHECK (preco > 0)` |
| Estoque nunca negativo | `CHECK (estoque >= 0)` |
| Só estes status | `CHECK (status IN ('novo', 'pago', 'enviado'))` |
| Ninguém nasce no futuro | `CHECK (data_nascimento <= CURRENT_DATE)` |

## Também dentro da coluna

Na criação ou ao acrescentar uma coluna, a regra pode vir junto:

```sql
ALTER TABLE produtos
  ADD COLUMN estoque INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0);
```

## O que o CHECK **não** faz

- Se a condição der `NULL` (por exemplo `preco > 0` com `preco` vazio), a linha **passa**. Para proibir vazio, use também `NOT NULL`.
- Não consulta **outras tabelas**. Para isso existem as chaves estrangeiras (próxima aula).

## Quando a regra é violada

```
ERROR: new row for relation "produtos" violates check constraint "ck_produtos_preco"
```

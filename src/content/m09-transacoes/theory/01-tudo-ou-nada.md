# Transações: tudo ou nada

> **Em uma frase:** uma transação agrupa comandos para que **todos** valham, ou **nenhum**.

## O problema

Vender um produto são **vários** passos: registrar o pedido, registrar os itens, baixar o estoque. Se o sistema cair entre o segundo e o terceiro, você teria uma venda registrada **sem baixa de estoque**: o banco ficaria inconsistente. A transação impede isso.

## Os três comandos

```sql
BEGIN;                                   -- começa a transação
UPDATE produtos SET estoque = estoque - 2 WHERE nome = 'Boné';
COMMIT;                                  -- confirma: agora vale e fica gravado
```

```sql
BEGIN;
UPDATE produtos SET estoque = 0 WHERE nome = 'Boné';
ROLLBACK;                                -- desfaz: é como se nada tivesse acontecido
```

- **`BEGIN`** — abre a transação.
- **`COMMIT`** — confirma tudo o que foi feito desde o `BEGIN`.
- **`ROLLBACK`** — descarta tudo.

Dentro da transação **você** enxerga as suas mudanças (um `SELECT` mostra o estoque novo), mas elas só viram definitivas no `COMMIT`.

## ACID: as quatro garantias

| Letra | Garantia | Significa |
|------|----------|-----------|
| **A**tomicidade | tudo ou nada | ou todos os comandos valem, ou nenhum |
| **C**onsistência | regras respeitadas | `CHECK`, `FOREIGN KEY`, `UNIQUE` valem antes e depois |
| **I**solamento | sem interferência | uma transação não vê o meio-caminho de outra |
| **D**urabilidade | não se perde | depois do `COMMIT`, sobrevive a uma queda |

## E sem BEGIN?

Cada comando sozinho é uma transação implícita (*autocommit*). Um script com **vários** comandos enviados juntos também vale como **uma** transação implícita: se um falha, o script inteiro é desfeito.

## Neste ambiente

Cada execução do SQL Quest é uma **sessão limpa**. Se o seu script terminar com uma transação **aberta** (um `BEGIN` sem `COMMIT` nem `ROLLBACK`), o SQL Quest faz um `ROLLBACK` por você e **avisa**. É a lição na prática: **sem `COMMIT`, nada fica gravado.**

Por isso, escreva a transação **inteira num script só**: `BEGIN; ...; COMMIT;`.

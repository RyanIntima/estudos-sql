# SAVEPOINT e isolamento

> **Em uma frase:** um `SAVEPOINT` é um ponto de retorno **dentro** de uma transação: dá para desfazer só a parte depois dele.

## SAVEPOINT

```sql
BEGIN;
UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Boné';       -- (1)
SAVEPOINT depois_do_bone;
UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Mochila';    -- (2)
ROLLBACK TO SAVEPOINT depois_do_bone;                                 -- desfaz só o (2)
UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Meia';       -- (3)
COMMIT;                                                               -- valem o (1) e o (3)
```

- `SAVEPOINT nome` — marca o ponto.
- `ROLLBACK TO SAVEPOINT nome` — volta até o ponto; a transação **continua aberta**.
- `RELEASE SAVEPOINT nome` — descarta o marcador (o que veio depois **permanece**).

Serve para tentar uma operação opcional: se falhar, desfaz só ela e segue.

Um `ROLLBACK TO` também **recupera** uma transação em estado de erro, desde que você volte a um ponto anterior ao erro.

## Isolamento: duas transações ao mesmo tempo

Num sistema real, vários clientes usam o banco **simultaneamente**. O **isolamento** decide o que uma transação enxerga das outras. No Postgres, o padrão é `READ COMMITTED`: cada comando enxerga **só o que já foi confirmado** por outras transações.

| Nível | Enxerga |
|-------|---------|
| `READ COMMITTED` (padrão) | o que estiver confirmado **no instante de cada comando** |
| `REPEATABLE READ` | uma "foto" do banco tirada no **começo** da transação |
| `SERIALIZABLE` | como se as transações rodassem **uma de cada vez** |

## O clássico "lost update"

Dois atendentes vendem a última unidade ao mesmo tempo. Ambos leem `estoque = 1`, ambos gravam `estoque = 0`: **duas vendas, uma unidade**. Defesas:

- Fazer a conta **no próprio comando**: `SET estoque = estoque - 1` (o banco tranca a linha para quem chegar depois).
- Ou travar antes de ler: `SELECT ... FOR UPDATE` bloqueia a linha até o `COMMIT`.
- E manter o `CHECK (estoque >= 0)`, que impede o segundo de passar.

> O SQL Quest usa **uma única conexão**, então você não consegue provocar essa corrida aqui. Mas já sabe a regra: **faça a conta dentro do comando e proteja com `CHECK`**.

## Transações curtas

Uma transação aberta segura travas e impede a limpeza do banco. Abra, faça o necessário e **confirme logo**. Nunca deixe uma transação aberta esperando uma resposta do usuário.

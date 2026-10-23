# Funções de agregação

> **Em uma frase:** uma função de agregação **resume várias linhas em um único valor**.

## As cinco principais

| Função | Devolve |
|--------|---------|
| `COUNT(*)` | quantas **linhas** existem |
| `COUNT(coluna)` | quantas linhas têm a coluna **preenchida** (ignora `NULL`) |
| `SUM(coluna)` | a **soma** |
| `AVG(coluna)` | a **média** |
| `MIN(coluna)` / `MAX(coluna)` | o **menor** / o **maior** |

```sql
SELECT count(*)            AS produtos,
       min(preco)          AS mais_barato,
       max(preco)          AS mais_caro,
       round(avg(preco), 2) AS preco_medio
FROM produtos;
```

O resultado tem **uma linha só**: as 8 linhas de `produtos` foram resumidas.

## `COUNT(*)` × `COUNT(coluna)`

```sql
SELECT count(*) AS todos, count(sku) AS com_sku FROM produtos;
```

`COUNT(*)` conta linhas; `COUNT(sku)` conta só as que **têm** SKU. A diferença é justamente a quantidade de `NULL`. Todas as agregações, exceto `COUNT(*)`, **ignoram `NULL`**.

## ROUND

Médias vêm com muitas casas. `ROUND(valor, 2)` arredonda para 2 casas.

## Contas dentro da agregação

Você pode agregar uma **expressão**, não só uma coluna:

```sql
SELECT sum(preco * estoque) AS valor_em_estoque FROM produtos;
```

Calcula `preco × estoque` linha a linha e soma tudo.

## Regra de ouro

Misturar uma agregação com uma coluna comum, como `SELECT nome, count(*) FROM produtos`, dá **erro**: o banco não sabe qual `nome` mostrar para o grupo todo. A solução é o `GROUP BY`, da próxima aula.

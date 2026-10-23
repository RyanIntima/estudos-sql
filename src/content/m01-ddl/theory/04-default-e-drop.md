# DEFAULT, renomear e apagar

> **Em uma frase:** `DEFAULT` preenche sozinho; `RENAME` e `DROP` corrigem o rumo, **com cuidado**.

## DEFAULT: o valor padrão

Se o `INSERT` não informar a coluna, o banco usa o `DEFAULT`:

```sql
ALTER TABLE produtos ALTER COLUMN criado_em SET DEFAULT now();
```

`now()` devolve o instante atual. Resultado: todo produto novo recebe a data de criação **sem ninguém precisar lembrar**.

## Renomear

```sql
ALTER TABLE produtos RENAME COLUMN nome TO titulo;
ALTER TABLE produtos RENAME TO itens;
```

## Apagar

```sql
ALTER TABLE produtos DROP COLUMN criado_em;  -- apaga uma coluna e os dados dela
DROP TABLE produtos;                         -- apaga a tabela inteira
DROP TABLE IF EXISTS produtos;               -- não dá erro se ela não existir
```

> **`DROP` não tem "desfazer".** Os dados somem. Em produção, isso se faz com backup e revisão. Aqui você pode errar à vontade: o botão **Reiniciar passo** volta o banco ao início do passo.

## Ao lado

Veja a tabela desaparecer do diagrama assim que o `DROP TABLE` rodar.

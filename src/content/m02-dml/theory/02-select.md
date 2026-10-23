# SELECT: perguntando ao banco

> **Em uma frase:** `SELECT` escolhe **quais colunas** você quer ver, e `FROM` diz **de qual tabela**.

## Sintaxe

```sql
SELECT coluna1, coluna2
FROM tabela;
```

- `SELECT *` traz **todas** as colunas. Ótimo para espiar, ruim para sistemas: traz dados à toa.
- Liste só as colunas de que precisa: menos dados trafegando, consulta mais clara.

## Apelidos com AS

```sql
SELECT nome AS cliente, email AS contato
FROM clientes;
```

`AS` só muda o **nome no resultado**. A tabela continua igual.

## Consultar não altera nada

Um `SELECT` é **somente leitura**: você pode rodar mil vezes sem medo. Por isso é o melhor jeito de entender o que há no banco antes de mudar qualquer coisa.

## Ao lado

O que o `SELECT` devolve **não é guardado**: é uma tabela temporária, só para você olhar. A tabela de verdade fica intacta na aba **Dados**.

# Chave estrangeira: ligando tabelas

> **Em uma frase:** a **chave estrangeira** (`FOREIGN KEY`) faz uma coluna só aceitar valores que **existem** em outra tabela.

## O problema

Um produto pertence a uma categoria. Guardar o **nome** da categoria dentro do produto repete o texto mil vezes e, se você renomear a categoria, ele fica errado em mil lugares. Melhor guardar só o **`id`** da categoria e apontar para ela.

Mas e se alguém gravar `categoria_id = 999`, e a categoria 999 não existe? A chave estrangeira impede.

## Sintaxe

```sql
CREATE TABLE produtos (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  categoria_id INTEGER NOT NULL REFERENCES categorias (id),
  nome         VARCHAR(120) NOT NULL
);
```

`REFERENCES categorias (id)` diz: "o valor desta coluna precisa existir na coluna `id` da tabela `categorias`".

- A tabela **referenciada** (`categorias`) é o **pai**; a que aponta (`produtos`) é a **filha**.
- A coluna referenciada precisa ser `PRIMARY KEY` ou `UNIQUE`.
- Relação **1:N**: uma categoria tem **muitos** produtos; cada produto tem **uma** categoria.

## A ordem importa

1. Crie primeiro a tabela **pai**.
2. Cadastre as linhas do **pai** antes das filhas.
3. Para apagar: as **filhas** primeiro.

## Truque: INSERT com SELECT

Em vez de decorar o `id` da categoria, busque-o pelo nome:

```sql
INSERT INTO produtos (categoria_id, nome)
SELECT id, 'Camiseta Básica'
FROM categorias
WHERE nome = 'Camisetas';
```

O `SELECT` devolve a linha da categoria e o `INSERT` grava o produto apontando para ela. Funciona mesmo que os `id`s mudem.

## Quando a regra é violada

```
ERROR: insert or update on table "produtos" violates foreign key constraint
DETAIL: Key (categoria_id)=(999) is not present in table "categorias".
```

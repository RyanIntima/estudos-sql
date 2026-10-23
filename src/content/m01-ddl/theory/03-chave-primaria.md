# Chave primária, NOT NULL e identity

> **Em uma frase:** a **chave primária** é o RG de cada linha: única, nunca vazia.

## Chave primária (PRIMARY KEY)

Como saber, sem dúvida, **qual** cliente é qual? Dois clientes podem se chamar "Ana Souza". Por isso cada linha tem um **identificador único**:

```sql
ALTER TABLE produtos ADD PRIMARY KEY (id);
```

A chave primária garante duas coisas: **não repete** e **não é vazia**. É por ela que outras tabelas vão apontar para esta.

## NOT NULL

`NULL` significa "sem valor" (não é zero nem texto vazio). Colunas que a loja não vive sem devem ser **obrigatórias**:

```sql
ALTER TABLE produtos ALTER COLUMN nome SET NOT NULL;
```

Daqui em diante, inserir um produto sem nome dá **erro**. É o banco protegendo os dados, não um incômodo.

## Identity: ids automáticos

Ninguém quer inventar o `id` na mão. Uma coluna **identity** gera o próximo número sozinha:

```sql
ALTER TABLE produtos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY;
```

- `GENERATED ALWAYS AS IDENTITY` é a forma moderna do Postgres.
- Você verá também `SERIAL` em projetos antigos: faz o mesmo trabalho. Em tabelas novas, `id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY`.

## Ao lado

No diagrama, a coluna ganha o selo **PK**, e colunas obrigatórias aparecem em **negrito**.

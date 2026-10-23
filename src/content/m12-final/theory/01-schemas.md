# Schemas: organizando o banco em "pastas"

> **Em uma frase:** um schema é um **espaço de nomes** dentro do banco: uma pasta onde ficam tabelas, views e funções.

## Por que usar

Até agora tudo mora em `public`. Num banco que cresce, isso vira uma gaveta bagunçada. Schemas separam **áreas** (vendas, relatórios, auditoria), evitam **colisão de nomes** e facilitam dar **permissões por área**.

```sql
CREATE SCHEMA relatorios;
```

## Usando o schema

Para criar ou usar um objeto de outro schema, **qualifique** o nome:

```sql
CREATE VIEW relatorios.vendas_por_cliente AS ...;
SELECT * FROM relatorios.vendas_por_cliente;
```

Duas tabelas de mesmo nome podem existir em schemas diferentes: `vendas.pedidos` e `arquivo.pedidos`.

## search_path: onde o banco procura

Quando você escreve só `pedidos`, o Postgres procura nos schemas listados no `search_path`, **em ordem**. O padrão é `public`. Você pode mudar **na sessão**:

```sql
SET search_path TO relatorios, public;
SELECT * FROM vendas_por_cliente;     -- agora acha, sem escrever relatorios.
```

No SQL Quest, cada execução começa com o `search_path` **de fábrica**, então o `SET` vale **só para o script** em que você o escreveu.

## Pelo diagrama

Objetos fora de `public` aparecem com o nome qualificado (`relatorios.vendas_por_cliente`).

## Boa prática

- Deixe as **tabelas do sistema** num schema e os **relatórios** em outro.
- Não dê ao pessoal de relatórios acesso às tabelas: dê acesso a **views** do schema `relatorios` (próxima aula).

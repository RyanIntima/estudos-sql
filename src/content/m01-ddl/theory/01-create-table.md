# Criando sua primeira tabela

> **Em uma frase:** `CREATE TABLE` define o **molde** (colunas e tipos) onde os dados vão morar.

## Sintaxe

```sql
CREATE TABLE nome_da_tabela (
  coluna1 TIPO,
  coluna2 TIPO
);
```

- Use nomes em minúsculas com `_` (snake_case): `clientes`, `data_nascimento`.
- Cada coluna é **nome + tipo**, separadas por vírgula. **Sem vírgula depois da última.**
- Uma tabela nova nasce **vazia**: só a estrutura existe.

## Exemplo

```sql
CREATE TABLE produtos (
  id   INTEGER,
  nome VARCHAR(80)
);
```

- `INTEGER` — número inteiro.
- `VARCHAR(80)` — texto de **até 80** caracteres.

## Para que serve no mundo real

A estrutura é um **contrato**: depois de criada, o banco recusa dados que não respeitam o molde, como um texto numa coluna de número. Quanto mais cedo você modela bem, menos dados sujos aparecem.

## Ao lado

Assim que o comando rodar, a tabela aparece no **diagrama**. Cada linha do cartão é uma coluna com o seu tipo.

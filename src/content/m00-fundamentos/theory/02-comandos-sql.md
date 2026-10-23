# Falando SQL: os tipos de comando

> **Em uma frase:** todo comando SQL ou **consulta**, ou **muda dados**, ou **muda a estrutura**.

## As famílias de comandos

| Família | Para quê | Comandos |
|---------|----------|----------|
| **DDL** (definição) | Criar e alterar a **estrutura** | `CREATE`, `ALTER`, `DROP` |
| **DML** (manipulação) | Mudar os **dados** | `INSERT`, `UPDATE`, `DELETE` |
| **DQL** (consulta) | **Ler** dados | `SELECT` |

Nos módulos seguintes você usa cada uma delas, nessa ordem: primeiro a estrutura, depois os dados, depois as consultas.

## Regras de escrita

- Comandos terminam com **`;`**. Você pode escrever vários no mesmo script; eles rodam **em ordem**.
- Palavras do SQL (`SELECT`, `FROM`) **não diferenciam** maiúsculas de minúsculas. Por convenção, escrevemos em MAIÚSCULAS para destacá-las.
- Quebras de linha e espaços extras não mudam nada. Use-os para deixar o código legível.
- Textos ficam entre **aspas simples**: `'LojaDB'`.
- **Comentários** começam com `--` e vão até o fim da linha. O banco os ignora.

```sql
-- Mostra o nome da loja
SELECT 'LojaDB' AS loja;
```

## Vários comandos de uma vez

```sql
SELECT 1 AS primeiro;
SELECT 2 AS segundo;
```

O Playground mostra **um resultado para cada comando**, na ordem em que foram escritos.

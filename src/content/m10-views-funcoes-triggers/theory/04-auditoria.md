# Trigger de auditoria

> **Em uma frase:** um trigger `AFTER UPDATE` pode registrar **o que mudou**, deixando um histórico que ninguém precisa lembrar de gravar.

## A necessidade

"Quem mudou o preço do Chinelo, e de quanto para quanto?" Sem um registro, a resposta se perdeu no `UPDATE`. A solução é uma tabela de histórico alimentada por um trigger.

## Passo 1: a tabela de histórico

```sql
CREATE TABLE auditoria_precos (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  produto_id   INTEGER NOT NULL REFERENCES produtos (id) ON DELETE CASCADE,
  preco_antigo NUMERIC(10,2) NOT NULL,
  preco_novo   NUMERIC(10,2) NOT NULL,
  alterado_em  TIMESTAMP NOT NULL DEFAULT now()
);
```

## Passo 2: a função e o trigger

```sql
CREATE FUNCTION audita_preco() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auditoria_precos (produto_id, preco_antigo, preco_novo)
  VALUES (OLD.id, OLD.preco, NEW.preco);
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_produtos_audita_preco
AFTER UPDATE OF preco ON produtos
FOR EACH ROW
WHEN (OLD.preco IS DISTINCT FROM NEW.preco)
EXECUTE FUNCTION audita_preco();
```

Repare nos detalhes:

- **`AFTER`** — a linha já foi gravada com sucesso; só então registramos.
- **`UPDATE OF preco`** — só dispara se a coluna `preco` aparece no `SET`.
- **`WHEN (OLD.preco IS DISTINCT FROM NEW.preco)`** — só dispara se o preço **realmente mudou** (um `SET preco = preco` não gera registro). `IS DISTINCT FROM` trata `NULL` corretamente, ao contrário de `<>`.
- **`OLD` e `NEW`** — o preço de antes e o de depois.

## Passo 3: ver funcionando

```sql
UPDATE produtos SET preco = 44.90 WHERE nome = 'Chinelo';
SELECT * FROM auditoria_precos;
```

## Boas práticas de auditoria

- A tabela de histórico só recebe `INSERT`s: ninguém deveria alterá-la.
- Guarde **quem** fez (em sistemas reais, o usuário da aplicação) e **quando**.
- A chave estrangeira com `ON DELETE CASCADE` é uma escolha: aqui o histórico some com o produto. Em auditoria séria, prefira **manter** o histórico.

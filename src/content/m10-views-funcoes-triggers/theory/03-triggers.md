# Triggers: o banco reage sozinho

> **Em uma frase:** um trigger executa uma função **automaticamente** quando acontece um `INSERT`, `UPDATE` ou `DELETE`.

## As peças

Um trigger tem **duas** partes:

1. uma **função de trigger**, que devolve `trigger`;
2. o **`CREATE TRIGGER`**, que liga a função a uma tabela e a um evento.

```sql
CREATE FUNCTION set_atualizado_em() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_produtos_atualizado_em
BEFORE UPDATE ON produtos
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();
```

## Quando ele dispara

| | |
|--|--|
| `BEFORE` | **antes** de gravar: pode **alterar** a linha (`NEW`) ou recusar |
| `AFTER` | **depois** de gravar: serve para efeitos colaterais (auditoria, avisos) |
| `INSERT` / `UPDATE` / `DELETE` | o evento (pode combinar: `INSERT OR UPDATE`) |
| `FOR EACH ROW` | roda **uma vez por linha** afetada |
| `FOR EACH STATEMENT` | roda **uma vez por comando** |

## NEW e OLD

Dentro da função do trigger você tem a linha:

- **`NEW`** — a linha **como ficará** (em `INSERT` e `UPDATE`).
- **`OLD`** — a linha **como era** (em `UPDATE` e `DELETE`).

Num `BEFORE ... FOR EACH ROW`, a função **precisa devolver** a linha (`RETURN NEW`) para o comando seguir; devolver `NULL` **cancela** a operação para aquela linha.

## Exemplos clássicos

- **Carimbo de data** — `atualizado_em` sempre correto, sem depender do sistema lembrar.
- **Auditoria** — quem mudou o quê (próxima aula).
- **Validação** — `RAISE EXCEPTION` para recusar algo que as regras (`CHECK`, `FOREIGN KEY`) não conseguem expressar.
- **Valores derivados** — manter um total ou um contador em dia.

## Cuidados

- Triggers são **lógica escondida**: quem faz um `UPDATE` não vê o que acontece depois. Documente.
- Um trigger que altera a **mesma tabela** pode disparar a si mesmo (recursão).
- Eles tornam as escritas **um pouco mais lentas**.

## Ao lado

No **diagrama**, cada trigger aparece como uma linha ⚡ no rodapé da tabela. A aba **Impacto** descreve quando ele dispara.

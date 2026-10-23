# Papéis e permissões

> **Em uma frase:** um **papel** (role) é um usuário ou grupo, e as **permissões** dizem o que cada papel pode fazer.

## Princípio do menor privilégio

Cada pessoa ou sistema deve poder fazer **só o necessário**. A analista de BI precisa **ler** relatórios; ela **não** precisa (nem deve) ler CPF de clientes nem apagar pedidos.

## Criando um papel

```sql
CREATE ROLE analista NOLOGIN;
```

- `NOLOGIN` — não é um usuário que se conecta: é um **papel** (um "perfil") ao qual você dá permissões. Para uma pessoa de verdade, seria `LOGIN PASSWORD '...'`.
- Por si só, um papel novo **não pode quase nada**.

## Dando permissões (GRANT)

```sql
GRANT USAGE  ON SCHEMA relatorios TO analista;                      -- "entrar" no schema
GRANT SELECT ON relatorios.vendas_por_cliente TO analista;          -- ler a view
```

| Permissão | Permite |
|-----------|---------|
| `SELECT` | ler |
| `INSERT` / `UPDATE` / `DELETE` | gravar, alterar, apagar |
| `USAGE` (schema) | enxergar os objetos dentro dele |
| `ALL PRIVILEGES` | tudo (evite) |

Tirar é `REVOKE`.

## A view como camada de segurança

O dono da view a executa **com as permissões dele**. Por isso a `analista` pode ler `relatorios.vendas_por_cliente` **sem ter nenhuma permissão** sobre `clientes`, `pedidos` ou `itens_pedido`. Você expõe **só o que quer**, já resumido.

## Testando como outro papel

```sql
SET ROLE analista;
SELECT * FROM clientes;      -- ERROR: permission denied for table clientes (42501)
SELECT * FROM relatorios.vendas_por_cliente;   -- funciona
```

`SET ROLE` faz a sessão agir **como** aquele papel. No SQL Quest, ele volta ao normal no fim de cada execução.

## E num sistema real?

- Cada aplicação conecta com **o seu** usuário, com o mínimo necessário.
- A **migração** (que cria tabelas) usa um usuário diferente da **aplicação** do dia a dia.
- Para limitar **linhas** (cada vendedor vê só as suas), existe *Row Level Security*, que fica para um próximo estudo.

# Funções: SQL e PL/pgSQL

> **Em uma frase:** uma função guarda **uma lógica reutilizável** no banco, que você chama dentro de qualquer consulta.

## Função em SQL puro

```sql
CREATE FUNCTION total_do_pedido(p_pedido_id integer)
RETURNS numeric
LANGUAGE sql
AS $$
  SELECT COALESCE(sum(quantidade * preco_unitario), 0)
  FROM itens_pedido
  WHERE pedido_id = p_pedido_id
$$;
```

- `p_pedido_id integer` — o **parâmetro** (o prefixo `p_` evita confusão com nomes de coluna).
- `RETURNS numeric` — o tipo do que ela devolve.
- `$$ ... $$` — delimita o **corpo**, para você não precisar escapar aspas.
- Chame em qualquer lugar: `SELECT total_do_pedido(p.id) FROM pedidos p;`

## PL/pgSQL: com variáveis e decisões

Quando precisa de `IF`, laços, variáveis ou mensagens de erro, use a linguagem procedural do Postgres:

```sql
CREATE FUNCTION baixar_estoque(p_produto text, p_qtd integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  novo integer;
BEGIN
  UPDATE produtos SET estoque = estoque - p_qtd
  WHERE nome = p_produto
  RETURNING estoque INTO novo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não existe', p_produto;
  END IF;

  RETURN novo;
END
$$;
```

- `DECLARE` — variáveis.
- `RETURNING ... INTO novo` — guarda na variável o valor da linha alterada.
- `FOUND` — verdadeiro se o último comando afetou alguma linha.
- `RAISE EXCEPTION 'texto %', valor` — interrompe com um **erro seu** (SQLSTATE `P0001`) e **desfaz** o comando inteiro.
- O `BEGIN ... END` do PL/pgSQL **não** é o `BEGIN` de transação: é só o bloco de código.

## Quando usar

- **Regras de negócio** que precisam valer para **qualquer** sistema que acesse o banco.
- Cálculos repetidos em muitas consultas.

## Cuidados

- Lógica no banco é **mais difícil de versionar e testar** que no código da aplicação. Use com critério.
- Uma função que **altera dados** (como `baixar_estoque`) não deve ser chamada em consultas "de leitura" sem pensar: cada linha avaliada dispara a alteração.

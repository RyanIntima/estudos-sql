import type { Module } from '../../lessons/types'
import { BOSS_STEP_XP } from '../../game/xp'
import { catalog, uses } from '../helpers'
import theoryTudo from './theory/01-tudo-ou-nada.md?raw'
import theoryPedido from './theory/02-fechar-pedido.md?raw'
import theorySavepoint from './theory/03-savepoint.md?raw'

/** O estoque do produto, conferido no banco. */
const estoque = (produto: string, valor: number) =>
  catalog(`O estoque de ${produto} é ${valor}`, `SELECT (SELECT estoque FROM produtos WHERE nome = '${produto}') = ${valor}`, `O estoque de ${produto} não é ${valor}.`)

const IN_TRANSACTION = uses('\\bbegin\\b[\\s\\S]*\\bcommit\\b', 'A transação foi aberta (BEGIN) e confirmada (COMMIT)')

export const m09: Module = {
  id: 'm09',
  title: 'Transações e ACID',
  subtitle: 'BEGIN, COMMIT, ROLLBACK e SAVEPOINT: fechar pedidos sem deixar sujeira',
  emoji: '🔒',
  lessons: [
    {
      id: 'm09-l1',
      title: 'Transações: tudo ou nada',
      summary: 'BEGIN, COMMIT e ROLLBACK, e por que sem COMMIT nada fica gravado.',
      theory: theoryTudo,
      steps: [
        {
          id: 'm09-l1-s1',
          title: 'Teste e desfaça',
          goal: 'Dentro de uma transação, zere o estoque da `Camiseta Básica`, **consulte** o estoque (para ver o zero **dentro** da transação) e **desfaça tudo com `ROLLBACK`**. Depois, o estoque deve continuar o mesmo.',
          context: 'É o jeito seguro de testar um `UPDATE` perigoso: veja o efeito e volte atrás.',
          starter: '-- Escreva a transação inteira neste script\n',
          hints: ['`BEGIN;` ... `ROLLBACK;`', "`BEGIN; UPDATE produtos SET estoque = 0 WHERE nome = 'Camiseta Básica'; SELECT nome, estoque FROM produtos WHERE nome = 'Camiseta Básica'; ROLLBACK;`"],
          solution: `BEGIN;
UPDATE produtos SET estoque = 0 WHERE nome = 'Camiseta Básica';
SELECT nome, estoque FROM produtos WHERE nome = 'Camiseta Básica';
ROLLBACK;`,
          wrong: [
            `BEGIN;
UPDATE produtos SET estoque = 0 WHERE nome = 'Camiseta Básica';
COMMIT;`,
            `UPDATE produtos SET estoque = 0 WHERE nome = 'Camiseta Básica';
ROLLBACK;`,
          ],
          checks: [
            uses('\\bbegin\\b[\\s\\S]*\\brollback\\b', 'Abriu a transação (BEGIN) e a desfez (ROLLBACK)'),
            estoque('Camiseta Básica', 30),
          ],
        },
        {
          id: 'm09-l1-s2',
          title: 'Confirme com COMMIT',
          goal: 'Agora de verdade: numa transação, **dê baixa de 2 unidades** no estoque da `Camiseta Básica` e **confirme**.',
          hints: ['`BEGIN; UPDATE ...; COMMIT;`', "`UPDATE produtos SET estoque = estoque - 2 WHERE nome = 'Camiseta Básica'`"],
          solution: `BEGIN;
UPDATE produtos SET estoque = estoque - 2 WHERE nome = 'Camiseta Básica';
COMMIT;`,
          wrong: [
            `BEGIN;
UPDATE produtos SET estoque = estoque - 2 WHERE nome = 'Camiseta Básica';`,
            `UPDATE produtos SET estoque = estoque - 2 WHERE nome = 'Camiseta Básica';`,
          ],
          checks: [IN_TRANSACTION, estoque('Camiseta Básica', 28)],
        },
        {
          id: 'm09-l1-s3',
          title: 'Esqueci o COMMIT',
          goal: 'Escreva uma transação que dá baixa de **5 unidades** da `Camiseta Básica`, mas **termine o script sem `COMMIT` nem `ROLLBACK`**. Observe o aviso: o SQL Quest desfaz a transação aberta, e o estoque não muda.',
          context: 'Num cliente real, a transação ficaria **aberta**, travando a linha. Aqui o motor faz o `ROLLBACK` por você.',
          hints: ['É só abrir a transação e fazer o `UPDATE`, sem fechar.', "`BEGIN; UPDATE produtos SET estoque = estoque - 5 WHERE nome = 'Camiseta Básica';`"],
          solution: "BEGIN;\nUPDATE produtos SET estoque = estoque - 5 WHERE nome = 'Camiseta Básica';",
          wrong: ["BEGIN;\nUPDATE produtos SET estoque = estoque - 5 WHERE nome = 'Camiseta Básica';\nCOMMIT;"],
          checks: [{ kind: 'lastRunRolledBack', label: 'O script terminou com a transação aberta e o motor a desfez' }, estoque('Camiseta Básica', 28)],
        },
      ],
    },
    {
      id: 'm09-l2',
      title: 'Fechando um pedido',
      summary: 'Várias tabelas numa só transação e o que acontece quando uma etapa falha.',
      theory: theoryPedido,
      steps: [
        {
          id: 'm09-l2-s1',
          title: 'Fechamento atômico',
          goal: `A **Elisa** (CPF \`555.555.555-55\`) comprou, em \`2026-04-01 09:00\`: **2 × Boné** e **1 × Meia**. Numa **única transação**:

1. crie o pedido (status \`pago\`);
2. registre os dois itens (o preço unitário vem do produto);
3. dê baixa no estoque dos dois produtos;
4. confirme.`,
          starter: '-- BEGIN; ... COMMIT;\n',
          hints: [
            'Quatro blocos entre `BEGIN` e `COMMIT`: um `INSERT` de pedido, um `INSERT` de itens, dois `UPDATE` de estoque.',
            "Para os itens use `INSERT ... SELECT ... FROM (VALUES ('Boné', 2), ('Meia', 1)) AS v(produto, qtd) JOIN produtos pr ON pr.nome = v.produto JOIN pedidos p ON p.criado_em = '2026-04-01 09:00'`.",
          ],
          solution: `BEGIN;

INSERT INTO pedidos (cliente_id, criado_em, status)
SELECT id, '2026-04-01 09:00', 'pago' FROM clientes WHERE cpf = '555.555.555-55';

INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
SELECT p.id, pr.id, v.qtd, pr.preco
FROM (VALUES ('Boné', 2), ('Meia', 1)) AS v(produto, qtd)
JOIN produtos pr ON pr.nome = v.produto
JOIN pedidos p ON p.criado_em = '2026-04-01 09:00';

UPDATE produtos SET estoque = estoque - 2 WHERE nome = 'Boné';
UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Meia';

COMMIT;`,
          wrong: [
            `BEGIN;
INSERT INTO pedidos (cliente_id, criado_em, status) SELECT id, '2026-04-01 09:00', 'pago' FROM clientes WHERE cpf = '555.555.555-55';
INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
SELECT p.id, pr.id, v.qtd, pr.preco FROM (VALUES ('Boné', 2), ('Meia', 1)) AS v(produto, qtd)
JOIN produtos pr ON pr.nome = v.produto JOIN pedidos p ON p.criado_em = '2026-04-01 09:00';
COMMIT;`,
          ],
          checks: [
            IN_TRANSACTION,
            catalog(
              'O pedido da Elisa existe, com os dois itens certos',
              `SELECT count(*) = 2 FROM itens_pedido i
               JOIN pedidos p ON p.id = i.pedido_id JOIN clientes c ON c.id = p.cliente_id JOIN produtos pr ON pr.id = i.produto_id
               WHERE c.cpf = '555.555.555-55' AND p.criado_em = '2026-04-01 09:00' AND p.status = 'pago'
                 AND ((pr.nome = 'Boné' AND i.quantidade = 2) OR (pr.nome = 'Meia' AND i.quantidade = 1))`,
              'Confira o cliente, a data, o status e os itens.',
            ),
            estoque('Boné', 23),
            estoque('Meia', 99),
          ],
        },
        {
          id: 'm09-l2-s2',
          title: 'A transação que falha no meio',
          goal: 'Numa transação, dê baixa de **1 `Boné`** e depois de **1000 `Mochila`s** (mais do que há em estoque). A segunda baixa viola o `CHECK`: o banco recusa e **desfaz também a primeira**. Confira que o estoque do Boné **não** mudou.',
          context: 'É o "tudo ou nada" em ação: nenhuma baixa pela metade.',
          starter: '-- BEGIN; ... COMMIT;\n',
          hints: ['Dois `UPDATE`s entre `BEGIN` e `COMMIT`; o segundo vai dar erro.', "`BEGIN; UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Boné'; UPDATE produtos SET estoque = estoque - 1000 WHERE nome = 'Mochila'; COMMIT;`"],
          solution: `BEGIN;
UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Boné';
UPDATE produtos SET estoque = estoque - 1000 WHERE nome = 'Mochila';
COMMIT;`,
          expectError: true,
          wrong: ["UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Boné';"],
          checks: [{ kind: 'lastRunError', code: '23514', label: 'O banco recusou: o estoque não pode ficar negativo (23514)' }, estoque('Boné', 23)],
        },
      ],
    },
    {
      id: 'm09-l3',
      title: 'SAVEPOINT',
      summary: 'Desfazer só uma parte da transação.',
      theory: theorySavepoint,
      steps: [
        {
          id: 'm09-l3-s1',
          title: 'Desfaça só a parte do meio',
          goal: `Numa transação:

1. dê baixa de 1 \`Boné\`;
2. marque um **SAVEPOINT**;
3. dê baixa de 1 \`Mochila\`;
4. **volte ao savepoint** (desfazendo só a baixa da Mochila);
5. dê baixa de 1 \`Meia\`;
6. confirme.

No fim: Boné −1, Mochila **igual**, Meia −1.`,
          starter: '-- BEGIN; ... COMMIT;\n',
          hints: ['`SAVEPOINT nome;` e depois `ROLLBACK TO SAVEPOINT nome;`', "`BEGIN; UPDATE ... 'Boné'; SAVEPOINT s1; UPDATE ... 'Mochila'; ROLLBACK TO SAVEPOINT s1; UPDATE ... 'Meia'; COMMIT;`"],
          solution: `BEGIN;
UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Boné';
SAVEPOINT depois_do_bone;
UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Mochila';
ROLLBACK TO SAVEPOINT depois_do_bone;
UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Meia';
COMMIT;`,
          wrong: [
            `BEGIN;
UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Boné';
UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Mochila';
UPDATE produtos SET estoque = estoque - 1 WHERE nome = 'Meia';
COMMIT;`,
          ],
          checks: [
            uses('\\bsavepoint\\b', 'Usou SAVEPOINT'),
            uses('rollback\\s+to', 'Voltou ao savepoint (ROLLBACK TO)'),
            estoque('Boné', 22),
            estoque('Mochila', 8),
            estoque('Meia', 98),
          ],
        },
      ],
    },
    {
      id: 'm09-boss',
      title: 'Chefão: cancelamento seguro',
      summary: 'Cancelar um pedido e devolver o estoque, tudo ou nada.',
      boss: true,
      theory: `# 👹 Chefão do módulo 9

O atendimento precisa **cancelar um pedido**. Cancelar tem **duas** consequências que não podem acontecer separadas: o pedido muda de status **e** o estoque dos itens volta para a prateleira.

Se só uma delas acontecer, o banco fica **mentindo**. Use uma transação.`,
      steps: [
        {
          id: 'm09-boss-s1',
          title: 'Cancele e devolva ao estoque',
          xp: BOSS_STEP_XP,
          goal: `Cancele o pedido da **Carla** de \`2026-03-02 18:45\` (hoje com status \`novo\`), **numa única transação**:

1. **devolva ao estoque** a quantidade de cada item desse pedido;
2. mude o status do pedido para \`cancelado\`;
3. confirme.

Cuidado: só os produtos **deste pedido** podem ter o estoque alterado.`,
          starter: '-- BEGIN; ... COMMIT;\n',
          hints: [
            'Para somar ao estoque a quantidade de **outra tabela**, o `UPDATE` pode ter `FROM`: `UPDATE produtos pr SET estoque = pr.estoque + i.quantidade FROM itens_pedido i ...`',
            "Ligue o item ao produto e ao pedido no `WHERE`: `i.produto_id = pr.id AND ...` e filtre o pedido pela data.",
            "`UPDATE pedidos SET status = 'cancelado' WHERE criado_em = '2026-03-02 18:45'`",
          ],
          solution: `BEGIN;

UPDATE produtos pr
SET estoque = pr.estoque + i.quantidade
FROM itens_pedido i
JOIN pedidos p ON p.id = i.pedido_id
WHERE i.produto_id = pr.id AND p.criado_em = '2026-03-02 18:45';

UPDATE pedidos SET status = 'cancelado' WHERE criado_em = '2026-03-02 18:45';

COMMIT;`,
          wrong: [
            `BEGIN;
UPDATE pedidos SET status = 'cancelado' WHERE criado_em = '2026-03-02 18:45';
COMMIT;`,
            `BEGIN;
UPDATE produtos SET estoque = estoque + 1;
UPDATE pedidos SET status = 'cancelado' WHERE criado_em = '2026-03-02 18:45';
COMMIT;`,
          ],
          checks: [
            IN_TRANSACTION,
            catalog('O pedido está cancelado', "SELECT count(*) = 1 FROM pedidos WHERE criado_em = '2026-03-02 18:45' AND status = 'cancelado'", 'O status do pedido ainda não é cancelado.'),
            estoque('Mochila', 9),
            estoque('Camiseta Básica', 29),
            catalog('Os outros produtos não foram mexidos', "SELECT (SELECT estoque FROM produtos WHERE nome = 'Boné') = 22 AND (SELECT estoque FROM produtos WHERE nome = 'Meia') = 98", 'Algum produto fora do pedido teve o estoque alterado.'),
          ],
        },
      ],
    },
  ],
}

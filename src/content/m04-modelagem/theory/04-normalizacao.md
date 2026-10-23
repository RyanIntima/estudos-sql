# Normalização: 1FN, 2FN e 3FN

> **Em uma frase:** normalizar é **separar os dados** para que cada fato seja guardado **uma vez só**, no lugar certo.

## 1FN: uma célula, um valor

Cada coluna guarda **um** valor, não uma lista.

```
clientes.telefone = '(11) 98888-0003, (11) 3333-4444'   ← viola a 1FN
```

Problemas: como buscar só o segundo número? E um terceiro? A solução é uma **tabela própria**:

```
telefones (cliente_id, numero, tipo)   -- uma linha por telefone
```

## 2FN: tudo depende da chave inteira

Vale para chaves compostas. Em `itens_pedido (pedido_id, produto_id, ...)`, se existisse a coluna `nome_do_produto`, ela dependeria **só de `produto_id`**, e não do par. Ela pertence à tabela `produtos`.

## 3FN: nada depende de "quem não é chave"

Se `enderecos` guardasse `cep`, `cidade` e `uf`, e a cidade fosse **determinada pelo CEP**, ela dependeria de uma coluna que não é a chave. Num sistema grande, isso vira uma tabela de CEPs.

## A regra prática

> Se você precisa **alterar o mesmo dado em vários lugares**, a tabela não está normalizada.

## Normalizar demais?

Cada separação exige um `JOIN` na leitura. Bancos de **relatório** costumam desnormalizar de propósito para ganhar velocidade. Para sistemas de **venda** como o seu, normalizar até a 3FN é o padrão.

## Migrando dados com segurança

Corrigir o desenho de uma tabela que **já tem dados** segue sempre a mesma ordem:

1. **Criar** a estrutura nova.
2. **Copiar** os dados (`INSERT ... SELECT`).
3. **Conferir** que tudo foi.
4. **Só então** apagar a coluna antiga.

Inverter a ordem apaga dados que não têm volta.

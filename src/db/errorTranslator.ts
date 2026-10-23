import type { SqlError } from './engine'

export interface FriendlyError {
  title: string
  /** Markdown curto: o que aconteceu, em linguagem de gente. */
  explanation: string
  tips: string[]
}

/** Primeiro grupo da regex aplicada à mensagem/detalhe do Postgres (que vêm em inglês). */
const grab = (text: string | undefined, re: RegExp) => text?.match(re)?.[1]

const q = (s: string | undefined) => (s ? `\`${s}\`` : 'esse item')

/**
 * Traduz erros do Postgres (por SQLSTATE) para uma explicação didática.
 * Devolve null para códigos que não conhecemos: a mensagem original é mostrada do jeito que veio.
 */
export function translateError(error: SqlError): FriendlyError | null {
  const { code, message, detail } = error
  switch (code) {
    case '42601': {
      const near = grab(message, /at or near "([^"]*)"/)
      return {
        title: 'Erro de sintaxe',
        explanation: near
          ? `O Postgres não entendeu o SQL perto de ${q(near)}. O erro costuma estar **logo antes** desse ponto.`
          : 'O Postgres não conseguiu entender como o comando foi escrito.',
        tips: [
          'Confira se faltou ou sobrou uma **vírgula** (não vai vírgula depois do último item).',
          'Confira os **parênteses**: cada `(` precisa do seu `)`.',
          'Vários comandos no mesmo script precisam estar separados por `;`.',
          'Veja se alguma palavra-chave (`SELECT`, `FROM`, `WHERE`…) foi escrita errado.',
        ],
      }
    }
    case '42P01': {
      const t = grab(message, /relation "([^"]+)" does not exist/)
      return {
        title: 'Tabela não encontrada',
        explanation: `A tabela ${q(t)} não existe no banco (pelo menos ainda não).`,
        tips: [
          'Confira a **grafia** do nome (o Postgres não perdoa uma letra trocada).',
          'Será que o `CREATE TABLE` já rodou? Olhe o **diagrama** ao lado: se a tabela não aparece lá, ela não existe.',
        ],
      }
    }
    case '42703': {
      const c = grab(message, /column "([^"]+)"/)
      return {
        title: 'Coluna não encontrada',
        explanation: `A coluna ${q(c)} não existe nessa tabela.`,
        tips: ['Veja os nomes exatos das colunas no **diagrama** ou na aba **Dados**.', ...(error.hint ? [`O Postgres sugere: ${error.hint}`] : [])],
      }
    }
    case '42P07': {
      const t = grab(message, /relation "([^"]+)" already exists/)
      return {
        title: 'Esse nome já está em uso',
        explanation: `Já existe uma tabela (ou índice) chamada ${q(t)}.`,
        tips: [
          'Se você já criou a tabela, não precisa criar de novo: use `ALTER TABLE` para mudá-la.',
          'Se quer recomeçar, apague com `DROP TABLE` ou use **Reiniciar passo**.',
        ],
      }
    }
    case '42701': {
      const c = grab(message, /column "([^"]+)"/)
      return {
        title: 'Coluna repetida',
        explanation: `A coluna ${q(c)} já existe nessa tabela.`,
        tips: ['Cada coluna precisa de um nome único dentro da tabela.'],
      }
    }
    case '42P16':
      return {
        title: 'Definição de tabela inválida',
        explanation: 'A estrutura que você descreveu não é permitida. É comum quando se tenta ter **duas chaves primárias** na mesma tabela.',
        tips: ['Uma tabela tem **uma** chave primária (que pode ser composta por várias colunas).'],
      }
    case '23502': {
      const c = grab(message, /null value in column "([^"]+)"/)
      const t = grab(message, /of relation "([^"]+)"/)
      return {
        title: 'Campo obrigatório sem valor',
        explanation: `A coluna ${q(c)}${t ? ` de ${q(t)}` : ''} é **NOT NULL**: não pode ficar vazia, e o comando não informou nenhum valor para ela.`,
        tips: ['Inclua essa coluna no `INSERT` com um valor.', 'Se ela deveria ser opcional, a estrutura da tabela é que precisa mudar (`DROP NOT NULL`).'],
      }
    }
    case '23505': {
      const key = grab(detail, /Key \(([^)]+)\)/)
      const val = grab(detail, /Key \([^)]+\)=\((.*)\) already exists/)
      return {
        title: 'Valor repetido em coluna única',
        explanation: `Já existe uma linha com ${q(key)} = ${q(val)}, e essa coluna só aceita **valores únicos** (PRIMARY KEY ou UNIQUE).`,
        tips: ['Use um valor diferente, ou altere a linha que já existe com `UPDATE`.'],
      }
    }
    case '23503': {
      const key = grab(detail, /Key \(([^)]+)\)/)
      const del = /still referenced/i.test(detail ?? '')
      return {
        title: 'Violação de chave estrangeira',
        explanation: del
          ? `Não dá para apagar (ou alterar) essa linha: **outras tabelas ainda apontam para ela** (${q(key)}).`
          : `O valor de ${q(key)} aponta para uma linha que **não existe** na tabela referenciada.`,
        tips: del
          ? ['Apague ou altere primeiro as linhas que dependem desta.', 'Ou defina `ON DELETE CASCADE` na chave estrangeira, se fizer sentido para o negócio.']
          : ['Cadastre primeiro a linha referenciada (por exemplo, a categoria) e depois a que aponta para ela.'],
      }
    }
    case '23514': {
      const c = grab(message, /check constraint "([^"]+)"/)
      return {
        title: 'Regra CHECK violada',
        explanation: `Os valores não respeitam a regra ${q(c)} definida na tabela.`,
        tips: ['Releia a regra da tabela (por exemplo, `preco > 0`) e ajuste o valor.'],
      }
    }
    case '22001': {
      const type = grab(message, /for type (.+)$/)
      return {
        title: 'Texto grande demais',
        explanation: `O texto não cabe na coluna${type ? ` (tipo ${q(type)})` : ''}.`,
        tips: ['Use um texto menor ou aumente o tamanho da coluna com `ALTER COLUMN ... TYPE`.'],
      }
    }
    case '22P02': {
      const type = grab(message, /for type (\w+)/)
      const val = grab(message, /: "([^"]*)"/)
      return {
        title: 'Valor no formato errado',
        explanation: `${q(val)} não é um valor válido para o tipo ${q(type)}.`,
        tips: ['Números não levam aspas nem letras; datas seguem `\'2026-01-31\'`; textos vão entre aspas simples.'],
      }
    }
    case '22007':
    case '22008':
      return {
        title: 'Data ou hora inválida',
        explanation: 'O valor não é uma data/hora válida.',
        tips: ["Use o formato `'AAAA-MM-DD'`, por exemplo `'1990-05-14'`."],
      }
    case '22012':
      return { title: 'Divisão por zero', explanation: 'Alguma conta tentou dividir por **zero**.', tips: ['Proteja a conta com `NULLIF(divisor, 0)` ou filtre as linhas com divisor zero.'] }
    case '42804':
      return {
        title: 'Tipos incompatíveis',
        explanation: 'O tipo de um valor não combina com o tipo esperado (por exemplo, texto onde se espera número).',
        tips: ['Confira o tipo de cada coluna no diagrama e use valores do mesmo tipo.', 'Se precisar converter, use `CAST(valor AS tipo)`.'],
      }
    case '42883':
      return {
        title: 'Função ou operador não existe para esses tipos',
        explanation: 'O Postgres não conhece essa operação para os tipos usados.',
        tips: ['Confira a grafia da função.', 'Talvez seja preciso converter um dos valores com `CAST`.'],
      }
    case '42803':
      return {
        title: 'Coluna fora do GROUP BY',
        explanation: 'Ao agrupar, toda coluna do `SELECT` precisa estar no `GROUP BY` **ou** dentro de uma função de agregação (`COUNT`, `SUM`…).',
        tips: ['Acrescente a coluna ao `GROUP BY`, ou envolva-a numa agregação.'],
      }
    case '42702':
      return {
        title: 'Nome de coluna ambíguo',
        explanation: 'Mais de uma tabela tem uma coluna com esse nome e o Postgres não sabe qual você quer.',
        tips: ['Prefixe com a tabela (ou o apelido): `clientes.id`.'],
      }
    case '2BP01':
      return {
        title: 'Existem objetos que dependem deste',
        explanation: 'Não dá para apagar: outras estruturas (como chaves estrangeiras ou views) dependem dela.',
        tips: ['Apague primeiro quem depende, ou use `DROP ... CASCADE` sabendo que **ele leva os dependentes junto**.'],
      }
    case '25P02':
      return {
        title: 'Transação com erro',
        explanation: 'Um comando anterior desta transação falhou, então o Postgres ignora os seguintes até você encerrar a transação.',
        tips: ['Rode `ROLLBACK;` para desfazer a transação e começar de novo.'],
      }
    case '42501':
      return { title: 'Sem permissão', explanation: 'Este usuário não tem permissão para fazer isso.', tips: [] }
    default:
      return null
  }
}

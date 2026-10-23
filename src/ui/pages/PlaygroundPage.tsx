import { useState } from 'react'
import { getEngine } from '../../db/instances'
import { useWorkbench } from '../useWorkbench'
import { useProgress } from '../../game/store'
import { useToasts } from '../../game/toasts'
import { achievementById } from '../../game/achievements'
import { Workspace } from '../components/Workspace'

const EXAMPLE = `-- Ctrl+Enter executa. Este é um banco de testes: nada aqui afeta o seu projeto.
CREATE TABLE clientes (
  id    SERIAL PRIMARY KEY,
  nome  VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE
);

INSERT INTO clientes (nome, email) VALUES ('Ana', 'ana@email.com');

SELECT * FROM clientes;
`

export function PlaygroundPage() {
  const [code, setCode] = useState(EXAMPLE)
  const wb = useWorkbench('playground')

  const reset = async () => {
    if (!window.confirm('Apagar todas as tabelas do Playground?')) return
    await (await getEngine('playground')).reset()
    await wb.reload()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-slate-800 px-4 py-1.5 text-sm text-slate-400">
        Playground: um banco de testes, separado do seu projeto.
      </div>
      <Workspace
        code={code}
        onCodeChange={setCode}
        onRun={async () => {
          await wb.run(code)
          for (const id of useProgress.getState().recordPlaygroundRun()) {
            const a = achievementById(id)
            if (a) useToasts.getState().push({ kind: 'achievement', title: `Conquista: ${a.title}`, text: a.description })
          }
        }}
        wb={wb}
        toolbar={
          <button
            onClick={reset}
            disabled={!wb.ready}
            className="ml-auto rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-50"
          >
            Resetar banco
          </button>
        }
      />
    </div>
  )
}

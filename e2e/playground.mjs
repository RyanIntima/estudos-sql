// E2E dos recursos avançados no Playground (Chrome real via CDP): plano EXPLAIN, aviso de ROLLBACK, views/triggers
// no diagrama, Impacto de schema/papel/permissão, explicação e etapa de janela. Leva ~1 min.
// Uso: node e2e/playground.mjs [url] [pasta-de-screenshots]   (padrão: http://localhost:5173/; CHROME_PATH opcional)
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findChrome } from './chrome.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5173/'
const SHOTS = process.argv[3] ?? join(tmpdir(), 'sqlquest-e2e-shots')
mkdirSync(SHOTS, { recursive: true })
const PORT = 9341
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chrome = spawn(findChrome(), [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1440,900',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'e2e-f5-'))}`, 'about:blank',
], { stdio: 'ignore' })

let ws, nextId = 0
const pending = new Map()
const logs = []
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value
}
async function waitFor(expr, label, timeout = 60000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) { if (await evaluate(expr)) return true; await sleep(200) }
  console.log(`   (timeout esperando: ${label})`)
  return false
}
const btn = (label) => `[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(label)}))`
const clickBtn = (label) => evaluate(`(() => { const b = ${btn(label)}; if (!b || b.disabled) return false; b.click(); return true })()`)
const idle = async () => { await sleep(300); await waitFor(`(() => { const b = ${btn('Executar')}; return b && !b.disabled })()`, 'Executar liberar', 120000); await sleep(400) }
async function typeInto(code) {
  await evaluate(`document.querySelector('.cm-content').focus()`)
  const key = { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...key, commands: ['selectAll'] })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
  await send('Input.insertText', { text: code })
  await sleep(250)
}
const runSql = async (sql) => { await typeInto(sql); await clickBtn('Executar'); await idle() }
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, name), Buffer.from(r.result.data, 'base64')) }
const body = () => evaluate('document.body.innerText')
let failed = false
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failed = true }

try {
  let targets
  for (let i = 0; i < 20; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); break } catch { await sleep(500) } }
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text))
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('ERR ' + m.params.args.map((a) => a.value ?? a.description).join(' '))
  }
  await send('Runtime.enable'); await send('Page.enable')
  await send('Page.navigate', { url: BASE + '#/playground' })
  await waitFor(`(() => { const b = ${btn('Executar')}; return b && !b.disabled })()`, 'Playground pronto')

  console.log('\n== Plano de execução ==')
  await runSql('CREATE TABLE visitas (id INT, sessao INT); INSERT INTO visitas SELECT g, g % 5000 FROM generate_series(1, 30000) g; ANALYZE visitas;')
  await typeInto('SELECT * FROM visitas WHERE sessao = 1234;')
  await clickBtn('Plano')
  check(await waitFor(`!!document.querySelector('[data-plan-node]')`, 'plano aparecer', 30000), 'a aba Plano mostra a árvore do plano')
  const root = await evaluate(`document.querySelector('[data-plan-node]')?.dataset.planNode`)
  check(root === 'Seq Scan', `sem índice: leitura sequencial (${root})`)
  check((await evaluate(`document.querySelector('[data-plan-node]')?.dataset.tone`)) === 'warn', 'o nó da leitura sequencial é destacado como alerta')
  check((await body()).includes('Leitura sequencial de visitas') || (await body()).includes('Leitura sequencial'), 'aviso didático sobre a leitura sequencial')
  check(await evaluate(`/Execução: [\\d,.]+ ?ms/.test(document.querySelector('[data-plan-time]')?.textContent ?? '')`), 'mostra o tempo de execução')
  await shot('1-plano-sem-indice.png')

  await runSql('CREATE INDEX idx_visitas_sessao ON visitas (sessao); SELECT * FROM visitas WHERE sessao = 1234;')
  await clickBtn('Plano')
  check(await waitFor(`/Index/.test(document.querySelector('[data-plan-node]')?.dataset.planNode ?? '') || [...document.querySelectorAll('[data-plan-node]')].some(n => /Index/.test(n.dataset.planNode))`, 'plano com índice', 30000), 'com índice: o plano passa a usar o índice')
  check([...(await evaluate(`[...document.querySelectorAll('[data-plan-node]')].map(n => n.dataset.tone)`))].includes('good'), 'o nó do índice é destacado em verde')
  check((await body()).includes('Usou o índice idx_visitas_sessao'), 'a observação confirma o índice usado')
  await shot('2-plano-com-indice.png')

  console.log('\n== Transação desfeita ==')
  await clickBtn('Resultado')
  await runSql('BEGIN; UPDATE visitas SET sessao = 0; SELECT count(*) FROM visitas WHERE sessao = 0;')
  check(await evaluate(`!!document.querySelector('[data-rolled-back]')`), 'script com BEGIN sem COMMIT mostra o aviso de ROLLBACK')
  await runSql('SELECT count(*) AS n FROM visitas WHERE sessao = 0;')
  check(!(await evaluate(`!!document.querySelector('[data-rolled-back]')`)), 'um script comum não mostra o aviso')
  check(/\b6\b/.test(await evaluate(`document.querySelector('tbody')?.textContent ?? ''`)), 'o UPDATE foi desfeito: continuam só 6 linhas com sessao 0 (não 30 mil)')

  console.log('\n== Diagrama: views, triggers; Impacto: schema, papel, permissão ==')
  await runSql(`CREATE TABLE produtos (id INT PRIMARY KEY, nome TEXT, atualizado_em TIMESTAMP);
CREATE VIEW vw_p AS SELECT nome FROM produtos;
CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.atualizado_em := now(); RETURN NEW; END $$;
CREATE TRIGGER trg BEFORE UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION f();
CREATE SCHEMA rel; CREATE ROLE ana NOLOGIN; GRANT USAGE ON SCHEMA rel TO ana;`)
  await clickBtn('Diagrama'); await sleep(1200)
  check((await evaluate(`document.querySelector('[data-view="vw_p"]')?.dataset.viewStatus`)) === 'added', 'a view aparece no diagrama, destacada como nova')
  check((await evaluate(`document.querySelector('[data-trigger="trg"]')?.dataset.triggerStatus`)) === 'added', 'o trigger aparece na tabela, destacado como novo')
  check((await evaluate(`document.querySelectorAll('.react-flow__edge').length`)) >= 1, 'a view é ligada à tabela de que depende')
  await shot('3-diagrama-view-trigger.png')
  await clickBtn('Impacto'); await sleep(400)
  const impact = await body()
  check(impact.includes('Criou a view vw_p') && impact.includes('não guarda dados'), 'Impacto: view')
  check(impact.includes('Criou o trigger trg em produtos') && impact.includes('BEFORE um UPDATE'), 'Impacto: trigger (momento e evento)')
  check(impact.includes('Criou o schema rel'), 'Impacto: schema')
  check(impact.includes('Criou o papel ana'), 'Impacto: papel')
  check(impact.includes('Concedeu USAGE sobre rel ao papel ana'), 'Impacto: permissão')
  check(!impact.includes('Nada mudou'), 'e não diz "Nada mudou no banco"')

  console.log('\n== Explicação e etapa de janela ==')
  await clickBtn('Explicação do código'); await sleep(900)
  const exp = await body()
  check(exp.includes('função de trigger') && exp.includes('Cria o trigger trg'), 'explica a função de trigger e o trigger')
  check(exp.includes('Cria o schema rel') && exp.includes('Concede USAGE'), 'explica schema e GRANT')
  await typeInto('SELECT nome, row_number() OVER (ORDER BY nome) AS n FROM produtos;')
  await clickBtn('Execução')
  check(await waitFor(`!!document.querySelector('[data-stage="window"]')`, 'etapa de janela', 20000), 'a aba Execução mostra a etapa "Funções de janela"')
} catch (e) {
  console.log('SCRIPT ERROR', e)
  failed = true
} finally {
  if (logs.length) console.log('\n--- erros no console da página:\n' + [...new Set(logs)].join('\n'))
  try { ws?.close() } catch {}
  chrome.kill()
  process.exit(failed ? 1 : 0)
}

// E2E do fluxo completo do jogo no Chrome real via CDP (sem dependências): conclui as 60 aulas pela interface,
// confere a Projeto/Conquistas/exportações e a sincronização com o gabarito. Leva ~15 min.
// Uso: node e2e/game.mjs [url]   (padrão: http://localhost:5173/ — rode `npm run dev` antes; CHROME_PATH opcional)
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findChrome } from './chrome.mjs'

const BASE = process.argv[2] ?? 'http://localhost:5173/'
const CHROME = findChrome()
const PORT = 9334
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=1400,900',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'e2e-game-'))}`,
  'about:blank',
], { stdio: 'ignore' })

let ws, nextId = 0
const pending = new Map()
const logs = []
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
  return r.result?.result?.value
}
async function waitFor(expr, label, timeout = 90000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await evaluate(expr)) return true
    await sleep(200)
  }
  console.log(`   (timeout esperando: ${label})`)
  return false
}
const text = () => evaluate('document.body.innerText')
const has = (s) => `document.body.innerText.includes(${JSON.stringify(s)})`
const btn = (label) =>
  `[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(label)}))`
const clickBtn = (label) =>
  evaluate(`(() => { const b = ${btn(label)}; if (!b || b.disabled) return false; b.click(); return true })()`)
const goto = (hash) => evaluate(`location.hash = ${JSON.stringify(hash)}`)
const idle = async () => {
  await sleep(250)
  await waitFor(`(() => { const b = ${btn('Executar')}; return b && !b.disabled })()`, 'botão Executar liberar')
}
// Escreve no editor como o aluno: foco, Ctrl+A e inserção de texto real pelo navegador.
async function typeIntoEditor(code) {
  await evaluate(`document.querySelector('.cm-content').focus()`)
  const key = { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...key, commands: ['selectAll'] })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
  await send('Input.insertText', { text: code })
  await sleep(150)
}

let failed = false
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!ok) failed = true
}
const xpStored = () => evaluate(`JSON.parse(localStorage.getItem('sqlquest-progress') || '{}').state?.xp ?? null`)
const stored = () => evaluate(`JSON.parse(localStorage.getItem('sqlquest-progress') || '{}').state ?? {}`)

async function openPractice(lessonId) {
  // Já estamos na prática desta aula: mudar o hash para o mesmo valor não navega.
  const here = await evaluate(`location.hash === ${JSON.stringify('#/aula/' + lessonId)} && !!${btn('Executar')}`)
  if (here) return true
  await goto(`#/aula/${lessonId}`)
  if (!(await waitFor(has('Praticar →'), `teoria de ${lessonId}`))) return false
  await clickBtn('Praticar →')
  return waitFor(`(() => { const b = ${btn('Executar')}; return b && !b.disabled })()`, 'PGlite pronto')
}

try {
  let targets
  for (let i = 0; i < 20; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); break } catch { await sleep(500) }
  }
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text))
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('ERR ' + m.params.args.map((a) => a.value ?? a.description).join(' '))
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: BASE })
  await waitFor(has('Mapa de fases'), 'mapa')
  await evaluate('window.confirm = () => true')

  console.log('\n== Mapa e bloqueio ==')
  let t = await text()
  check(t.includes('Módulo 0') && t.includes('Módulo 2'), 'mapa lista os módulos')
  check(t.includes('Nv. 1 · Estagiário de Dados'), 'cabeçalho mostra nível 1')
  check(t.includes('🔒'), 'aulas futuras aparecem bloqueadas')
  await goto('#/aula/m00-l2')
  await sleep(500)
  check((await text()).includes('Mapa de fases'), 'abrir aula bloqueada redireciona ao mapa')

  console.log('\n== Aula 1: digitando as respostas (3 estrelas) ==')
  check(await openPractice('m00-l1'), 'teoria -> prática, PostgreSQL pronto')
  check((await text()).includes('Diga olá'), 'primeiro passo exibido')

  await typeIntoEditor("SELECT 'Oi' AS mensagem;")
  await clickBtn('Executar'); await idle()
  await clickBtn('Verificar'); await idle()
  t = await text()
  check(t.includes('✘') && t.includes('Os valores não batem'), 'resposta errada é rejeitada com explicação')
  check(!t.includes('Passo concluído'), 'passo não conclui com resposta errada')

  await typeIntoEditor("SELECT 'Olá, LojaDB!' AS mensagem;")
  await clickBtn('Executar'); await idle()
  check((await text()).includes('Olá, LojaDB!'), 'resultado do SELECT aparece na grade')
  await clickBtn('Verificar'); await idle()
  check((await text()).includes('Passo concluído · +50 XP'), 'resposta certa conclui o passo: +50 XP')

  await clickBtn('Próximo passo')
  await sleep(300)
  await typeIntoEditor('SELECT 19.90 * 3 AS total;')
  await clickBtn('Executar'); await idle()
  await clickBtn('Verificar'); await idle()
  check(await waitFor(has('Aula concluída!'), 'modal de conclusão', 5000), 'modal "Aula concluída!" aparece')
  check((await text()).includes('★★★'), '3 estrelas sem usar ajuda')
  check((await xpStored()) === 100, 'XP total salvo = 100')

  console.log('\n== Aula 2: dica custa XP, verificação sem executar ==')
  check(await openPractice('m00-l2'), 'aula 2 liberada após a 1')
  await clickBtn('Verificar'); await idle()
  check((await text()).includes('Não encontrei isso no código'), 'verificar sem executar explica o que falta')
  await clickBtn('Dica ('); await sleep(200)
  check((await text()).includes('Dica 1:'), 'dica é revelada')
  await typeIntoEditor("-- Mostra o nome da loja\nSELECT 'LojaDB' AS loja;")
  await clickBtn('Executar'); await idle()
  await clickBtn('Verificar'); await idle()
  check((await text()).includes('+40 XP'), 'com 1 dica o passo rende 40 XP (50 − 10)')

  console.log('\n== Currículo inteiro pela UI (via "Ver solução") ==')
  const order = ['m00-l2', 'm00-boss', 'm01-l1', 'm01-l2', 'm01-l3', 'm01-l4', 'm01-boss',
    'm02-l1', 'm02-l2', 'm02-l3', 'm02-l4', 'm02-l5', 'm02-l6', 'm02-boss',
    'm03-l1', 'm03-l2', 'm03-l3', 'm03-l4', 'm03-boss',
    'm04-l1', 'm04-l2', 'm04-l3', 'm04-l4', 'm04-boss',
    'm05-l1', 'm05-l2', 'm05-l3', 'm05-l4', 'm05-boss',
    'm06-l1', 'm06-l2', 'm06-l3', 'm06-boss',
    'm07-l1', 'm07-l2', 'm07-l3', 'm07-l4', 'm07-boss',
    'm08-l1', 'm08-l2', 'm08-l3', 'm08-boss',
    'm09-l1', 'm09-l2', 'm09-l3', 'm09-boss',
    'm10-l1', 'm10-l2', 'm10-l3', 'm10-l4', 'm10-boss',
    'm11-l1', 'm11-l2', 'm11-l3', 'm11-boss',
    'm12-l1', 'm12-l2', 'm12-l3', 'm12-boss']
  for (const id of order) {
    if (!(await openPractice(id))) { check(false, `${id}: abrir prática`); break }
    let n = 0, lessonOk = true
    while (true) {
      // m00-l2 já tem o passo 1 concluído acima; só resolve os pendentes.
      const done = await evaluate(`document.body.innerText.includes('Passo concluído')`)
      if (!done) {
        if (!(await clickBtn('Ver solução'))) { /* passo já concluído em sessão anterior */ }
        else {
          await waitFor(has('Solução de referência'), 'solução')
          await clickBtn('Colocar no editor'); await sleep(200)
          // O botão fica desabilitado enquanto a tela termina o passo anterior (banco grande): espera liberar antes de clicar.
          await idle()
          await clickBtn('Executar'); await idle()
          await clickBtn('Verificar'); await idle()
        }
      }
      n++
      t = await text()
      if (!t.includes('Passo concluído')) {
        console.log(`   falhou em ${id}, passo ${n}:\n` + t.split('\n').filter((l) => /✘|✔|Erro/.test(l)).join('\n'))
        lessonOk = false
        break
      }
      if (!(await clickBtn('Próximo passo'))) break
      await sleep(300)
    }
    if (lessonOk) lessonOk = await waitFor(`${has('Aula concluída!')} || ${has('Chefão derrotado!')}`, `${id} concluir`, 5000)
    check(lessonOk, `${id} concluída pela UI`)
    if (!lessonOk) break
  }

  const s = await stored()
  check(Object.keys(s.lessons ?? {}).length === 60, `60 aulas concluídas no progresso (${Object.keys(s.lessons ?? {}).length})`)
  check(s.xp > 100, `XP acumulado (${s.xp})`)

  console.log('\n== Visualização do banco ao final ==')
  await clickBtn('Dados'); await sleep(800)
  // Com 8 tabelas, a aba Dados abre na primeira (categorias): vai para clientes.
  await evaluate(`[...document.querySelectorAll('button')].find(b => /^clientes\\b/.test(b.textContent.trim()))?.click()`)
  await waitFor(has('Carla Mendes Silva'), 'dados da tabela')
  t = await text()
  check(t.includes('Carla Mendes Silva') && t.includes('Elisa Prado'), 'aba Dados mostra as linhas finais de clientes')
  const cells = await evaluate(`[...document.querySelectorAll('tbody tr:not(.line-through) td')].map(td => td.textContent)`)
  check(cells.includes('Carla Mendes Silva') && !cells.includes('Diego Rocha'), `Diego removido das células das tabelas (células: ${cells.filter(c => /^[A-Z][a-z]+ /.test(c)).join(', ')})`)
  await clickBtn('Diagrama'); await sleep(800)
  check((await evaluate(`document.querySelectorAll('.react-flow__node').length`)) === 14, 'diagrama mostra as 10 tabelas e as 4 views do LojaDB')

  await goto('#/')
  await sleep(500)
  check((await text()).includes('Aulas liberadas: 60/60'), 'mapa mostra 60/60')


  console.log('\n== Página do Projeto: estatísticas, diagrama e exportações ==')
  await evaluate(`window.__downloads = []; const realClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__downloads.push({ name: this.download, href: this.href }); if (!this.href.startsWith('blob:') && !this.href.startsWith('data:')) realClick.call(this) }`)
  await goto('#/projeto')
  await waitFor(`!!document.querySelector('[data-stat="tabelas"]') && document.querySelectorAll('.react-flow__node').length > 0`, 'projeto carregar')
  await sleep(1500)
  const stat = (label) => evaluate(`document.querySelector('[data-stat="${label}"] div')?.textContent`)
  check((await stat('tabelas')) === '10', `Projeto: 10 tabelas (${await stat('tabelas')})`)
  check(Number(await stat('views')) === 4, `Projeto: 4 views, comuns e materializadas (${await stat('views')})`)
  check(Number(await stat('triggers')) === 3, `Projeto: 3 triggers (${await stat('triggers')})`)
  check(Number(await stat('funções')) >= 4, `Projeto: funções contadas (${await stat('funções')})`)
  check(!(await text()).includes('em construção'), 'Projeto: sem o aviso de "em construção" (todas as aulas concluídas)')
  check((await evaluate(`document.querySelectorAll('.react-flow__node').length`)) === 14, 'Projeto: diagrama com 10 tabelas + 4 views')
  check((await evaluate(`document.querySelectorAll('[data-view]').length`)) === 4 && (await evaluate(`document.querySelectorAll('[data-trigger]').length`)) === 3, 'diagrama desenha as views e os triggers')

  await clickBtn('Baixar lojadb.sql')
  await waitFor(`window.__downloads.some(d => d.name === 'lojadb.sql')`, 'download do SQL', 60000)
  const sqlHref = await evaluate(`window.__downloads.find(d => d.name === 'lojadb.sql')?.href`)
  const sqlText = await evaluate(`fetch(${JSON.stringify(sqlHref)}).then(r => r.text())`)
  check(sqlText.includes('CREATE TABLE "clientes"') && sqlText.includes('CREATE TABLE "visitas"'), 'lojadb.sql tem as tabelas')
  check(sqlText.includes('INSERT INTO "clientes"') && sqlText.includes('Carla Mendes Silva'), 'lojadb.sql tem os dados')
  check(sqlText.includes('CREATE TRIGGER') && sqlText.includes('MATERIALIZED VIEW') && sqlText.includes('GRANT SELECT'), 'lojadb.sql tem triggers, views materializadas e permissões')
  check(sqlText.length > 1_000_000, `lojadb.sql inclui as 60 mil visitas (${Math.round(sqlText.length / 1024)} KB)`)

  await clickBtn('Baixar diagrama')
  await waitFor(`window.__downloads.some(d => d.name === 'lojadb-diagrama.png')`, 'download do PNG', 60000)
  const png = await evaluate(`window.__downloads.find(d => d.name === 'lojadb-diagrama.png')?.href`)
  check(png?.startsWith('data:image/png;base64,') && png.length > 20000, `diagrama exportado como PNG (${Math.round((png?.length ?? 0) / 1024)} KB)`)

  console.log('\n== Conquistas ==')
  await goto('#/conquistas')
  await waitFor(`!!document.querySelector('[data-achievement]')`, 'conquistas')
  const unlockedAch = await evaluate(`[...document.querySelectorAll('[data-achievement][data-unlocked="true"]')].map(e => e.dataset.achievement)`)
  console.log('   desbloqueadas:', unlockedAch.join(', '))
  check(unlockedAch.includes('lojadb-completo') && unlockedAch.includes('cacador-de-chefoes'), 'Conquistas: "LojaDB completo" e "Caçador de chefões" desbloqueadas')
  check(['primeira-tabela', 'dados-em-cena', 'integridade-garantida', 'mestre-dos-joins', 'transacao-atomica', 'gatilho-certeiro', 'janela-aberta'].every((id) => unlockedAch.includes(id)), 'Conquistas ligadas a aulas específicas desbloqueadas')
  check(!unlockedAch.includes('explorador') && !unlockedAch.includes('perfeccionista'), 'Conquistas que exigem outra coisa (Playground, 20 aulas com 3 estrelas) continuam bloqueadas')

  console.log('\n== Banco fora do esperado: detectar e sincronizar ==')
  // Zera só o progresso: o banco no IndexedDB continua completo, o que a aula 1 não espera.
  await evaluate(`localStorage.removeItem('sqlquest-progress')`)
  await send('Page.navigate', { url: BASE })
  await waitFor(has('Mapa de fases'), 'mapa após reload')
  await evaluate('window.confirm = () => true')
  check(await openPractice('m00-l1'), 'abrir aula 1 com progresso zerado')
  const drift = await waitFor(has('Seu banco não está como esta aula espera'), 'aviso de divergência', 60000)
  check(drift, 'aviso de banco divergente aparece')
  t = await text()
  check(t.includes('clientes') && t.includes('ainda não deveria existir'), 'aviso explica o que sobra em linguagem clara')
  await clickBtn('Sincronizar com o gabarito')
  const synced = await waitFor(`!${has('Seu banco não está como esta aula espera')} && ${has('Nenhuma tabela ainda')}`, 'sincronização')
  check(synced, 'após sincronizar: aviso some e o diagrama fica vazio')
} catch (e) {
  console.log('SCRIPT ERROR', e)
  failed = true
} finally {
  if (logs.length) console.log('\n--- erros no console da página:\n' + [...new Set(logs)].join('\n'))
  try { ws?.close() } catch {}
  chrome.kill()
  process.exit(failed ? 1 : 0)
}

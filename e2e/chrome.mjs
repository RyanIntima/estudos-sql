import { existsSync } from 'node:fs'

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

/** Caminho do Chrome/Chromium: variável CHROME_PATH ou o primeiro instalado em um local comum. */
export function findChrome() {
  const path = process.env.CHROME_PATH ?? CANDIDATES.find((p) => existsSync(p))
  if (!path) throw new Error('Chrome não encontrado: defina CHROME_PATH com o caminho do executável.')
  return path
}

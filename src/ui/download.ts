/** Baixa um arquivo no navegador: `href` é um data URL ou um blob URL. */
function save(filename: string, href: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function downloadText(filename: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  save(filename, url)
  // O navegador já começou o download: o endereço temporário pode ser liberado.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadDataUrl(filename: string, dataUrl: string) {
  save(filename, dataUrl)
}

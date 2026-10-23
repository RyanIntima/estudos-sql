import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * O libpg-query (parser do Postgres) busca `libpg-query.wasm` relativo à página: em módulo ES o
 * `document.currentScript` é nulo, então o caminho cai na raiz do site. Sem isto o servidor devolve o
 * index.html no lugar do binário e o parser não inicia. Serve o arquivo da dependência em dev e o emite no build.
 */
function libpgQueryWasm(): Plugin {
  const file = fileURLToPath(new URL('./node_modules/libpg-query/wasm/libpg-query.wasm', import.meta.url))
  return {
    name: 'libpg-query-wasm',
    configureServer(server) {
      server.middlewares.use('/libpg-query.wasm', (_req, res) => {
        res.setHeader('Content-Type', 'application/wasm')
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'libpg-query.wasm', source: readFileSync(file) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), libpgQueryWasm()],
  // O PGlite localiza o .wasm por import.meta.url; o pré-bundle do Vite quebra isso.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 180_000,
    // Cada arquivo de teste sobe o seu PGlite; com vários em paralelo o boot passa dos 10 s padrão.
    hookTimeout: 120_000,
  },
})

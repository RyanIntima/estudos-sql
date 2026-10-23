import { describe, expect, it } from 'vitest'
import { replaySolutions } from '../lessons/checkpoint'
import { stepRefs } from '../lessons/registry'
import { createEngine, type Engine } from './engine'
import { exportSql } from './exportSql'
import { diffFingerprints, fingerprint } from './fingerprint'

/** Os dados de todas as tabelas (inclusive timestamps: uma importação fiel os preserva). */
async function dump(e: Engine) {
  const tables = await e.query<{ t: string }>(`SELECT tablename::text AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)
  const out: Record<string, unknown> = {}
  for (const { t } of tables) {
    const [row] = await e.query<{ d: unknown }>(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text), '[]'::jsonb) AS d FROM "${t}" x`)
    out[t] = row.d
  }
  return out
}

describe('exportSql', () => {
  it('round-trip do LojaDB completo: exportar e importar num banco novo dá os mesmos dados e a mesma estrutura', async () => {
    const original = await createEngine()
    const copy = await createEngine()
    try {
      await replaySolutions(original, stepRefs.map((r) => r.step))
      const sql = await exportSql(original, new Date('2026-01-01T00:00:00Z'))

      const imported = await copy.run(sql)
      expect(imported.ok, imported.ok ? '' : `${imported.error.message}\n${imported.error.detail ?? ''}`).toBe(true)

      expect(await dump(copy)).toEqual(await dump(original))
      expect(diffFingerprints(await fingerprint(original), await fingerprint(copy))).toEqual([])
    } finally {
      await original.close()
      await copy.close()
    }
  })

  it('o banco importado continua funcionando: contadores seguem do último id e os triggers estão ativos', async () => {
    const original = await createEngine()
    const copy = await createEngine()
    try {
      await replaySolutions(original, stepRefs.map((r) => r.step))
      await copy.run(await exportSql(original))

      // Um id novo não colide com os importados (a sequência foi reposicionada).
      const novo = await copy.run("INSERT INTO categorias (nome) VALUES ('Brinquedos') RETURNING id")
      expect(novo.ok).toBe(true)
      // Os triggers vieram: mudar o preço grava na auditoria.
      const antes = await copy.query<{ n: number }>('SELECT count(*)::int AS n FROM auditoria_precos')
      await copy.run("UPDATE produtos SET preco = preco + 1 WHERE nome = 'Chinelo'")
      const depois = await copy.query<{ n: number }>('SELECT count(*)::int AS n FROM auditoria_precos')
      expect(depois[0].n).toBe(antes[0].n + 1)
      // As regras vieram: a chave estrangeira e o CHECK ainda barram dado ruim.
      expect((await copy.run("INSERT INTO produtos (categoria_id, nome, preco) VALUES (999999, 'x', 1)")).ok).toBe(false)
      expect((await copy.run("UPDATE produtos SET preco = -1 WHERE nome = 'Meia'")).ok).toBe(false)
    } finally {
      await original.close()
      await copy.close()
    }
  })

  it('banco vazio gera um script válido, só com o cabeçalho', async () => {
    const e = await createEngine()
    try {
      const sql = await exportSql(e)
      expect(sql).toContain('LojaDB')
      expect((await e.run(sql)).ok).toBe(true)
    } finally {
      await e.close()
    }
  })

  it('texto com aspas, acentos e NULL sobrevive à exportação', async () => {
    const a = await createEngine()
    const b = await createEngine()
    try {
      await a.run(`CREATE TABLE t (id SERIAL PRIMARY KEY, nome TEXT, obs TEXT, n NUMERIC(10,2), d DATE, ok BOOLEAN);
        INSERT INTO t (nome, obs, n, d, ok) VALUES ('O''Neill "Zé"', NULL, 12.50, '2026-02-03', true), ('Ação\nlinha 2', 'x', NULL, NULL, false);`)
      await b.run(await exportSql(a))
      expect(await dump(b)).toEqual(await dump(a))
    } finally {
      await a.close()
      await b.close()
    }
  })
})

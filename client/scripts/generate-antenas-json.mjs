import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const inputPhase1Path = path.resolve(__dirname, '../../data/plan-unico-1.csv')
const inputPhase2Path = path.resolve(__dirname, '../../data/plan-unico-2.csv')
const projectOperatorMapPath = path.resolve(__dirname, '../../data/proyecto-operadora-map.json')
const outputPath = path.resolve(__dirname, '../public/data/antenas.json')

function toNumber(value) {
  const normalized = String(value ?? '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '')

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeOperator(value) {
  const raw = String(value ?? '').trim()
  const compact = raw.replace(/\s+/g, ' ').toUpperCase()

  if (compact.includes('UTE ORANGE ESPAGNE') || compact.includes('ORANGE COMUNICACIONES FIJAS')) {
    return 'ORANGE ESPAGNE S.A.'
  }

  if (compact.includes('TELEFONICA MOVIL ES ESPANA') || compact.includes('TELEFÓNICA MÓVIL ES ESPAÑA')) {
    return 'TELEFÓNICA MÓVILES ESPAÑA, S.A.'
  }

  return raw
}

function detectDelimiter(csv) {
  const firstLine = String(csv ?? '')
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) || ''

  const semicolons = (firstLine.match(/;/g) || []).length
  const commas = (firstLine.match(/,/g) || []).length

  return semicolons > commas ? ';' : ','
}

function parseCsvRows(csv) {
  return parse(csv, {
    delimiter: detectDelimiter(csv),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  })
}

function parsePhase1(csv) {
  const rows = parseCsvRows(csv)

  return rows.slice(1).map((row) => {
    const lon = toNumber(row[2])
    const lat = toNumber(row[3])
    if (lon === null || lat === null) {
      return null
    }

    const direccion = row
      .slice(4)
      .filter((value) => typeof value === 'string' && value.length > 0)
      .join(', ')

    const operador = normalizeOperator(row[0])
    return {
      fase: 'Fase 1',
      operador,
      compania: operador,
      provincia: row[1],
      direccion,
      coordenadas: [lon, lat],
    }
  })
}

function parsePhase2(csv, projectOperatorMap) {
  const rows = parseCsvRows(csv)

  return rows.slice(1).map((row) => {
    const lon = toNumber(row[4])
    const lat = toNumber(row[5])
    if (lon === null || lat === null) {
      return null
    }

    const proyecto = String(row[0] ?? '').trim()
    const operador = normalizeOperator(projectOperatorMap[proyecto] ?? proyecto)

    return {
      fase: 'Fase 2',
      proyecto,
      operador,
      compania: operador,
      provincia: row[3],
      direccion: row[1],
      coordenadas: [lon, lat],
    }
  })
}

async function main() {
  const [phase1Csv, phase2Csv, projectOperatorMapRaw] = await Promise.all([
    fs.readFile(inputPhase1Path, 'utf8'),
    fs.readFile(inputPhase2Path, 'utf8'),
    fs.readFile(projectOperatorMapPath, 'utf8'),
  ])

  const projectOperatorMap = JSON.parse(projectOperatorMapRaw)

  const antenas = [...parsePhase1(phase1Csv), ...parsePhase2(phase2Csv, projectOperatorMap)]
    .filter(Boolean)
    .map((antena, index) => ({
      id: index + 1,
      ...antena,
    }))

  const payload = {
    generatedAt: new Date().toISOString(),
    total: antenas.length,
    antenas,
  }

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`JSON generado en ${outputPath} con ${antenas.length} antenas.`)
}

main().catch((error) => {
  console.error('Error generando JSON:', error)
  process.exit(1)
})

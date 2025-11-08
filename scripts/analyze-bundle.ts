#!/usr/bin/env ts-node
import { promises as fs } from 'fs'
import path from 'path'
import { brotliCompressSync, gzipSync } from 'zlib'

interface FileReport {
  file: string
  size: number
  gzipSize: number
  brotliSize: number
}

const DIST_DIR = path.resolve(__dirname, '..', 'dist')
const OUTPUT_JSON = path.join(DIST_DIR, 'bundle-analysis.json')

async function collectFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    const relativePath = path.join(prefix, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, relativePath)))
    } else {
      files.push(relativePath)
    }
  }

  return files
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exponent)

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 2)} ${units[exponent]}`
}

async function analyzeBundle(): Promise<void> {
  try {
    const stats = await fs.stat(DIST_DIR)
    if (!stats.isDirectory()) {
      console.error(`Expected a directory at ${DIST_DIR}`)
      process.exitCode = 1
      return
    }
  } catch {
    console.error('No dist/ directory found. Run "npm run build" before analyzing the bundle.')
    process.exitCode = 1
    return
  }

  const files = await collectFiles(DIST_DIR)
  if (files.length === 0) {
    console.warn('dist/ directory is empty. Did the build complete successfully?')
    return
  }

  const reports: FileReport[] = []

  for (const file of files) {
    const absolutePath = path.join(DIST_DIR, file)
    const buffer = await fs.readFile(absolutePath)

    const gzipBuffer = gzipSync(buffer)
    const brotliBuffer = brotliCompressSync(buffer)

    reports.push({
      file,
      size: buffer.length,
      gzipSize: gzipBuffer.length,
      brotliSize: brotliBuffer.length
    })
  }

  const totals = reports.reduce(
    (acc, report) => {
      acc.size += report.size
      acc.gzipSize += report.gzipSize
      acc.brotliSize += report.brotliSize
      return acc
    },
    { size: 0, gzipSize: 0, brotliSize: 0 }
  )

  const tableData = reports
    .sort((a, b) => b.size - a.size)
    .map((report) => ({
      File: report.file,
      'Raw Size': formatBytes(report.size),
      'Gzip Size': formatBytes(report.gzipSize),
      'Brotli Size': formatBytes(report.brotliSize)
    }))

  console.log('\n📦 Bundle Size Analysis')
  console.log('───────────────────────\n')
  console.table(tableData)
  console.log('Totals:')
  console.log(
    `  Raw: ${formatBytes(totals.size)}\n  Gzip: ${formatBytes(totals.gzipSize)}\n  Brotli: ${formatBytes(totals.brotliSize)}`
  )

  const analysis = {
    generatedAt: new Date().toISOString(),
    totals,
    files: reports
  }

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(analysis, null, 2), 'utf8')
  console.log(`\nSaved detailed report to ${path.relative(process.cwd(), OUTPUT_JSON)}`)
}

analyzeBundle().catch((error) => {
  console.error('Failed to analyze bundle:', error)
  process.exitCode = 1
})

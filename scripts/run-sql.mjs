/**
 * run-sql.mjs - Run SQL files via Supabase Management API
 * Usage: node scripts/run-sql.mjs path/to/file.sql
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env if it exists
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

const PROJECT_REF = 'jditayvwnlxktotfybvk'
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!ACCESS_TOKEN) {
  console.error('Error: SUPABASE_ACCESS_TOKEN not found in .env')
  process.exit(1)
}

const sqlFile = process.argv[2]
if (!sqlFile) {
  console.error('Usage: node scripts/run-sql.mjs path/to/file.sql')
  process.exit(1)
}

const sqlPath = path.resolve(sqlFile)
if (!fs.existsSync(sqlPath)) {
  console.error(`Error: File not found: ${sqlPath}`)
  process.exit(1)
}

const sql = fs.readFileSync(sqlPath, 'utf8')
console.log(`Running SQL from: ${sqlPath}`)
console.log(`SQL length: ${sql.length} characters`)

async function runQuery() {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    })

    const text = await response.text()

    if (!response.ok) {
      console.error(`Error ${response.status}: ${text}`)
      process.exit(1)
    }

    console.log('Success!')
    try {
      const json = JSON.parse(text)
      console.log(JSON.stringify(json, null, 2))
    } catch {
      console.log(text)
    }
  } catch (err) {
    console.error('Request failed:', err.message)
    process.exit(1)
  }
}

runQuery()

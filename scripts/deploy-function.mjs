/**
 * deploy-function.mjs - Deploy edge functions via Supabase Management API
 * Usage: node scripts/deploy-function.mjs <function-name>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env
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

const functionName = process.argv[2]
if (!functionName) {
  console.error('Usage: node scripts/deploy-function.mjs <function-name>')
  process.exit(1)
}

const functionDir = path.join(__dirname, '..', 'supabase', 'functions', functionName)
const indexPath = path.join(functionDir, 'index.ts')

if (!fs.existsSync(indexPath)) {
  console.error(`Error: Function not found at ${indexPath}`)
  process.exit(1)
}

const code = fs.readFileSync(indexPath, 'utf8')
console.log(`Deploying function: ${functionName}`)
console.log(`Code length: ${code.length} characters`)

async function deployFunction() {
  // First, check if function exists
  const listUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`

  try {
    const listRes = await fetch(listUrl, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
    })

    if (!listRes.ok) {
      console.error('Failed to list functions:', await listRes.text())
      process.exit(1)
    }

    const functions = await listRes.json()
    const exists = functions.some(f => f.slug === functionName)

    if (exists) {
      // Update existing function
      console.log('Function exists, updating...')
      const updateUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${functionName}`

      const updateRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verify_jwt: false,
          body: code,
        }),
      })

      if (!updateRes.ok) {
        const error = await updateRes.text()
        console.error(`Update failed: ${error}`)
        process.exit(1)
      }

      console.log('Function updated successfully!')
    } else {
      // Create new function
      console.log('Creating new function...')
      const createUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`

      const createRes = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug: functionName,
          name: functionName,
          verify_jwt: false,
          body: code,
        }),
      })

      if (!createRes.ok) {
        const error = await createRes.text()
        console.error(`Create failed: ${error}`)
        process.exit(1)
      }

      console.log('Function created successfully!')
    }

    console.log(`\nFunction URL: https://${PROJECT_REF}.supabase.co/functions/v1/${functionName}`)
  } catch (err) {
    console.error('Request failed:', err.message)
    process.exit(1)
  }
}

deployFunction()

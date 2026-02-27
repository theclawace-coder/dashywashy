import fs from 'fs'

function loadEnv(filePath) {
  const env = {}
  const content = fs.readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    const value = m[2].trim().replace(/^['"]|['"]$/g, '')
    env[key] = value
  }
  return env
}

const env = loadEnv('.env')
const token = env.SUPABASE_ACCESS_TOKEN
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL

if (!token || !supabaseUrl) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or VITE_SUPABASE_URL/SUPABASE_URL in .env')
  process.exit(1)
}

const projectRefMatch = supabaseUrl.match(/https:\/\/([^.]+)/)
const projectRef = projectRefMatch ? projectRefMatch[1] : null
if (!projectRef) {
  console.error('Could not parse project ref from Supabase URL')
  process.exit(1)
}

async function runQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: sql }),
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }

  if (!res.ok) {
    throw new Error(`${res.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`)
  }

  if (!Array.isArray(data)) return []
  return data
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pick(row, keys) {
  const out = {}
  for (const k of keys) out[k] = row[k]
  return out
}

const durationSecondsArg = Number.parseInt(process.argv[2] || '', 10)
const durationSeconds = Number.isFinite(durationSecondsArg) && durationSecondsArg > 0 ? durationSecondsArg : 60

const start = new Date()
const startIso = start.toISOString()
const endMs = Date.now() + durationSeconds * 1000

const seen = {
  webhook: new Set(),
  emails: new Set(),
  leads: new Set(),
  runs: new Set(),
  steps: new Set(),
  net: new Set(),
}

const counts = {
  webhook: 0,
  emails: 0,
  leads: 0,
  runs: 0,
  steps: 0,
  net: 0,
  clawbotEmails: 0,
  clawbotLeads: 0,
}

console.log('=== LIVE PIPELINE MONITOR START ===')
console.log(`Start time: ${startIso}`)
console.log(`Window: ${durationSeconds} seconds`)
console.log('Stages: outlook-webhook -> dialpad_emails -> extracted_leads -> workflow/AI')

let iteration = 0
while (Date.now() < endMs) {
  iteration += 1

  const sql = {
    webhook: `
      SELECT
        id,
        created_at,
        org_id,
        COALESCE(payload->>'_event_type', '') AS payload_event,
        LEFT(payload::text, 220) AS payload_preview
      FROM webhook_logs
      WHERE created_at >= TIMESTAMPTZ '${startIso}'
        AND (
          payload->>'_source' = 'outlook'
          OR payload->>'_event_type' = 'outlook-webhook'
          OR payload::text ILIKE '%clawbot%'
        )
      ORDER BY created_at ASC
      LIMIT 200;
    `,
    emails: `
      SELECT
        id,
        created_at,
        org_id,
        direction,
        subject,
        from_email,
        to_email,
        CASE WHEN (
          COALESCE(subject,'') || ' ' || COALESCE(from_email,'') || ' ' || COALESCE(to_email,'') || ' ' || COALESCE(body,'')
        ) ILIKE '%clawbot%' THEN true ELSE false END AS contains_clawbot
      FROM dialpad_emails
      WHERE created_at >= TIMESTAMPTZ '${startIso}'
      ORDER BY created_at ASC
      LIMIT 300;
    `,
    leads: `
      SELECT
        id,
        created_at,
        updated_at,
        org_id,
        email_id,
        name,
        email,
        phone_number,
        status,
        CASE WHEN (
          COALESCE(name,'') || ' ' || COALESCE(email,'') || ' ' || COALESCE(region_notes,'')
        ) ILIKE '%clawbot%' THEN true ELSE false END AS contains_clawbot
      FROM extracted_leads
      WHERE created_at >= TIMESTAMPTZ '${startIso}'
         OR updated_at >= TIMESTAMPTZ '${startIso}'
      ORDER BY GREATEST(created_at, COALESCE(updated_at, created_at)) ASC
      LIMIT 300;
    `,
    runs: `
      SELECT
        wr.id,
        wr.created_at,
        wr.org_id,
        wr.status,
        wr.current_step,
        wr.last_error,
        wr.entity_type,
        wr.entity_id,
        wr.metadata->>'trigger_event' AS trigger_event,
        COALESCE(wr.metadata->'new_data'->>'name', '') AS entity_name,
        w.name AS workflow_name,
        w.system_key
      FROM workflow_runs wr
      LEFT JOIN workflows w ON w.id = wr.workflow_id
      WHERE wr.created_at >= TIMESTAMPTZ '${startIso}'
      ORDER BY wr.created_at ASC
      LIMIT 300;
    `,
    steps: `
      SELECT
        run_id,
        step_order,
        action_type,
        status,
        error,
        started_at
      FROM workflow_step_logs
      WHERE started_at >= TIMESTAMPTZ '${startIso}'
      ORDER BY started_at ASC
      LIMIT 500;
    `,
    net: `
      SELECT
        id,
        created,
        status_code,
        error_msg,
        LEFT(content::text, 200) AS content_preview
      FROM net._http_response
      WHERE created >= TIMESTAMPTZ '${startIso}'
      ORDER BY created ASC
      LIMIT 300;
    `,
  }

  const stages = ['webhook', 'emails', 'leads', 'runs', 'steps', 'net']
  for (const stage of stages) {
    try {
      const rows = await runQuery(sql[stage])
      for (const row of rows) {
        const key =
          stage === 'steps'
            ? `${row.run_id}:${row.step_order}:${row.started_at}`
            : String(row.id || row.created_at || JSON.stringify(row))

        if (seen[stage].has(key)) continue
        seen[stage].add(key)
        counts[stage] += 1

        const now = new Date().toISOString()
        if (stage === 'webhook') {
          console.log(`\n[${now}] [OUTLOOK_WEBHOOK]`, JSON.stringify(pick(row, ['id', 'created_at', 'org_id', 'payload_event', 'payload_preview'])))
        }
        if (stage === 'emails') {
          if (row.contains_clawbot) counts.clawbotEmails += 1
          console.log(`\n[${now}] [EMAIL_INGEST]`, JSON.stringify(pick(row, ['id', 'created_at', 'org_id', 'direction', 'subject', 'from_email', 'to_email', 'contains_clawbot'])))
        }
        if (stage === 'leads') {
          if (row.contains_clawbot) counts.clawbotLeads += 1
          console.log(`\n[${now}] [EXTRACTED_LEAD]`, JSON.stringify(pick(row, ['id', 'created_at', 'updated_at', 'org_id', 'email_id', 'name', 'email', 'phone_number', 'status', 'contains_clawbot'])))
        }
        if (stage === 'runs') {
          console.log(`\n[${now}] [AI_AUTO_RUN]`, JSON.stringify(pick(row, ['id', 'created_at', 'org_id', 'status', 'current_step', 'last_error', 'entity_type', 'entity_id', 'trigger_event', 'entity_name', 'workflow_name', 'system_key'])))
        }
        if (stage === 'steps') {
          console.log(`\n[${now}] [AI_AUTO_STEP]`, JSON.stringify(pick(row, ['run_id', 'step_order', 'action_type', 'status', 'error', 'started_at'])))
        }
        if (stage === 'net') {
          console.log(`\n[${now}] [DB_TRIGGER_HTTP]`, JSON.stringify(pick(row, ['id', 'created', 'status_code', 'error_msg', 'content_preview'])))
        }
      }
    } catch (err) {
      console.log(`\n[${new Date().toISOString()}] [WARN:${stage}] ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const secondsLeft = Math.max(0, Math.ceil((endMs - Date.now()) / 1000))
  console.log(`[${new Date().toISOString()}] heartbeat ${iteration} (${secondsLeft}s left)`)
  await sleep(4000)
}

console.log('\n=== LIVE PIPELINE MONITOR END ===')
console.log(
  JSON.stringify(
    {
      started_at: startIso,
      ended_at: new Date().toISOString(),
      counts,
    },
    null,
    2
  )
)

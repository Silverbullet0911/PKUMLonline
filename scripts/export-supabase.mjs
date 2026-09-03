#!/usr/bin/env node
// Export business tables from the old Supabase project as JSON files.
// Profiles/Auth are intentionally NOT exported because passwords cannot be
// moved to D1; recreate users with `npm run user:create`.
//
// Environment:
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=service_role_key
//
// Usage:
//   node scripts/export-supabase.mjs
// Outputs:
//   data/supabase-export/{games,rounds,announcements,unarranged_games,teams}.json

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'data', 'supabase-export')
const tables = ['games', 'rounds', 'announcements', 'unarranged_games', 'teams']

async function main() {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!base || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
    process.exit(1)
  }
  mkdirSync(outDir, { recursive: true })
  for (const table of tables) {
    const url = `${base}/rest/v1/${table}?select=*&limit=10000`
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      console.error(`Failed to fetch ${table}: HTTP ${res.status} ${await res.text()}`)
      process.exit(1)
    }
    const rows = await res.json()
    writeFileSync(join(outDir, `${table}.json`), JSON.stringify(rows, null, 2), 'utf8')
    console.log(`${table}: ${rows.length} rows -> data/supabase-export/${table}.json`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

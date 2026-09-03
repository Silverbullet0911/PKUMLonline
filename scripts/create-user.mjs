#!/usr/bin/env node
// Create or update a D1 user profile outside the browser.
// This is the Route B replacement for the old Supabase Dashboard user setup.
//
// Usage:
//   node scripts/create-user.mjs --email admin@example.com --password '...' --role admin
//   node scripts/create-user.mjs --email captain@example.com --password '...' --role captain --team 樱花
//
// Optional:
//   --display-name "名字"
//   --db local|remote     default local
//
// It executes `wrangler d1 execute pkuml-d1 --<local|remote> --file <tmp.sql>`.
// For an existing user it updates role/team/display_name/password_hash.

import { spawnSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import crypto from 'node:crypto'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = true
    }
  }
  return out
}

function toHex(bytes) {
  return Buffer.from(bytes).toString('hex')
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const iterations = 100000
  const key = await new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 32, 'sha256', (err, derivedKey) => {
      if (err) reject(err)
      else resolve(derivedKey)
    })
  })
  return `pbkdf2$${iterations}$${toHex(salt)}$${toHex(key)}`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const email = String(args.email || '').trim().toLowerCase()
  const password = String(args.password || '')
  const role = String(args.role || '')
  const team = args.team ? String(args.team) : null
  const displayName = args['display-name'] ? String(args['display-name']) : null
  const mode = args.db === 'remote' ? 'remote' : 'local'
  const allowedRoles = ['user', 'admin', 'referee', 'captain']

  if (!email || !password || !allowedRoles.includes(role)) {
    console.error('Usage: node scripts/create-user.mjs --email <email> --password <pass> --role <admin|referee|captain|user> [--team 队伍] [--display-name 名字] [--db local|remote]')
    process.exit(1)
  }
  if (role === 'captain' && !team) {
    console.error('Captain users require --team.')
    process.exit(1)
  }

  const hash = await hashPassword(password)
  const id = crypto.randomUUID()
  const sql = `insert into profiles (id, email, password_hash, role, team, display_name, created_at)
values ('${id}', '${email.replace(/'/g, "''")}', '${hash}', '${role}', ${team ? `'${team.replace(/'/g, "''")}'` : 'null'}, ${displayName ? `'${displayName.replace(/'/g, "''")}'` : 'null'}, datetime('now'))
on conflict (email) do update set
  password_hash = excluded.password_hash,
  role = excluded.role,
  team = excluded.team,
  display_name = excluded.display_name;
`
  const file = join(tmpdir(), `pkuml-create-user-${process.pid}.sql`)
  writeFileSync(file, sql, 'utf8')
  try {
    const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'pkuml-d1', `--${mode}`, '--file', file], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    if (res.status !== 0) process.exit(res.status ?? 1)
  } finally {
    unlinkSync(file)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

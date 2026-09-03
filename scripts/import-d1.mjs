#!/usr/bin/env node
// Import business data exported by scripts/export-supabase.mjs into D1.
// Usage:
//   node scripts/import-d1.mjs [--db local|remote]
//
// Reads data/supabase-export/*.json (games/rounds/announcements/unarranged_games/teams)
// and runs INSERT OR REPLACE statements through:
//   wrangler d1 execute pkuml-d1 --local --file <tmp.sql>

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const exportDir = join(root, 'data', 'supabase-export')
const tables = ['games', 'rounds', 'announcements', 'unarranged_games', 'teams']

const esc = (v) => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}
const jsonCol = (v) => (v === null || v === undefined ? 'null' : `'${JSON.stringify(v).replace(/'/g, "''")}'`)

function gameValues(row) {
  return [
    row.id, row.season, row.stage, row.date, row.time ?? null, row.round ?? null,
    row.status ?? 'upcoming', row.live_status ?? null, row.seats ?? [],
  ]
}
function roundValues(row) {
  return [
    row.id, row.game_id, row.order, row.win_type ?? null, row.riichi ?? [false, false, false, false],
    row.ron_winner ?? null, row.ron_loser ?? null, row.ron_points ?? null,
    row.tsumo_winner ?? null, row.tsumo_points ?? null, row.tenpai ?? null, row.override ?? null,
  ]
}
function announcementValues(row) {
  return [row.id, row.date, row.title, row.category ?? '公告', row.body ?? '']
}
function unarrangedValues(row) {
  return [row.id, row.season, row.stage ?? '常规赛', row.seq, row.seats ?? []]
}
function teamValues(row) {
  return [row.id, row.season, row.name, row.captain ?? null, row.roster ?? []]
}

function insertSql(table, row) {
  switch (table) {
    case 'games':
      return `insert or replace into games (id, season, stage, date, time, round, status, live_status, seats)
values (${gameValues(row).map((v, i) => (i === 8 ? jsonCol(v) : esc(v))).join(', ')});`
    case 'rounds':
      return `insert or replace into rounds (id, game_id, "order", win_type, riichi, ron_winner, ron_loser, ron_points, tsumo_winner, tsumo_points, tenpai, override)
values (${roundValues(row).map((v, i) => ([4, 9, 10, 11].includes(i) ? jsonCol(v) : esc(v))).join(', ')});`
    case 'announcements':
      return `insert or replace into announcements (id, date, title, category, body)
values (${announcementValues(row).map(esc).join(', ')});`
    case 'unarranged_games':
      return `insert or replace into unarranged_games (id, season, stage, seq, seats)
values (${unarrangedValues(row).map((v, i) => (i === 4 ? jsonCol(v) : esc(v))).join(', ')});`
    case 'teams':
      return `insert or replace into teams (id, season, name, captain, roster)
values (${teamValues(row).map((v, i) => (i === 4 ? jsonCol(v) : esc(v))).join(', ')});`
    default:
      return ''
  }
}

async function main() {
  const args = process.argv.slice(2)
  const mode = args.includes('--db') && args[args.indexOf('--db') + 1] === 'remote' ? 'remote' : 'local'
  let sql = 'PRAGMA foreign_keys = ON;\n'
  for (const table of tables) {
    const file = join(exportDir, `${table}.json`)
    if (!existsSync(file)) {
      console.log(`skip ${table}: ${file} not found`)
      continue
    }
    const rows = JSON.parse(readFileSync(file, 'utf8'))
    for (const row of rows) sql += insertSql(table, row) + '\n'
    console.log(`${table}: ${rows.length} rows staged`)
  }
  if (sql === 'PRAGMA foreign_keys = ON;\n') {
    console.log('No data found.')
    return
  }
  const tmp = join(tmpdir(), `pkuml-import-d1-${process.pid}.sql`)
  writeFileSync(tmp, sql, 'utf8')
  try {
    const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'pkuml-d1', `--${mode}`, '--file', tmp], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    if (res.status !== 0) process.exit(res.status ?? 1)
  } finally {
    unlinkSync(tmp)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

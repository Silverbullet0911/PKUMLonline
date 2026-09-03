#!/usr/bin/env node
// Local demo data seeder for Route B.
//
// Generates SQL and runs it through:
//   wrangler d1 execute pkuml-d1 --local --file <tmp.sql>
//
// This guarantees the seed goes to the same local D1 database that the
// `wrangler.toml` config points to (and that `pages:dev` uses).
//
// Usage:
//   npm run seed:demo
//
// Demo accounts (local only):
//   admin@demo.com / admin123    (admin)
//   referee@demo.com / referee123 (referee)
//   captain@demo.com / captain123 (captain, 樱花)

import { spawnSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import crypto from 'node:crypto'

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

const esc = (v) => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}
const json = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'`

async function main() {
  const adminHash = await hashPassword('admin123')
  const refereeHash = await hashPassword('referee123')
  const captainHash = await hashPassword('captain123')

  let sql = ''
  sql += `
insert or replace into profiles (id, email, password_hash, role, team, display_name, created_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@demo.com', '${adminHash}', 'admin', null, '演示管理员', datetime('now')),
  ('00000000-0000-0000-0000-0000000000a2', 'referee@demo.com', '${refereeHash}', 'referee', null, '演示裁判', datetime('now')),
  ('00000000-0000-0000-0000-0000000000a3', 'captain@demo.com', '${captainHash}', 'captain', '樱花', '演示队长', datetime('now'));
`

  sql += `
insert or replace into announcements (id, date, title, category, body) values
  ('00000000-0000-0000-0000-0000000000b1', '2026-09-03', '26-27 赛季演示数据已就绪', '公告', '这是一条演示公告。\\n\\n你可以在后台“公告管理”中修改或删除它。'),
  ('00000000-0000-0000-0000-0000000000b2', '2026-09-01', '常规赛赛程说明', '赛程', '本赛季常规赛共 48 个半庄/队。\\n演示环境只预置少量对局，用于查看前台效果。'),
  ('00000000-0000-0000-0000-0000000000b3', '2026-08-28', '关于选手名单', '名单', '队伍名单真源仍为 data/current_roster.json，后台填选手和队长选人都会读取该静态名单。');
`

  sql += `
insert or replace into unarranged_games (id, season, stage, seq, seats) values
  ('00000000-0000-0000-0000-0000000000c1', '26-27', '常规赛', 1, ${json([
    { seat: '东', team: '凤凰', player: null },
    { seat: '南', team: '雷电', player: null },
    { seat: '西', team: '赤坂', player: null },
    { seat: '北', team: 'AB', player: null },
  ])});
`

  const upcoming = [
    {
      id: '00000000-0000-0000-0000-0000000000d1',
      date: '2026-09-05', round: '第1半庄', time: '14:00', live_status: '直播',
      seats: [
        { seat: '东', team: '海盗', player: null },
        { seat: '南', team: '格斗', player: null },
        { seat: '西', team: '樱花', player: null },
        { seat: '北', team: '火山', player: null },
      ],
    },
    {
      id: '00000000-0000-0000-0000-0000000000d2',
      date: '2026-09-06', round: '第2半庄', time: '18:00', live_status: '非直播',
      seats: [
        { seat: '东', team: '野兽', player: null },
        { seat: '南', team: '地球', player: null },
        { seat: '西', team: '凤凰', player: null },
        { seat: '北', team: '雷电', player: null },
      ],
    },
    {
      id: '00000000-0000-0000-0000-0000000000d3',
      date: '2026-09-07', round: '第3半庄', time: null, live_status: null,
      seats: [
        { seat: '东', team: '赤坂', player: null },
        { seat: '南', team: 'AB', player: null },
        { seat: '西', team: '海盗', player: null },
        { seat: '北', team: '格斗', player: null },
      ],
    },
  ]
  for (const g of upcoming) {
    sql += `insert or replace into games (id, season, stage, date, time, round, status, live_status, seats) values ('${g.id}', '26-27', '常规赛', '${g.date}', ${esc(g.time)}, ${esc(g.round)}, 'upcoming', ${esc(g.live_status)}, ${json(g.seats)});\n`
  }

  const finished = [
    {
      id: '00000000-0000-0000-0000-0000000000e1',
      date: '2026-09-01', round: '第1半庄', time: '14:00', live_status: '直播',
      seats: [
        { seat: '东', team: '海盗', player: 'Art3mis', rank: 1, points: 40000 },
        { seat: '南', team: '格斗', player: '忆水', rank: 2, points: 30000 },
        { seat: '西', team: '樱花', player: '炸洋芋', rank: 3, points: 20000 },
        { seat: '北', team: '火山', player: '桃之11', rank: 4, points: 10000 },
      ],
    },
    {
      id: '00000000-0000-0000-0000-0000000000e2',
      date: '2026-09-02', round: '第2半庄', time: '18:00', live_status: '非直播',
      seats: [
        { seat: '东', team: '野兽', player: 'yfy', rank: 1, points: 35000 },
        { seat: '南', team: '地球', player: 'Hachimi', rank: 2, points: 30000 },
        { seat: '西', team: '凤凰', player: '玖夜', rank: 3, points: 25000 },
        { seat: '北', team: '雷电', player: 'Bywj', rank: 4, points: 10000 },
      ],
    },
    {
      id: '00000000-0000-0000-0000-0000000000e3',
      date: '2026-09-03', round: '第3半庄', time: '14:00', live_status: null,
      seats: [
        { seat: '东', team: '赤坂', player: '元', rank: 1, points: 30000 },
        { seat: '南', team: 'AB', player: '微汐', rank: 2, points: 28000 },
        { seat: '西', team: '海盗', player: '同同', rank: 3, points: 22000 },
        { seat: '北', team: '格斗', player: '小鹿', rank: 4, points: 20000 },
      ],
    },
  ]
  for (const g of finished) {
    sql += `insert or replace into games (id, season, stage, date, time, round, status, live_status, seats) values ('${g.id}', '26-27', '常规赛', '${g.date}', ${esc(g.time)}, ${esc(g.round)}, 'finished', ${esc(g.live_status)}, ${json(g.seats)});\n`
  }

  const tmp = join(tmpdir(), `pkuml-seed-demo-${process.pid}.sql`)
  writeFileSync(tmp, sql, 'utf8')
  try {
    const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'pkuml-d1', '--local', '--file', tmp], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    if (res.status !== 0) process.exit(res.status ?? 1)
  } finally {
    unlinkSync(tmp)
  }

  console.log('Seeded local D1 via wrangler.')
  console.log('Demo accounts:')
  console.log('  admin@demo.com / admin123    (admin)')
  console.log('  referee@demo.com / referee123 (referee)')
  console.log('  captain@demo.com / captain123 (captain, 樱花)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

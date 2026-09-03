import { DatabaseSync } from 'node:sqlite'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
const dir = 'C:/Users/Liucw/Desktop/PKUML_online/.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
for (const name of readdirSync(dir)) {
  if (!name.endsWith('.sqlite')) continue
  const db = new DatabaseSync(join(dir, name), { readOnly: true })
  const has = db.prepare("select name from sqlite_master where type='table' and name='games'").get()
  if (!has) continue
  const games = db.prepare('select count(*) n from games').get().n
  const rounds = db.prepare('select count(*) n from rounds').get().n
  const prof = db.prepare('select count(*) n from profiles').get().n
  console.log('\nDB', name.slice(0,12), {games, rounds, prof})
  const gs = db.prepare('select id, status, date, round from games order by date').all()
  for (const g of gs) {
    const rc = db.prepare('select count(*) n from rounds where game_id=?').get(g.id).n
    const valid = db.prepare('select count(*) n from rounds where game_id=? and win_type is not null').get(g.id).n
    console.log(g.id.slice(0,20), g.status, g.date, g.round, 'rounds', rc, 'valid', valid)
  }
  if (rounds > 0) {
    console.log('round samples', db.prepare('select game_id, "order", win_type, riichi, override from rounds limit 10').all())
  }
}

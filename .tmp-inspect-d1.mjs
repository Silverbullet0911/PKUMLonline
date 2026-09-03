import { DatabaseSync } from 'node:sqlite'
const files = [
  'C:/Users/Liucw/Desktop/PKUML_online/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite',
  'C:/Users/Liucw/Desktop/PKUML_online/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/02e90f9fa8da8dcf7f855db5c82bfabe378d3b80e25a281f8d0991ab152a9327.sqlite',
]
for (const file of files) {
  const db = new DatabaseSync(file, { readOnly: true })
  const tables = db.prepare("select name from sqlite_master where type='table' order by name").all().map(r => r.name)
  console.log(file.slice(-70), 'tables', tables)
  if (tables.includes('d1_migrations')) {
    console.log(' migrations', db.prepare('select * from d1_migrations').all())
  }
}
// metadata
const meta = new DatabaseSync('C:/Users/Liucw/Desktop/PKUML_online/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/metadata.sqlite', { readOnly: true })
console.log('meta tables', meta.prepare("select name from sqlite_master where type='table'").all().map(r=>r.name))
try { console.log('meta rows', meta.prepare('select * from metadata').all()) } catch {}
try { console.log('meta d1', meta.prepare("select name from sqlite_master where type='table' and name like '%d1%'").all()) } catch {}

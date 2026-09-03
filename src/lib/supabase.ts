// Supabase-compatible client shim.
//
// This module deliberately keeps the same object shape as the old Supabase
// JavaScript client used by the pages:
//   supabase.from(table).select().eq().order().single()
//   supabase.rpc(name, args)
//   supabase.auth.getSession() / signInWithPassword() / signOut()
//
// Under the hood every call goes through Cloudflare Pages Functions to D1.
// The API endpoints intentionally return the old snake_case row shapes so the
// existing page code can remain unchanged.

const API_PREFIX = import.meta.env.BASE_URL || '/'
const TOKEN_KEY = 'pkuml_session_token'

async function apiRequest(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_PREFIX}api/${path}`, { ...options, headers })
  let body: any = {}
  try {
    body = await res.json()
  } catch {
    // non-JSON response
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      body,
      error: { message: body?.error?.message || `请求失败（HTTP ${res.status}）` },
    }
  }
  return { ok: true, status: res.status, body }
}

function sessionFromBody(body: any) {
  const s = body?.session
  if (!s) return null
  return {
    access_token: s.access_token,
    user: s.user ?? { id: s.profile?.id, email: s.profile?.email },
    profile: s.profile ?? null,
  }
}

function filterRows(rows: any[], filters: any[]) {
  return rows.filter((row) => {
    for (const f of filters) {
      const col = f.column.replace(/^"|"$/g, '')
      if (f.op === 'eq' && row[col] !== f.value) return false
      if (f.op === 'gt') {
        const a: any = row[col]
        const b: any = f.value
        if (typeof a === 'number' || typeof b === 'number') {
          if (!(Number(a) > Number(b))) return false
        } else if (!(a > b)) return false
      }
      if (f.op === 'is' && f.value === null && row[col] != null) return false
    }
    return true
  })
}

function sortRows(rows: any[], orders: any[]) {
  if (orders.length === 0) return rows
  const sorted = [...rows]
  sorted.sort((a, b) => {
    for (const o of orders) {
      const col = o.column.replace(/^"|"$/g, '')
      const av = a[col]
      const bv = b[col]
      const cmp =
        typeof av === 'number' || typeof bv === 'number'
          ? Number(av) - Number(bv)
          : String(av ?? '').localeCompare(String(bv ?? ''), 'zh-Hans-CN', { numeric: true })
      if (cmp !== 0) return o.ascending ? cmp : -cmp
    }
    return 0
  })
  return sorted
}

async function meProfile() {
  const res = await apiRequest('auth/me')
  if (!res.ok || !res.body?.session) {
    return { data: null, error: { message: '未登录或会话已过期' } }
  }
  return { data: res.body.session.profile, error: null }
}

type QueryFilter = { column: string; value: any; op: 'eq' | 'gt' | 'is' }
type QueryOrder = { column: string; ascending: boolean }

function makeQueryBuilder(table: string) {
  const state: {
    table: string
    mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
    payload: any
    filters: QueryFilter[]
    orders: QueryOrder[]
    limit: number | null
    single: boolean
  } = {
    table,
    mode: 'select',
    payload: null,
    filters: [],
    orders: [],
    limit: null,
    single: false,
  }

  function eq(column: string, value: any) {
    state.filters.push({ column, value, op: 'eq' })
    return builder
  }
  function gt(column: string, value: any) {
    state.filters.push({ column, value, op: 'gt' })
    return builder
  }
  function is(column: string, value: any) {
    state.filters.push({ column, value, op: 'is' })
    return builder
  }
  function order(column: string, opts: { ascending?: boolean } = {}) {
    state.orders.push({ column, ascending: opts.ascending !== false })
    return builder
  }
  function limit(n: number) {
    state.limit = n
    return builder
  }
  function single() {
    state.single = true
    return builder
  }

  function select(_columns?: string) {
    state.mode = 'select'
    return builder
  }
  function insert(rows: any[]) {
    state.mode = 'insert'
    state.payload = rows
    return builder
  }
  function update(payload: any) {
    state.mode = 'update'
    state.payload = payload
    return builder
  }
  function upsert(payload: any, _opts?: any) {
    state.mode = 'upsert'
    state.payload = payload
    return builder
  }
  function deleteFn() {
    state.mode = 'delete'
    return builder
  }

  function findEq(column: string) {
    const f = state.filters.find((x) => x.op === 'eq' && x.column.replace(/^"|"$/g, '') === column)
    return f?.value
  }
  function findOp(op: 'gt' | 'is', column: string) {
    return state.filters.find((x) => x.op === op && x.column.replace(/^"|"$/g, '') === column)
  }

  async function execute() {
    const t = state.table
    try {
      // profiles: the only profile reads are for the current signed-in user.
      if (t === 'profiles' && state.mode === 'select') return meProfile()

      if (state.mode === 'select') {
        let rows: any[] = []
        if (t === 'rounds') {
          const gameId = findEq('game_id')
          if (!gameId) return { data: null, error: { message: 'rounds query requires game_id' } }
          const res = await apiRequest(`games/${encodeURIComponent(String(gameId))}/rounds`)
          if (!res.ok) return { data: null, error: res.error }
          rows = res.body.data ?? []
        } else {
          const paths: Record<string, string> = {
            games: 'games',
            announcements: 'announcements',
            unarranged_games: 'unarranged',
            teams: 'teams',
          }
          const path = paths[t]
          if (!path) return { data: null, error: { message: `unsupported table: ${t}` } }
          const res = await apiRequest(path)
          if (!res.ok) return { data: null, error: res.error }
          rows = res.body.data ?? []
        }

        rows = filterRows(rows, state.filters)
        rows = sortRows(rows, state.orders)
        if (state.limit != null) rows = rows.slice(0, state.limit)

        if (state.single) {
          return rows.length > 0
            ? { data: rows[0], error: null }
            : { data: null, error: { message: '未找到记录' } }
        }
        return { data: rows, error: null }
      }

      // ---- writes ----
      if (state.mode === 'insert' && t === 'rounds') {
        const gameId = state.payload?.game_id ?? findEq('game_id')
        if (!gameId) return { data: null, error: { message: 'round insert requires game_id' } }
        const res = await apiRequest(`games/${encodeURIComponent(String(gameId))}/rounds`, {
          method: 'PUT',
          body: JSON.stringify({ round: state.payload }),
        })
        return { data: res.body.data ?? null, error: res.ok ? null : res.error }
      }

      if (state.mode === 'insert') {
        const row = Array.isArray(state.payload) ? state.payload[0] : state.payload
        const paths: Record<string, string> = {
          games: 'games',
          announcements: 'announcements',
          unarranged_games: 'unarranged',
        }
        const path = paths[t]
        if (!path) return { data: null, error: { message: `unsupported insert: ${t}` } }
        const res = await apiRequest(path, { method: 'POST', body: JSON.stringify(row) })
        return { data: res.body.data ?? null, error: res.ok ? null : res.error }
      }

      if (state.mode === 'update') {
        if (t === 'rounds') {
          const id = findEq('id')
          if (!id) return { data: null, error: { message: 'round update requires id' } }
          const res = await apiRequest(`rounds/${encodeURIComponent(String(id))}`, {
            method: 'PUT',
            body: JSON.stringify(state.payload),
          })
          return { data: res.body.data ?? null, error: res.ok ? null : res.error }
        }
        const paths: Record<string, string> = { games: 'games', announcements: 'announcements', unarranged_games: 'unarranged' }
        const id = findEq('id')
        if (!id || !paths[t]) return { data: null, error: { message: `unsupported update: ${t}` } }
        const res = await apiRequest(`${paths[t]}/${encodeURIComponent(String(id))}`, {
          method: 'PUT',
          body: JSON.stringify(state.payload),
        })
        return { data: res.body.data ?? null, error: res.ok ? null : res.error }
      }

      if (state.mode === 'upsert') {
        const gameId = state.payload?.game_id ?? findEq('game_id')
        if (!gameId) return { data: null, error: { message: 'round upsert requires game_id' } }
        const res = await apiRequest(`games/${encodeURIComponent(String(gameId))}/rounds`, {
          method: 'PUT',
          body: JSON.stringify({ round: state.payload }),
        })
        return { data: res.body.data ?? null, error: res.ok ? null : res.error }
      }

      if (state.mode === 'delete') {
        if (t === 'rounds') {
          const gameId = findEq('game_id')
          if (!gameId) return { data: null, error: { message: 'round delete requires game_id' } }
          let query = ''
          const nullFilter = findOp('is', 'win_type')
          if (nullFilter?.value === null) query = '?winType=null'
          const gtFilter = findOp('gt', '"order"') || findOp('gt', 'order')
          if (gtFilter) query = `?after=${encodeURIComponent(String(gtFilter.value))}`
          const res = await apiRequest(`games/${encodeURIComponent(String(gameId))}/rounds${query}`, { method: 'DELETE' })
          return { data: res.body.data ?? null, error: res.ok ? null : res.error }
        }
        const paths: Record<string, string> = { games: 'games', announcements: 'announcements', unarranged_games: 'unarranged' }
        const id = findEq('id')
        if (!id || !paths[t]) return { data: null, error: { message: `unsupported delete: ${t}` } }
        const res = await apiRequest(`${paths[t]}/${encodeURIComponent(String(id))}`, { method: 'DELETE' })
        return { data: res.body.data ?? null, error: res.ok ? null : res.error }
      }

      return { data: null, error: { message: 'unknown operation' } }
    } catch (e: any) {
      return { data: null, error: { message: e?.message || String(e) } }
    }
  }

  const builder: any = {
    select,
    eq,
    gt,
    is,
    order,
    limit,
    single,
    insert,
    update,
    upsert,
    delete: deleteFn,
    then(resolve: (v: any) => any, reject?: (e: any) => any) {
      return execute().then(resolve, reject)
    },
  }
  return builder
}

async function rpc(name: string, args: any) {
  try {
    let path = ''
    let body: any = {}
    if (name === 'assign_player') {
      path = `games/${encodeURIComponent(String(args.p_game_id))}/assign`
      body = { player: args.p_player }
    } else if (name === 'fill_players') {
      path = `games/${encodeURIComponent(String(args.p_game_id))}/fill-players`
      body = { seats: args.p_seats }
    } else if (name === 'arrange_unarranged') {
      path = `unarranged/${encodeURIComponent(String(args.p_unarranged_id))}/arrange`
      body = {
        date: args.p_date,
        time: args.p_time ?? null,
        round: args.p_round ?? null,
        live_status: args.p_live_status ?? null,
      }
    } else if (name === 'finish_game') {
      path = `games/${encodeURIComponent(String(args.p_game_id))}/finish`
      body = { seats: args.p_seats }
    } else if (name === 'unfinish_game') {
      path = `games/${encodeURIComponent(String(args.p_game_id))}/unfinish`
      body = {}
    } else {
      return { data: null, error: { message: `unsupported rpc: ${name}` } }
    }
    const method = 'POST'
    const res = await apiRequest(path, { method, body: JSON.stringify(body) })
    return { data: res.body.data ?? null, error: res.ok ? null : res.error }
  } catch (e: any) {
    return { data: null, error: { message: e?.message || String(e) } }
  }
}

export const supabase = {
  auth: {
    async getSession() {
      try {
        if (!localStorage.getItem(TOKEN_KEY)) {
          return { data: { session: null } }
        }
        const res = await apiRequest('auth/me')
        if (!res.ok || !res.body?.session) {
          localStorage.removeItem(TOKEN_KEY)
          return { data: { session: null } }
        }
        return { data: { session: sessionFromBody(res.body) } }
      } catch (e: any) {
        return { data: { session: null }, error: { message: e?.message || String(e) } }
      }
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const res = await apiRequest('auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
        if (!res.ok || !res.body?.session) return { error: res.error ?? { message: '登录失败' } }
        localStorage.setItem(TOKEN_KEY, res.body.session.access_token)
        return { error: null, data: { session: sessionFromBody(res.body) } }
      } catch (e: any) {
        return { error: { message: e?.message || String(e) } }
      }
    },
    async signOut() {
      try {
        const res = await apiRequest('auth/logout', { method: 'POST' })
        localStorage.removeItem(TOKEN_KEY)
        return { error: res.ok ? null : res.error }
      } catch (e: any) {
        localStorage.removeItem(TOKEN_KEY)
        return { error: { message: e?.message || String(e) } }
      }
    },
  },
  from(table: string) {
    return makeQueryBuilder(table)
  },
  rpc,
}

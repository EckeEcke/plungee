import { randomInt } from 'node:crypto'
import { Redis } from '@upstash/redis'
import campaign from '../generated/campaign.json'
import { compileLevel, decodeInputs, simulate, type LevelData } from '../../src/sim'

type Difficulty = 'all' | 'easy' | 'medium' | 'hard'
type Rounds = 3 | 5 | 10 | 15
interface Settings { rounds: Rounds; difficulty: Difficulty }
interface RaceResult { ticks: number; deaths: number; replay: string }
interface Round { number: number; levelKey: string; startAt: number; playerIds: string[]; results: Record<string, RaceResult> }
interface State { settings: Settings; readyIds: string[]; started: boolean; revision: number; round: Round | null }
const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/
const ID = /^[a-f0-9-]{36}$/i
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const defaultState = (): State => ({ settings: { rounds: 5, difficulty: 'all' }, readyIds: [], started: false, revision: 0, round: null })
const levels = campaign as Array<{ key: string; difficulty: string; data: LevelData }>

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const body = await request.json() as Record<string, unknown>
    const { code, playerId, action } = body
    if (typeof code !== 'string' || !CODE.test(code) || typeof playerId !== 'string' || !ID.test(playerId)) return json({ error: 'Invalid room or player' }, 400)
    const redis = Redis.fromEnv()
    const hostKey = `plungee:room:${code}:host`
    const membersKey = `plungee:room:${code}:members`
    const stateKey = `plungee:room:${code}:match`
    const host = await redis.get<string>(hostKey)
    if (!host) return json({ error: 'Room expired' }, 404)
    if (!await redis.sismember(membersKey, playerId)) return json({ error: 'Not a room member' }, 403)

    if (action === 'get') {
      const state = await redis.get<State>(stateKey) ?? defaultState()
      const members = await redis.smembers(membersKey) as string[]
      return json({ ...state, readyIds: state.readyIds.filter(id => members.includes(id) && id !== host) })
    }
    if (!['ready', 'settings', 'start', 'finish'].includes(String(action))) return json({ error: 'Invalid action' }, 400)
    if (action === 'ready' && (playerId === host || typeof body.ready !== 'boolean')) return json({ error: 'Invalid ready update' }, 400)
    if ((action === 'settings' || action === 'start') && playerId !== host) return json({ error: 'Host only' }, 403)
    if (action === 'settings') {
      const s = body.settings as Record<string, unknown> | undefined
      if (!s || ![3, 5, 10, 15].includes(Number(s.rounds)) || !['all', 'easy', 'medium', 'hard'].includes(String(s.difficulty))) return json({ error: 'Invalid settings' }, 400)
    }

    if (action === 'finish') {
      const state = await redis.get<State>(stateKey)
      const round = state?.round
      if (!state?.started || !round || !round.playerIds.includes(playerId)) return json({ error: 'No active race' }, 409)
      if (typeof body.replay !== 'string' || body.replay.length > 100000 || body.replay.length === 0) return json({ error: 'Invalid replay' }, 400)
      if (Date.now() < round.startAt) return json({ error: 'Race has not started' }, 409)
      const level = levels.find(l => l.key === round.levelKey)
      if (!level) return json({ error: 'Level not found' }, 500)
      let result: ReturnType<typeof simulate>
      try {
        result = simulate(compileLevel(level.data), decodeInputs(body.replay))
      } catch {
        return json({ error: 'Invalid replay' }, 400)
      }
      if (!result.finished) return json({ error: 'Race not finished' }, 400)
      if (Date.now() + 1000 < round.startAt + result.ticks * (1000 / 60)) return json({ error: 'Run finished before its possible completion time' }, 409)
      const res = await redis.eval(`
        local raw = redis.call('GET', KEYS[1])
        if not raw then return cjson.encode({ error = 'No active race' }) end
        local state = cjson.decode(raw)
        if not state.started or not state.round or state.round.levelKey ~= ARGV[2] then return cjson.encode({ error = 'Race changed' }) end
        local allowed = false
        for _, id in ipairs(state.round.playerIds) do if id == ARGV[1] then allowed = true end end
        if not allowed then return cjson.encode({ error = 'Not a race participant' }) end
        if state.round.results[ARGV[1]] then return cjson.encode(state) end
        state.round.results[ARGV[1]] = { ticks = tonumber(ARGV[3]), deaths = tonumber(ARGV[4]), replay = ARGV[5] }
        state.revision = state.revision + 1
        redis.call('SET', KEYS[1], cjson.encode(state), 'EX', 7200)
        return cjson.encode(state)
      `, [stateKey], [playerId, round.levelKey, String(result.ticks), String(result.deaths), body.replay])
      const updated = typeof res === 'string' ? JSON.parse(res) as State & { error?: string } : res as State & { error?: string }
      return updated.error ? json({ error: updated.error }, 409) : json(updated)
    }

    // The permission check and start transition are atomic, even when requests overlap.
    const current = await redis.get<State>(stateKey) ?? defaultState()
    const difficulty = current.settings.difficulty === 'medium' ? 'normal' : current.settings.difficulty
    const pool = levels.filter(l => difficulty === 'all' || l.difficulty === difficulty)
    if (action === 'start' && !pool.length) return json({ error: 'No levels for difficulty' }, 500)
    const levelKey = action === 'start' ? pool[randomInt(pool.length)].key : ''
    const startAt = action === 'start' ? Date.now() + 7000 : 0
    const result = await redis.eval(`
      local raw = redis.call('GET', KEYS[1])
      local state = raw and cjson.decode(raw) or { settings = { rounds = 5, difficulty = 'all' }, readyIds = cjson.empty_array, started = false, revision = 0, round = cjson.null }
      local host = redis.call('GET', KEYS[3])
      if not host then return cjson.encode({ error = 'Room expired' }) end
      if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 0 then return cjson.encode({ error = 'Not a room member' }) end
      if state.started then return cjson.encode({ error = 'Match already started' }) end
      local members = redis.call('SMEMBERS', KEYS[2])
      local active = {}
      for _, id in ipairs(members) do active[id] = true end
      local ready = {}
      for _, id in ipairs(state.readyIds) do if active[id] and id ~= host then ready[id] = true end end
      if ARGV[2] == 'ready' then
        if ARGV[1] == host then return cjson.encode({ error = 'Host cannot ready' }) end
        ready[ARGV[1]] = ARGV[3] == 'true'
      elseif ARGV[2] == 'settings' then
        if ARGV[1] ~= host then return cjson.encode({ error = 'Host only' }) end
        state.settings = cjson.decode(ARGV[3])
        ready = {}
      elseif ARGV[2] == 'start' then
        if ARGV[1] ~= host then return cjson.encode({ error = 'Host only' }) end
        if state.settings.difficulty ~= ARGV[6] then return cjson.encode({ error = 'Settings changed; retry start' }) end
        local count = 0
        for _, id in ipairs(members) do
          if id ~= host then
            count = count + 1
            if not ready[id] then return cjson.encode({ error = 'Not all players are ready' }) end
          end
        end
        if count == 0 then return cjson.encode({ error = 'At least two players required' }) end
        state.started = true
        table.sort(members)
        state.round = { number = 1, levelKey = ARGV[4], startAt = tonumber(ARGV[5]), playerIds = members, results = {} }
      end
      state.readyIds = cjson.empty_array
      local readyList = {}
      for id, value in pairs(ready) do if value then table.insert(readyList, id) end end
      if #readyList > 0 then state.readyIds = readyList end
      state.revision = (state.revision or 0) + 1
      redis.call('SET', KEYS[1], cjson.encode(state), 'EX', 7200)
      return cjson.encode(state)
    `, [stateKey, membersKey, hostKey], [playerId, action, action === 'ready' ? String(body.ready) : action === 'settings' ? JSON.stringify(body.settings) : '', levelKey, String(startAt), current.settings.difficulty])
    const state = typeof result === 'string' ? JSON.parse(result) as State & { error?: string } : result as State & { error?: string }
    return state.error ? json({ error: state.error }, 409) : json(state)
  } catch (error) {
    console.error('Multiplayer match failed', error)
    return json({ error: 'Match request failed' }, 500)
  }
}

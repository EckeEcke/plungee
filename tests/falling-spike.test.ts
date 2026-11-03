import assert from 'node:assert/strict'
import { test } from 'vitest'
import { World, LevelBuilder, compileLevel, validateLevel, simulate, encodeInputs, decodeInputs, TILE, PLAYER_H, BLINK_HALF, FALLING_SPIKE_WARN_TICKS, type InputDir } from '../src/sim'
import { EditorDoc } from '../src/editor/doc'
import { makeEntity, defaultBrush, TOOLS } from '../src/editor/brush'
import { levelToTs } from '../src/editor/tscode'

function fixture(extra: (b: LevelBuilder) => LevelBuilder = b => b) {
  const data = extra(new LevelBuilder('short').spawn(12, 8).goal(14, 38).fallingSpike(5, 2)).build()
  return new World(compileLevel(data))
}
function putPlayer(world: World, x: number, y: number) { world.p.x = x; world.p.y = y; world.p.vx = 0; world.p.vy = 0 }
function steps(world: World, count: number, dir: InputDir = 0) { for (let i = 0; i < count; i++) world.step(dir as InputDir) }

test('falling spike is one tile, initially hanging, and does not mutate compiled definitions', () => {
  const w = fixture()
  assert.deepEqual(w.level.fallingSpikes, [{ x: 5 * TILE, y: 2 * TILE }])
  steps(w, 8)
  assert.equal(w.fallingSpikes[0].phase, 'hanging')
  assert.equal(w.fallingSpikes[0].y, 2 * TILE)
})
test('moving underneath releases the spike, and it accelerates downward', () => {
  const w = fixture()
  putPlayer(w, 5 * TILE, 12 * TILE)
  w.step(0)
  assert.equal(w.fallingSpikes[0].phase, 'warning')
  assert.equal(w.fallingSpikes[0].y, 2 * TILE)
  steps(w, FALLING_SPIKE_WARN_TICKS)
  assert.equal(w.fallingSpikes[0].phase, 'falling')
  const firstY = w.fallingSpikes[0].y
  const firstVelocity = w.fallingSpikes[0].vy
  w.step(0)
  assert.ok(w.fallingSpikes[0].y > firstY)
  assert.ok(w.fallingSpikes[0].vy > firstVelocity)
  assert.equal(w.level.fallingSpikes[0].y, 2 * TILE)
})
test('player above the spike does not release it', () => {
  const w = fixture()
  putPlayer(w, 5 * TILE + 2, 0)
  w.step(0)
  assert.equal(w.fallingSpikes[0].phase, 'hanging')
})
test('a floor between player and spike prevents activation', () => {
  const w = fixture(b => b.plat(5, 5, 5))
  putPlayer(w, 5 * TILE, 8 * TILE)
  steps(w, 5)
  assert.equal(w.fallingSpikes[0].phase, 'hanging')
})
test('the actual solid phase of a blink block shields the trigger, not the player exception', () => {
  const w = fixture(b => b.plat(5, 5, 5, 'X'))
  putPlayer(w, 5 * TILE, 8 * TILE)
  w.step(0)
  assert.equal(w.fallingSpikes[0].phase, 'hanging')
  w.tick = BLINK_HALF
  w.step(0)
  assert.equal(w.fallingSpikes[0].phase, 'warning')
})
test('falling underside kills a player below, including swept fast movement', () => {
  const w = fixture()
  putPlayer(w, 5 * TILE + 2, 6 * TILE)
  w.p.onGround = true
  w.fallingSpikes[0].phase = 'falling'
  w.fallingSpikes[0].y = 6 * TILE - TILE - 2
  w.fallingSpikes[0].vy = 340
  let cause: string | undefined
  w.onEvent = event => { if (event.type === 'death') cause = event.cause }
  w.step(0)
  assert.equal(w.deaths, 1)
  assert.equal(cause, 'fallingSpike')
})
test('flat top is safe and supports the player', () => {
  const w = fixture()
  putPlayer(w, 5 * TILE + 2, 2 * TILE - PLAYER_H - 1)
  steps(w, 20)
  assert.equal(w.deaths, 0)
  assert.equal(w.p.onGround, true)
  assert.equal(w.p.y + PLAYER_H, w.fallingSpikes[0].y)
})
test('hitting the side is nonlethal', () => {
  const w = fixture()
  putPlayer(w, 5 * TILE - 12 - 0.1, 2 * TILE - 8)
  w.p.vx = 110
  w.step(1)
  assert.equal(w.deaths, 0)
  assert.ok(w.p.x + 12 <= 5 * TILE + 0.01)
})
test('approaching the point from below is lethal without requiring the spike to move', () => {
  const w = fixture()
  putPlayer(w, 5 * TILE + 2, 3 * TILE + 1)
  w.p.vy = -150
  w.step(0)
  assert.equal(w.deaths, 1)
})
test('spike disappears on impact without tunnelling or leaving a collision body', () => {
  const w = fixture(b => b.plat(10, 0, 15))
  w.fallingSpikes[0].phase = 'falling'
  steps(w, 100)
  assert.equal(w.fallingSpikes[0].y + TILE, 10 * TILE)
  assert.equal(w.fallingSpikes[0].phase, 'gone')
  putPlayer(w, 5 * TILE + 2, 8 * TILE)
  steps(w, 20)
  assert.equal(w.p.onGround, true)
  assert.equal(w.p.y + PLAYER_H, 10 * TILE)
  assert.equal(w.deaths, 0)
})
test('falling spike blocks lasers at its current triangle, not its old hanging position', () => {
  const w = fixture(b => b.laser(1, 2, 'r'))
  const laser = w.level.lasers[0]
  const initialWidth = w.laserBeam(laser)!.w
  assert.ok(initialWidth < w.level.width - 2 * TILE)
  w.fallingSpikes[0].y = 8 * TILE
  w.fallingSpikes[0].prevY = 8 * TILE
  assert.equal(w.laserBeam(laser)!.w, w.level.width - 2 * TILE)
})
test('laser upward hits the point and a downward laser hits the flat top', () => {
  const w = fixture(b => b.laser(5, 0, 'd').laser(5, 9, 'u'))
  assert.equal(w.laserBeam(w.level.lasers[0])!.h, TILE)
  assert.equal(w.laserBeam(w.level.lasers[1])!.y, 3 * TILE)
})
test('clones keep independent trap state and replay remains deterministic', () => {
  const w = fixture()
  putPlayer(w, 5 * TILE, 8 * TILE)
  steps(w, 4)
  const clone = w.clone()
  steps(w, FALLING_SPIKE_WARN_TICKS + 5, 1)
  assert.notEqual(w.fallingSpikes[0].y, clone.fallingSpikes[0].y)
  steps(clone, FALLING_SPIKE_WARN_TICKS + 5, 1)
  assert.deepEqual(w.fallingSpikes, clone.fallingSpikes)
  assert.deepEqual(w.p, clone.p)
})
test('respawn resets the trap to its hanging position', () => {
  const w = fixture()
  w.fallingSpikes[0].phase = 'falling'
  w.fallingSpikes[0].y = 100
  w.p.dead = true
  w.p.deadTimer = 1
  w.step(0)
  assert.equal(w.fallingSpikes[0].phase, 'hanging')
  assert.equal(w.fallingSpikes[0].y, 2 * TILE)
})
test('sound events fire once at warning start and once when the spike breaks', () => {
  const w = fixture(b => b.plat(10, 0, 15))
  const events: string[] = []
  w.onEvent = event => events.push(event.type)
  putPlayer(w, 5 * TILE, 8 * TILE)
  w.step(0)
  assert.equal(events.filter(t => t === 'fallingSpikeWarn').length, 1)
  assert.equal(events.includes('fallingSpikeBreak'), false)
  putPlayer(w, 12 * TILE, 8 * TILE)
  steps(w, 100)
  assert.equal(events.filter(t => t === 'fallingSpikeWarn').length, 1)
  assert.equal(events.filter(t => t === 'fallingSpikeBreak').length, 1)
})
test('editor supports placement, selection, undo, serialization, validation and builder export', () => {
  const tool = TOOLS.findIndex(t => t.id === 'fallingSpike')
  assert.equal(TOOLS[tool - 1].id, 'spikes')
  const doc = EditorDoc.createStarter('short')
  assert.equal(doc.place(makeEntity('fallingSpike', 5, 2, defaultBrush())!), true)
  assert.equal(doc.entityAt(5, 2)!.t, 'fallingSpike')
  const data = doc.toLevelData()
  assert.deepEqual(validateLevel(data), [])
  assert.match(levelToTs(data), /b\.fallingSpike\(5, 2\)/)
  doc.undo()
  assert.equal(doc.findEntity('fallingSpike', 5, 2), null)
  doc.redo()
  assert.equal(doc.findEntity('fallingSpike', 5, 2)!.t, 'fallingSpike')
})
test('replay inputs simulate identically on client and server, including trap motion', () => {
  const level = compileLevel(new LevelBuilder('short').spawn(5, 8).goal(7, 9).plat(10, 0, 15).fallingSpike(5, 4).build())
  const inputs = Int8Array.from({ length: 120 }, () => 1)
  const decoded = decodeInputs(encodeInputs(inputs))
  const world = new World(level)
  for (const dir of decoded) world.step(dir as InputDir)
  assert.equal(world.finished, true)
  assert.deepEqual(simulate(level, decoded), { ticks: world.finishTick, deaths: world.deaths, finished: true })
})

import assert from 'node:assert/strict'
import { test } from 'vitest'
import { World, compileLevelUnchecked, simulate, BLINK_HALF, CRUMBLE_DELAY, crusherState, type Dir, type CompiledMover, type InputDir } from '../src/sim'

function setup(dir: Dir = 'r', col = 2, row = 2, tiles: Array<[number, number, string]> = []) {
  const grid = Array.from({ length: 40 }, () => Array(16).fill('.'))
  for (const [x, y, tile] of tiles) grid[y][x] = tile
  const level = compileLevelUnchecked({ v: 1, size: 'short', tiles: grid.map(row => row.join('')),
    entities: [{ t: 'spawn', x: 13, y: 1 }, { t: 'goal', x: 14, y: 38 },
      { t: 'laser', x: col, y: row, dir, period: 120, on: 100, phase: 0 }] })
  const world = new World(level)
  return { level, world, beam: () => world.laserBeam(level.lasers[0]) }
}
const mover = (x0: number, y0: number, x1 = x0, y1 = y0): CompiledMover => ({ col: 0, row: 0, axis: 'v', len: 2, w: 2, x0, y0, x1, y1, period: 120, phase: 0 })

test('laser stops at solid tiles in all four directions', () => {
  assert.deepEqual(setup('r', 2, 2, [[10, 2, '#']]).beam(), { x: 48, y: 38, w: 112, h: 4 })
  assert.deepEqual(setup('l', 10, 2, [[2, 2, '#']]).beam(), { x: 48, y: 38, w: 112, h: 4 })
  assert.deepEqual(setup('d', 2, 2, [[2, 10, '#']]).beam(), { x: 38, y: 48, w: 4, h: 112 })
  assert.deepEqual(setup('u', 2, 10, [[2, 2, '#']]).beam(), { x: 38, y: 48, w: 4, h: 112 })
})
test('immediately blocked beam is null; unobstructed beam reaches the level edge', () => {
  assert.equal(setup('r', 2, 2, [[3, 2, '#']]).beam(), null)
  assert.equal(setup().beam()!.w, 208)
})
test('blink blocks stop the laser only during their solid phase, independently of player exceptions', () => {
  for (const tile of ['X', 'O']) {
    const { world, beam } = setup('r', 2, 2, [[6, 2, tile]])
    assert.equal(beam()!.w, tile === 'X' ? 48 : 208)
    world.tick = BLINK_HALF
    assert.equal(beam()!.w, tile === 'O' ? 48 : 208)
  }
})
test('cracked brittle tiles block; broken tiles let the beam through; regrown tiles block again', () => {
  const { world, beam } = setup('r', 2, 2, [[6, 2, 'B']])
  world.crumble[2 * 16 + 6] = 0
  world.tick = CRUMBLE_DELAY - 1
  assert.equal(beam()!.w, 48)
  world.tick++
  assert.equal(beam()!.w, 208)
  world.crumble[2 * 16 + 6] = -1
  assert.equal(beam()!.w, 48)
})
test('moving platforms block at their actual body, and reveal the beam when they move away', () => {
  const { level, world, beam } = setup()
  level.movers.push(mover(80, 36, 80, 80))
  assert.equal(beam()!.w, 32)
  world.tick = 60
  assert.equal(beam()!.w, 208)
})
test('moving platforms clip vertical beams at sub-tile positions from above and below', () => {
  const down = setup('d')
  down.level.movers.push(mover(32, 83))
  assert.equal(down.beam()!.h, 35)
  const up = setup('u', 2, 10)
  up.level.movers.push(mover(32, 83))
  assert.equal(up.beam()!.y, 91)
  assert.equal(up.beam()!.h, 69)
})
test('crushers shield with their current position rather than their rest position', () => {
  const { level, world, beam } = setup()
  const crusher = { col: 5, row: 5, dir: 'u' as const, size: 2, len: 3, x0: 80, y0: 80, dx: 0, dy: -48, period: 120, phase: 0 }
  level.crushers.push(crusher)
  assert.equal(beam()!.w, 208)
  world.tick = Array.from({ length: 120 }, (_, tick) => tick).find(tick => crusherState(crusher, tick).f === 1)!
  assert.equal(beam()!.w, 32)
})
test('round hammer head blocks at its circumference, not its axis-aligned bounding box', () => {
  const { level, beam } = setup()
  level.hammers.push({ col: 5, row: 0, ax: 88, ay: 8, len: 32, amp: 0, period: 120, phase: 0 })
  assert.equal(beam()!.w, 30)
  level.hammers[0].ay += 8
  assert.ok(Math.abs(beam()!.w - 32) < 1e-9)
})
test('hammer shaft does not block and objects behind the emitter do not block', () => {
  const { level, beam } = setup()
  level.hammers.push({ col: 5, row: 0, ax: 88, ay: 8, len: 96, amp: 0, period: 120, phase: 0 })
  level.movers.push(mover(0, 36))
  assert.equal(beam()!.w, 208)
})
test('hammer heads clip beams in every direction and can fully cover an emitter', () => {
  for (const [dir, ax, ay, expected] of [['r', 200, 120, 46], ['l', 64, 120, 54], ['d', 136, 184, 46], ['u', 136, 48, 54]] as const) {
    const { level, beam } = setup(dir, 8, 8)
    level.hammers.push({ col: 0, row: 0, ax, ay, len: 16, amp: 0, period: 120, phase: 0 })
    const b = beam()
    assert.ok(b)
    assert.equal(dir === 'r' || dir === 'l' ? b.w : b.h, expected)
  }
  const covered = setup('r', 8, 8)
  covered.level.hammers.push({ col: 0, row: 0, ax: 144, ay: 120, len: 16, amp: 0, period: 120, phase: 0 })
  assert.equal(covered.beam(), null)
})
test('visual interpolation uses the exact drawn platform position without changing the simulation beam', () => {
  const { level, world, beam } = setup()
  level.movers.push(mover(80, 36, 112, 36))
  const renderTime = 30.5
  const platformX = 80 + 32 * (0.5 - 0.5 * Math.cos(renderTime / 120 * 2 * Math.PI))
  assert.ok(Math.abs(world.laserBeam(level.lasers[0], renderTime, renderTime)!.w - (platformX - 48)) < 0.01)
  assert.equal(beam()!.w, 32)
})
test('directional gate tiles block only their solid side', () => {
  for (const [tile, blocked, open] of [['=', 'd', 'u'], ['v', 'u', 'd'], ['{', 'r', 'l'], ['}', 'l', 'r']] as const) {
    const a = setup(blocked, 8, 8, [[8 + (blocked === 'r' ? 1 : blocked === 'l' ? -1 : 0), 8 + (blocked === 'd' ? 1 : blocked === 'u' ? -1 : 0), tile]])
    assert.equal(a.beam(), null)
    const b = setup(open, 8, 8, [[8 + (open === 'r' ? 1 : open === 'l' ? -1 : 0), 8 + (open === 'd' ? 1 : open === 'u' ? -1 : 0), tile]])
    assert.notEqual(b.beam(), null)
  }
})
test('nearest obstacle wins and per-world beam calculation never mutates shared compiled data', () => {
  const { level, world, beam } = setup('r', 2, 2, [[10, 2, '#'], [6, 2, 'X']])
  const other = new World(level)
  world.tick = BLINK_HALF
  assert.equal(beam()!.w, 112)
  assert.equal(other.laserBeam(level.lasers[0])!.w, 48)
  assert.equal(world.clone().laserBeam(level.lasers[0])!.w, 112)
})
test('actual player collision uses the clipped beam, not the original full route', () => {
  for (const shielded of [false, true]) {
    const { level, world } = setup()
    if (shielded) level.movers.push(mover(80, 36))
    world.p.x = 112
    world.p.y = 32
    world.step(0)
    assert.equal(world.deaths, shielded ? 0 : 1)
  }
})
test('server replay simulation and incremental world steps give identical deaths and time', () => {
  const { level } = setup('r', 2, 2, [[6, 2, 'X']])
  level.movers.push(mover(80, 36, 80, 80))
  const world = new World(level)
  const inputs = Int8Array.from({ length: 500 }, (_, tick) => tick % 90 < 45 ? -1 : 1)
  for (const dir of inputs) world.step(dir as InputDir)
  assert.deepEqual(simulate(level, inputs), { finished: world.finished, ticks: world.finished ? world.finishTick : world.tick, deaths: world.deaths })
})

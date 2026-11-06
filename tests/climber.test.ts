import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { InputDir, TileChar } from '../src/sim'
import type { Particles } from '../src/game/particles'
const { World, LevelBuilder, compileLevel, TILE, PLAYER_W, PLAYER_H, BELT_SPEED, simulate, encodeInputs, decodeInputs } = await import('../src/sim/index')
const { climberPose } = await import('../src/game/beltPose')
const { Renderer } = await import('../src/game/renderer')
const { MEMPHIS_DARK } = await import('../src/game/theme')

function fixture(direction: InputDir = 1, kind: TileChar = 'C') {
  const world = new World(compileLevel(new LevelBuilder('short').spawn(7, 12).goal(14, 38)
    .wall(8, 5, 15, kind).plat(39, 0, 15).build()))
  world.p.x = direction === 1 ? 8 * TILE - PLAYER_W : 9 * TILE
  world.p.y = 12 * TILE
  return world
}

for (const direction of [-1, 1] as const) {
  test(`climbing pose ${direction} keeps the wall edge fixed throughout its subtle pulse`, () => {
    const widths = new Set()
    for (let frame = 0; frame < 120; frame++) {
      const pose = climberPose(frame / 60, direction)
      assert.ok(pose.sx > 0.88 && pose.sx < 0.92)
      assert.ok(pose.sy > 1.03 && pose.sy < 1.05)
      assert.ok(Math.abs(pose.anchorX + direction * PLAYER_W / 2 * pose.sx - direction * PLAYER_W / 2) < 1e-10)
      assert.ok(Math.abs(pose.anchorY - PLAYER_H / 2 * pose.sy - PLAYER_H / 2) < 1e-10)
      widths.add(pose.sx)
    }
    assert.ok(widths.size > 1)
  })

  test(`climber contact ${direction} bursts once at the wall and again after reattaching`, () => {
    const w = fixture(direction)
    const bursts: Parameters<Particles['burst']>[] = []
    const renderer = { theme: MEMPHIS_DARK, particles: { burst: (...args: Parameters<Particles['burst']>) => bursts.push(args) } }
    w.onEvent = event => {
      if (event.type === 'climberAttach') Renderer.prototype.handleEvent.call(renderer as unknown as InstanceType<typeof Renderer>, event, w)
    }
    for (let i = 0; i < 30; i++) w.step(direction)
    assert.equal(bursts.length, 1)
    assert.equal(bursts[0][0], w.p.x + (direction > 0 ? PLAYER_W : 0))
    assert.equal(bursts[0][2], 4)
    assert.deepEqual(bursts[0][3].colors, [MEMPHIS_DARK.help, MEMPHIS_DARK.help2])
    assert.equal(bursts[0][3].shape, 'star')
    assert.equal(bursts[0][3].life, 0.25)
    w.step(0)
    w.step(direction)
    assert.equal(bursts.length, 2)
  })

  test(`climber side ${direction}: climbs across tile seams only while pressing in`, () => {
    const w = fixture(direction)
    const y = w.p.y
    for (let i = 0; i < 30; i++) w.step(direction)
    assert.equal(w.climbing, direction)
    assert.equal(w.p.vy, -BELT_SPEED)
    assert.equal(w.p.y, y - 30)
    const clone = w.clone()
    clone.step(direction)
    w.step(direction)
    assert.deepEqual(clone.p, w.p)
    const beforeRelease = w.p.y
    w.step(0)
    assert.equal(w.climbing, 0)
    assert.ok(w.p.y > beforeRelease, 'releasing must fall immediately')
  })

  test(`climber side ${direction}: steering away detaches and falls immediately`, () => {
    const w = fixture(direction)
    w.step(direction)
    const { x, y } = w.p
    w.step(-direction as InputDir)
    assert.equal(w.climbing, 0)
    assert.ok((w.p.x - x) * direction < 0)
    assert.ok(w.p.y > y)
  })
}

test('ordinary walls and stun cannot activate climbing', () => {
  const ordinary = fixture(1, '#')
  ordinary.step(1)
  assert.equal(ordinary.climbing, 0)
  assert.ok(ordinary.p.vy > 0)
  const stunned = fixture()
  stunned.p.stun = 5
  stunned.step(1)
  assert.equal(stunned.climbing, 0)
  assert.ok(stunned.p.vy > 0)
})

test('top is solid and underside never attaches', () => {
  const w = fixture()
  w.p.x = 8 * TILE + 2
  w.p.y = 5 * TILE - PLAYER_H
  w.step(0)
  assert.equal(w.p.onGround, true)
  assert.equal(w.climbing, 0)
  w.p.y = 16 * TILE
  w.p.vy = -120
  w.step(0)
  assert.equal(w.p.y, 16 * TILE)
  assert.equal(w.ceilingBelt, 0)
  assert.equal(w.climbing, 0)
})

test('holding towards the wall lets the player crest its top', () => {
  const w = fixture()
  for (let i = 0; i < 180 && w.p.x <= 8 * TILE - PLAYER_W; i++) w.step(1)
  assert.ok(w.p.x > 8 * TILE - PLAYER_W, 'must move onto the block instead of oscillating at the edge')
  assert.ok(w.p.y <= 5 * TILE - PLAYER_H)
})

test('touching a climber without input falls, and a ceiling blocks ascent', () => {
  const idle = fixture()
  const y = idle.p.y
  idle.step(0)
  assert.equal(idle.climbing, 0)
  assert.ok(idle.p.y > y)
  const level = compileLevel(new LevelBuilder('short').spawn(7, 12).goal(14, 38)
    .wall(8, 5, 15, 'C').plat(7, 6, 7).plat(39, 0, 15).build())
  const w = new World(level)
  for (let i = 0; i < 150; i++) w.step(1)
  assert.equal(w.p.y, 8 * TILE)
  assert.equal(w.p.vy, 0)
})

test('a finished climbing replay verifies identically from encoded inputs', () => {
  const level = compileLevel(new LevelBuilder('short').spawn(7, 12).goal(7, 6)
    .wall(8, 5, 15, 'C').plat(39, 0, 15).build())
  const w = new World(level)
  const inputs: InputDir[] = []
  for (let i = 0; i < 240 && !w.finished; i++) {
    inputs.push(1)
    w.step(1)
  }
  assert.equal(w.finished, true)
  assert.deepEqual(simulate(level, decodeInputs(encodeInputs(inputs))), {
    finished: true, ticks: w.finishTick, deaths: w.deaths,
  })
})

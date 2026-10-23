import { describe, expect, it } from 'vitest'
import { SFX, audioSettings, duckMusic, initAudio, playSfx, setLoop, startMusic, stopAllLoops, stopMusic, toggleAllSound } from '../src/audio/audio'

describe('Audio ohne Browser-Audio', () => {
  it('alle Aufrufe sind stumme No-Ops und werfen nicht', () => {
    expect(() => {
      initAudio()
      playSfx('click')
      playSfx('death', 0.5)
      setLoop('ice', true)
      setLoop('ice', false)
      stopAllLoops()
      startMusic()
      duckMusic(10)
      stopMusic()
    }).not.toThrow()
  })

  it('jeder Effekt hat einen Dateinamen, geteilte Dateien sind gewollt (Editor: place = click, erase = crumble)', () => {
    for (const c of Object.values(SFX)) expect(c.file).toMatch(/^[a-z-]+$/)
    expect(SFX.place.file).toBe('click')
    expect(SFX.erase.file).toBe(SFX.crumble.file)
    expect(SFX.blink.file).toBe('blink-switch')
  })

  it('Schnellschalter: erst alles aus, dann alles an', () => {
    audioSettings.sfx = true
    audioSettings.music = false
    toggleAllSound()
    expect([audioSettings.sfx, audioSettings.music]).toEqual([false, false])
    toggleAllSound()
    expect([audioSettings.sfx, audioSettings.music]).toEqual([true, true])
  })
})
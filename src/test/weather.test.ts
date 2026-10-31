import { describe, expect, it } from 'vitest'
import { AUTO_DEFAULT, budget, createState, resolveMode, shouldAnimate, step } from '@/features/hero/weather'

describe('weather ambience engine', () => {
  it('Auto resolves to the documented default when no weather source is connected', () => {
    expect(resolveMode('auto')).toBe(AUTO_DEFAULT)
    expect(resolveMode('auto', 'dust')).toBe('dust') // only a real connected source may override
    expect(resolveMode('clear')).toBe('clear')
  })
  it('Clear, reduced motion, off-screen and hidden tabs stop the loop', () => {
    const base = { reducedMotion: false, inView: true, pageVisible: true }
    expect(shouldAnimate({ ...base, mode: 'rain' })).toBe(true)
    expect(shouldAnimate({ ...base, mode: 'dust' })).toBe(true)
    expect(shouldAnimate({ ...base, mode: 'clear' })).toBe(false)
    expect(shouldAnimate({ ...base, mode: 'rain', reducedMotion: true })).toBe(false)
    expect(shouldAnimate({ ...base, mode: 'rain', inView: false })).toBe(false)
    expect(shouldAnimate({ ...base, mode: 'rain', pageVisible: false })).toBe(false)
  })
  it('uses bounded pools, smaller on phones and with data saver', () => {
    const desk = budget({ width: 1440, saveData: false }), phone = budget({ width: 390, saveData: false }), saver = budget({ width: 390, saveData: true })
    expect(phone.drops).toBeLessThan(desk.drops)
    expect(saver.drops).toBeLessThan(phone.drops)
    const s = createState(1440, 900, desk)
    expect(s.drops).toHaveLength(desk.drops)
    for (let i = 0; i < 600; i++) step(s, 'rain', 1 / 60)
    expect(s.drops).toHaveLength(desk.drops) // recycled, never grows
    expect(s.splashes).toHaveLength(desk.splashes)
    expect(s.drops.every((d) => d.y <= 900 * 1.0 + 1)).toBe(true)
  })
  it('clear mode does not move particles', () => {
    const s = createState(800, 600, budget({ width: 800, saveData: false }))
    const before = JSON.stringify(s.drops.slice(0, 5))
    step(s, 'clear', 0.5)
    expect(JSON.stringify(s.drops.slice(0, 5))).toBe(before)
  })
})

import { describe, it, expect } from 'vitest'

describe('Home Component', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2)
  })

  it('should have string methods working', () => {
    expect('Hello World').toContain('Hello')
  })
})
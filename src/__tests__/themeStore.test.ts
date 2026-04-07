import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// 每次测试前清空 localStorage 和 Zustand store
beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

describe('themeStore', () => {
  it('defaults to dark theme', async () => {
    const { useThemeStore } = await import('@/stores/themeStore')
    const { result } = renderHook(() => useThemeStore())
    expect(result.current.theme).toBe('dark')
  })

  it('toggleTheme switches dark→light', async () => {
    const { useThemeStore } = await import('@/stores/themeStore')
    const { result } = renderHook(() => useThemeStore())
    act(() => { result.current.toggleTheme() })
    expect(result.current.theme).toBe('light')
  })

  it('toggleTheme switches light→dark', async () => {
    const { useThemeStore } = await import('@/stores/themeStore')
    const { result } = renderHook(() => useThemeStore())
    act(() => { result.current.toggleTheme() })
    act(() => { result.current.toggleTheme() })
    expect(result.current.theme).toBe('dark')
  })

  it('setTheme persists to localStorage', async () => {
    const { useThemeStore } = await import('@/stores/themeStore')
    const { result } = renderHook(() => useThemeStore())
    act(() => { result.current.setTheme('light') })
    expect(localStorage.getItem('serverhub-theme')).toBe('light')
  })

  it('reads initial theme from localStorage', async () => {
    localStorage.setItem('serverhub-theme', 'light')
    const { useThemeStore } = await import('@/stores/themeStore')
    const { result } = renderHook(() => useThemeStore())
    expect(result.current.theme).toBe('light')
  })

  it('setTheme("light") sets data-theme attribute on <html>', async () => {
    const { useThemeStore } = await import('@/stores/themeStore')
    const { result } = renderHook(() => useThemeStore())
    act(() => { result.current.setTheme('light') })
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('setTheme("dark") removes data-theme attribute from <html>', async () => {
    localStorage.setItem('serverhub-theme', 'light')
    const { useThemeStore } = await import('@/stores/themeStore')
    const { result } = renderHook(() => useThemeStore())
    act(() => { result.current.setTheme('dark') })
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

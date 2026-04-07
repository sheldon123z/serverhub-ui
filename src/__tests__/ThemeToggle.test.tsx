import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TopBar from '@/components/TopBar'
import { useThemeStore } from '@/stores/themeStore'

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  // Reset Zustand store to dark (default) between tests
  useThemeStore.setState({ theme: 'dark' })
  // Mock matchMedia for themeStore
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
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

describe('TopBar theme toggle', () => {
  it('renders theme toggle button', () => {
    render(<TopBar title="测试" />, { wrapper: Wrapper })
    expect(screen.getByRole('button', { name: /切换.*主题|theme/i })).toBeInTheDocument()
  })

  it('clicking toggle changes data-theme to light', () => {
    render(<TopBar title="测试" />, { wrapper: Wrapper })
    const btn = screen.getByRole('button', { name: /切换.*主题|theme/i })
    fireEvent.click(btn)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('clicking toggle twice returns to dark', () => {
    render(<TopBar title="测试" />, { wrapper: Wrapper })
    const btn = screen.getByRole('button', { name: /切换.*主题|theme/i })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })
})

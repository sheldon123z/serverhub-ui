# ServerHub 双主题视觉改造实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ServerHub 前端升级为 Linear 暗色 + macOS Sonoma 亮色磨玻璃双主题，支持顶栏一键切换。

**Architecture:** Tailwind v4 `@theme` 定义暗色 token，`[data-theme="light"]` CSS 选择器覆盖相同变量名实现运行时主题切换；Zustand `themeStore` 管理状态并持久化到 `localStorage`；Inter Variable 字体本地托管于 `public/fonts/inter/`。

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Zustand, Vitest + @testing-library/react

---

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `public/fonts/inter/InterVariable.woff2` | Inter Variable 字体文件 |
| 新建 | `src/stores/themeStore.ts` | Zustand 主题状态 + localStorage 持久化 |
| 修改 | `src/index.css` | CSS 变量双主题系统 + @font-face |
| 修改 | `src/components/Layout.tsx` | 挂载 `data-theme` 到 `<html>` |
| 修改 | `src/components/TopBar.tsx` | 主题切换按钮 🌙/☀️ |
| 修改 | `src/components/Sidebar.tsx` | 半透明边框、nav active 态 |
| 修改 | `src/pages/dashboard/cards.tsx` | StatCard 升级 |
| 修改 | `src/pages/dashboard/charts.tsx` | 图表颜色跟随主题 |
| 修改 | `src/pages/agents/ChatPanel.tsx` | 消息气泡卡片化 |
| 修改 | `src/pages/LoginPage.tsx` | 双主题登录页 |
| 修改 | `src/pages/DockerPage.tsx` | 列表行 hover、状态 badge |
| 修改 | `src/pages/ServicesPage.tsx` | 同 DockerPage |
| 修改 | `src/pages/LogsPage.tsx` | 日志背景跟随主题 |
| 修改 | `src/pages/AlertsPage.tsx` | 告警卡片颜色规范化 |
| 新建 | `src/__tests__/themeStore.test.ts` | themeStore 单元测试 |
| 新建 | `src/__tests__/ThemeToggle.test.tsx` | 主题切换集成测试 |

---

## Task 1: 下载 Inter Variable 字体到本地

**Files:**
- Create: `public/fonts/inter/InterVariable.woff2`

- [ ] **Step 1: 下载字体文件**

```bash
mkdir -p /home/zhengxiaodong/exps/serverhub/serverhub-ui/public/fonts/inter
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui/public/fonts/inter

# 通过 Clash 代理下载（https://github.com/rsms/inter/releases）
curl -x http://127.0.0.1:7890 -L \
  "https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip" \
  -o inter-4.0.zip

unzip -j inter-4.0.zip "*/InterVariable.woff2" -d .
unzip -j inter-4.0.zip "*/InterVariable-Italic.woff2" -d . 2>/dev/null || true
rm inter-4.0.zip
ls -lh *.woff2
```

Expected output: `InterVariable.woff2` 约 320KB

- [ ] **Step 2: 验证文件存在**

```bash
file /home/zhengxiaodong/exps/serverhub/serverhub-ui/public/fonts/inter/InterVariable.woff2
```

Expected: `Web Open Font Format (Version 2)`

- [ ] **Step 3: Commit**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui
git add public/fonts/inter/
git commit -m "feat: add Inter Variable font for local hosting"
```

---

## Task 2: 创建 themeStore

**Files:**
- Create: `src/stores/themeStore.ts`
- Create: `src/__tests__/themeStore.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/themeStore.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// 每次测试前清空 localStorage 和 Zustand store
beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
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
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui
npx vitest run src/__tests__/themeStore.test.ts 2>&1 | tail -20
```

Expected: `FAIL` — `Cannot find module '@/stores/themeStore'`

- [ ] **Step 3: 实现 themeStore**

创建 `src/stores/themeStore.ts`：

```typescript
import { create } from 'zustand'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'serverhub-theme'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

function applyTheme(theme: Theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  localStorage.setItem(STORAGE_KEY, theme)
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    set({ theme: next })
  },
}))
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/__tests__/themeStore.test.ts 2>&1 | tail -10
```

Expected: `✓ themeStore > defaults to dark theme`, 5 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/stores/themeStore.ts src/__tests__/themeStore.test.ts
git commit -m "feat: add themeStore with localStorage persistence"
```

---

## Task 3: 重写 index.css（CSS 变量双主题 + Inter 字体）

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: 读取当前 index.css 完整内容确认变量名**

```bash
cat /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/index.css
```

- [ ] **Step 2: 替换 index.css**

完整替换 `src/index.css`：

```css
@import "tailwindcss";

/* ─── Inter Variable 本地字体 ─── */
@font-face {
  font-family: 'Inter Variable';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('/fonts/inter/InterVariable.woff2') format('woff2');
}

/* ─── 暗色主题 token（默认）─── */
:root {
  --bg-raw:   #080b14;
  --bg2-raw:  #0f1011;
  --card-raw: rgba(255, 255, 255, 0.03);
  --border-raw: rgba(255, 255, 255, 0.07);
  --border-light-raw: rgba(255, 255, 255, 0.05);
  --accent-raw: #38bdf8;
  --accent-dim-raw: rgba(56, 189, 248, 0.12);
  --text-raw:  #f7f8f8;
  --text2-raw: #8a8f98;
  --text3-raw: #62666d;
  --glass-blur: 0px;
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* ─── 亮色主题 token（macOS Sonoma 风）─── */
[data-theme="light"] {
  --bg2-raw:  rgba(255, 255, 255, 0.52);
  --card-raw: rgba(255, 255, 255, 0.72);
  --border-raw: rgba(255, 255, 255, 0.92);
  --border-light-raw: rgba(255, 255, 255, 0.78);
  --accent-raw: #007aff;
  --accent-dim-raw: rgba(0, 122, 255, 0.12);
  --text-raw:  #1c1c1e;
  --text2-raw: rgba(60, 60, 67, 0.55);
  --text3-raw: rgba(60, 60, 67, 0.38);
  --glass-blur: 20px;
  --shadow-card: 0 2px 10px rgba(0, 0, 0, 0.06), inset 0 1px 0 #fff;
}

/* ─── Tailwind v4 主题 token ─── */
@theme {
  --color-bg:           var(--bg-raw, #080b14);
  --color-bg2:          var(--bg2-raw, #0f1011);
  --color-card:         var(--card-raw, rgba(255,255,255,0.03));
  --color-card-hover:   rgba(255, 255, 255, 0.05);
  --color-border:       var(--border-raw, rgba(255,255,255,0.07));
  --color-border-light: var(--border-light-raw, rgba(255,255,255,0.05));
  --color-accent:       var(--accent-raw, #38bdf8);
  --color-accent-dim:   var(--accent-dim-raw, rgba(56,189,248,0.12));
  --color-green:        #4ade80;
  --color-yellow:       #fbbf24;
  --color-red:          #f87171;
  --color-orange:       #fb923c;
  --color-purple:       #a78bfa;
  --color-text:         var(--text-raw, #f7f8f8);
  --color-text2:        var(--text2-raw, #8a8f98);
  --color-text3:        var(--text3-raw, #62666d);
  --spacing-sidebar:    220px;
  --spacing-header:     56px;
  --radius-default:     8px;
}

/* ─── 全局样式 ─── */
body {
  margin: 0;
  font-family: 'Inter Variable', -apple-system, 'SF Pro Display',
               system-ui, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-feature-settings: 'cv01', 'ss03';
  -webkit-font-smoothing: antialiased;
  color: var(--text-raw);
}

/* 暗色：纯色背景 */
body {
  background-color: var(--bg-raw, #080b14);
}

/* 亮色：Sonoma 渐变背景（body 高度需撑满）*/
[data-theme="light"] body {
  background: linear-gradient(160deg, #fef3c7 0%, #dbeafe 40%, #f0fdf4 100%);
  background-attachment: fixed;
  min-height: 100vh;
}

*, *::before, *::after { box-sizing: border-box; }

/* ─── 滚动条 ─── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-raw); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--border-light-raw); }

/* 亮色滚动条 */
[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); }
[data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }

/* ─── 磨玻璃工具类（亮色启用，暗色透明）─── */
.glass {
  background: var(--card-raw);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--border-raw);
  box-shadow: var(--shadow-card);
}
```

- [ ] **Step 3: 验证构建无报错**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui
npm run build 2>&1 | tail -20
```

Expected: `✓ built in` 无 error

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat: dual-theme CSS variables + Inter Variable font"
```

---

## Task 4: 更新 Layout.tsx（挂载 data-theme）

**Files:**
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: 更新 Layout.tsx**

在 `src/components/Layout.tsx` 中，import 后添加主题初始化：

```typescript
import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import ChatWidget from './ChatWidget'
import ErrorBoundary from './ErrorBoundary'
import { useThemeStore } from '@/stores/themeStore'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/users': '用户管理',
  '/docker': 'Docker 管理',
  '/services': '服务管理',
  '/cron': '定时任务',
  '/network': '网络状态',
  '/proxy': '代理管理',
  '/logs': '日志查看',
  '/notifications': '通知中心',
  '/notifications/channels': '通知渠道',
  '/settings/channels': '通知渠道',
  '/settings': '系统设置',
  '/audit': '审计日志',
  '/panel_users': '面板用户',
  '/assets': '资产管理',
  '/agents': 'OpsAgent',
  '/agents/studio': 'Agent Studio',
  '/playbooks': '运维剧本',
  '/servers': '服务器管理',
  '/fleet': '舰队总览',
  '/monitoring': '系统监控',
}

export default function Layout() {
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] || 'ServerHub'
  const { theme } = useThemeStore()

  // 将 data-theme 同步到 <html> 根节点
  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [theme])

  return (
    <div className="flex min-h-screen">
      <ErrorBoundary fallback={null}>
        <Sidebar />
      </ErrorBoundary>
      <div className="flex-1 ml-sidebar flex flex-col">
        <ErrorBoundary fallback={<div className="h-header border-b border-border" />}>
          <TopBar title={title} />
        </ErrorBoundary>
        <main className="flex-1 p-5 overflow-auto">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <ErrorBoundary fallback={null}>
        <ChatWidget />
      </ErrorBoundary>
    </div>
  )
}
```

- [ ] **Step 2: 验证构建**

```bash
npm run build 2>&1 | grep -E "error|Error|✓"
```

Expected: `✓ built in`

- [ ] **Step 3: Commit**

```bash
git add src/components/Layout.tsx
git commit -m "feat: sync data-theme attribute to html root from themeStore"
```

---

## Task 5: 更新 TopBar.tsx（主题切换按钮）

**Files:**
- Modify: `src/components/TopBar.tsx`
- Create: `src/__tests__/ThemeToggle.test.tsx`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/ThemeToggle.test.tsx`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TopBar from '@/components/TopBar'

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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/ThemeToggle.test.tsx 2>&1 | tail -15
```

Expected: `FAIL` — theme toggle button not found

- [ ] **Step 3: 更新 TopBar.tsx**

在现有 TopBar 中添加主题切换按钮（在 `<NotificationBell />` 之前插入）：

```typescript
import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { useServerStore } from '@/stores/serverStore'
import { authApi } from '@/api/auth'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import NotificationBell from './NotificationBell'
import { useThemeStore } from '@/stores/themeStore'

interface TopBarProps {
  title: string
}

const STATUS_DOT: Record<string, string> = {
  online: 'bg-green',
  offline: 'bg-red',
  degraded: 'bg-yellow',
  unknown: 'bg-text3',
}

export default function TopBar({ title }: TopBarProps) {
  const { user, setUser } = useAuthStore()
  const { servers, selectedServerId, setSelectedServer, fetchServers } = useServerStore()
  const { theme, toggleTheme } = useThemeStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchServers() }, [fetchServers])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  const handleLogout = async () => {
    await authApi.logout()
    setUser(null)
    navigate('/login')
  }

  const currentServer = servers.find((s) => s.id === selectedServerId)
  const currentLabel = currentServer ? currentServer.name : '本机 (Hub)'
  const currentStatus = currentServer?.status ?? 'online'

  return (
    <header
      className="h-header border-b border-border flex items-center justify-between px-6 flex-shrink-0"
      style={{
        background: 'var(--bg2-raw)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
      }}
    >
      <div className="text-base font-semibold tracking-tight">{title}</div>
      <div className="flex items-center gap-3">
        {/* 服务器选择器 */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md border border-border text-text2 hover:text-text hover:border-border-light transition-colors"
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[currentStatus] ?? STATUS_DOT.unknown)} />
            <i className="ti ti-server-2 text-sm" />
            <span className="max-w-[120px] truncate">{currentLabel}</span>
            <i className={cn('ti ti-chevron-down text-xs transition-transform', dropdownOpen && 'rotate-180')} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-bg border border-border rounded-lg shadow-xl z-50 py-1 max-h-64 overflow-y-auto">
              <button
                onClick={() => { setSelectedServer('local'); setDropdownOpen(false); queryClient.invalidateQueries() }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-bg2 transition-colors',
                  selectedServerId === 'local' && 'bg-accent-dim text-accent'
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green" />
                <span>本机 (Hub)</span>
              </button>

              {servers.filter((s) => s.is_local !== 1).length > 0 && (
                <div className="border-t border-border my-1" />
              )}

              {servers.filter((s) => s.is_local !== 1).map((srv) => (
                <button
                  key={srv.id}
                  onClick={() => { setSelectedServer(srv.id); setDropdownOpen(false); queryClient.invalidateQueries() }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-bg2 transition-colors',
                    selectedServerId === srv.id && 'bg-accent-dim text-accent'
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[srv.status] ?? STATUS_DOT.unknown)} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{srv.name}</div>
                    <div className="text-text3 text-[10px]">{srv.ip_address}</div>
                  </div>
                </button>
              ))}

              {servers.filter((s) => s.is_local !== 1).length === 0 && (
                <div className="px-3 py-2 text-[10px] text-text3">暂无远程服务器</div>
              )}
            </div>
          )}
        </div>

        <span className="text-xs text-text3">每 15s 自动刷新</span>

        {/* 主题切换按钮 */}
        <button
          onClick={toggleTheme}
          aria-label="切换主题"
          title={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}
          className="w-8 h-8 flex items-center justify-center rounded-md border border-border text-text2 hover:text-text hover:border-border-light transition-colors text-sm"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <NotificationBell />
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text2">{user.display_name || user.username}</span>
            <span className="text-[10px] text-text3">{user.role}</span>
            <button
              onClick={handleLogout}
              className="text-xs px-2 py-1 rounded border border-border text-text2 hover:text-text hover:border-border-light transition-colors"
            >
              退出
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/__tests__/ThemeToggle.test.tsx 2>&1 | tail -10
```

Expected: 3 tests passed

- [ ] **Step 5: Commit**

```bash
git add src/components/TopBar.tsx src/__tests__/ThemeToggle.test.tsx
git commit -m "feat: add theme toggle button to TopBar"
```

---

## Task 6: 更新 Sidebar.tsx（Linear 风格 + 磨玻璃）

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: 读取 Sidebar.tsx 完整内容**

```bash
cat /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/components/Sidebar.tsx
```

- [ ] **Step 2: 替换 Sidebar 渲染部分**

找到 Sidebar 的 `return` 语句，替换为以下内容（保留 fallback items 定义、useQuery、groups 逻辑不变，只修改 JSX）：

```typescript
  return (
    <aside
      className="fixed left-0 top-0 bottom-0 w-sidebar border-r border-border flex flex-col z-40"
      style={{
        background: 'var(--bg2-raw)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
      }}
    >
      {/* Logo 区域 */}
      <div className="px-4 py-3.5 border-b border-border">
        <h1 className="text-[14px] font-semibold text-text tracking-tight m-0">ServerHub</h1>
        <div className="text-[11px] text-text3 mt-0.5 font-medium">NF5468M6</div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {Object.entries(groups).map(([category, categoryItems]) => (
          <div key={category}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-text3 px-3 pt-4 pb-1.5">
              {category}
            </div>
            {categoryItems.map((item) => (
              <NavLink
                key={item.name}
                to={`/${item.name}`}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-[5px] rounded-[5px] mb-[1px] text-[13px] transition-colors ${
                    isActive
                      ? 'text-accent font-medium'
                      : 'text-text2 hover:text-text hover:bg-card'
                  }`
                }
                style={({ isActive }) => isActive ? {
                  background: 'var(--accent-dim-raw)',
                } : {}}
              >
                {item.icon && <i className={`ti ti-${item.icon} text-[14px] flex-shrink-0 opacity-70`} />}
                <span>{item.display_name}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
```

- [ ] **Step 3: 验证构建**

```bash
npm run build 2>&1 | grep -E "error|✓"
```

Expected: `✓ built in`

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: upgrade Sidebar to Linear style with glassmorphism support"
```

---

## Task 7: 升级 Dashboard StatCard

**Files:**
- Modify: `src/pages/dashboard/cards.tsx`

- [ ] **Step 1: 读取 cards.tsx 完整内容**

```bash
cat /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/pages/dashboard/cards.tsx
```

- [ ] **Step 2: 更新 MiniStat 组件**

将 `MiniStat` 函数替换为：

```typescript
export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-[8px] px-3 py-2">
      <div className="text-[10px] font-semibold text-text3 uppercase tracking-[0.08em]">{label}</div>
      <div className="text-[13px] font-semibold text-text mt-0.5 truncate tracking-tight">{value}</div>
    </div>
  )
}
```

- [ ] **Step 3: 更新 StatCard 组件的卡片容器**

找到 `StatCard` 的 `return` 语句中最外层 `<div>`，将其 `className` 从：
```
className="... bg-card border border-border ..."
```
改为使用 `glass` 工具类，并升级数值字体：

```typescript
  return (
    <div
      onClick={onClick}
      className={cn(
        'glass rounded-[8px] p-4 cursor-pointer transition-all duration-150',
        'hover:scale-[1.01] hover:shadow-lg',
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[11px] font-semibold text-text3 uppercase tracking-[0.08em] mb-1">
            {config.label}
          </div>
          <div
            className="text-[22px] font-bold tracking-[-0.5px] leading-none"
            style={{ color: color || 'var(--text-raw)' }}
          >
            {value}
          </div>
          <div className="text-[11px] text-text2 mt-1">{sub}</div>
        </div>
        {Icon && (
          <Icon
            size={18}
            style={{ color: color || 'var(--accent-raw)' }}
            className="opacity-70 flex-shrink-0 mt-0.5"
          />
        )}
      </div>
      {showBar && (
        <div className="h-1 rounded-full bg-border mt-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }}
          />
        </div>
      )}
      {sparkData.length > 0 && (
        <div className="mt-2">
          <Sparkline data={sparkData} color={color} />
        </div>
      )}
    </div>
  )
```

- [ ] **Step 4: 验证构建**

```bash
npm run build 2>&1 | grep -E "error|✓"
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/cards.tsx
git commit -m "feat: upgrade StatCard and MiniStat to dual-theme glass style"
```

---

## Task 8: 图表颜色跟随主题

**Files:**
- Modify: `src/pages/dashboard/charts.tsx`

- [ ] **Step 1: 读取 charts.tsx**

```bash
cat /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/pages/dashboard/charts.tsx | head -60
```

- [ ] **Step 2: 在 charts.tsx 顶部添加主题感知工具函数**

在文件顶部 import 之后添加：

```typescript
import { useThemeStore } from '@/stores/themeStore'

/** 根据当前主题返回图表颜色配置 */
export function useChartTheme() {
  const { theme } = useThemeStore()
  return {
    lineColor:    theme === 'light' ? '#007aff' : '#38bdf8',
    areaColor:    theme === 'light' ? 'rgba(0,122,255,0.08)' : 'rgba(56,189,248,0.1)',
    gridColor:    theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
    axisColor:    theme === 'light' ? 'rgba(60,60,67,0.35)' : '#62666d',
    tooltipBg:    theme === 'light' ? 'rgba(255,255,255,0.92)' : '#191a1b',
    tooltipBorder: theme === 'light' ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.1)',
    tooltipText:  theme === 'light' ? '#1c1c1e' : '#f7f8f8',
  }
}
```

- [ ] **Step 3: 在 Sparkline 和 OverviewChartsGrid 中使用 useChartTheme()**

找到图表组件中硬编码的颜色值（如 `#38bdf8`、`rgba(255,255,255,0.05)` 等），替换为 `useChartTheme()` 返回的对应值。例如，Sparkline 组件：

```typescript
export function Sparkline({ data, color }: { data: number[]; color: string }) {
  const { gridColor } = useChartTheme()
  // 原有 eCharts option 中：
  // splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
  // 改为：
  // splitLine: { lineStyle: { color: gridColor } }
}
```

- [ ] **Step 4: 验证构建**

```bash
npm run build 2>&1 | grep -E "error|✓"
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/dashboard/charts.tsx
git commit -m "feat: chart colors follow active theme via useChartTheme hook"
```

---

## Task 9: Agent ChatPanel 气泡卡片化

**Files:**
- Modify: `src/pages/agents/ChatPanel.tsx`

- [ ] **Step 1: 读取 ChatPanel.tsx 关键部分**

```bash
grep -n "className\|bubble\|message\|tool" /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/pages/agents/ChatPanel.tsx | head -30
```

- [ ] **Step 2: 更新消息气泡样式**

找到消息气泡容器的 `className`，将：
- 用户消息：`bg-accent/10 border border-accent/20` → 保持，升级 border-radius 为 `rounded-xl`
- AI 消息：`bg-card border border-border` → 改为 `glass rounded-xl`
- 工具调用卡片：添加 `border-l-2 border-accent`

通用修改规则：将所有 `bg-card border border-border` 替换为 `glass`，将 `rounded-lg` 升级为 `rounded-xl`。

- [ ] **Step 3: 更新输入框容器**

找到输入区域的容器 `className`，将 `bg-bg2 border border-border` 改为：

```
style={{ background: 'var(--bg2-raw)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))' }}
```

- [ ] **Step 4: 验证构建**

```bash
npm run build 2>&1 | grep -E "error|✓"
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/agents/ChatPanel.tsx
git commit -m "feat: upgrade ChatPanel message bubbles to glass card style"
```

---

## Task 10: 双主题登录页

**Files:**
- Modify: `src/pages/LoginPage.tsx`

- [ ] **Step 1: 读取 LoginPage.tsx**

```bash
cat /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/pages/LoginPage.tsx
```

- [ ] **Step 2: 更新登录页外层容器**

将最外层 `<div>` 的背景和登录卡片样式更新：

```typescript
// 最外层容器（暗色：纯色背景，亮色：继承 body 渐变）
<div className="min-h-screen flex items-center justify-center px-4">

  {/* 登录卡片 */}
  <div
    className="w-full max-w-sm rounded-2xl p-8"
    style={{
      background: 'var(--card-raw)',
      backdropFilter: 'blur(var(--glass-blur))',
      WebkitBackdropFilter: 'blur(var(--glass-blur))',
      border: '1px solid var(--border-raw)',
      boxShadow: 'var(--shadow-card)',
    }}
  >
    <h1 className="text-xl font-semibold text-text tracking-tight mb-1">ServerHub</h1>
    <p className="text-sm text-text2 mb-6">登录以继续</p>
    {/* 原有表单内容保持不变 */}
  </div>
</div>
```

- [ ] **Step 3: 验证构建**

```bash
npm run build 2>&1 | grep -E "error|✓"
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "feat: dual-theme login page with glass card"
```

---

## Task 11: Docker 和 Services 页面列表样式

**Files:**
- Modify: `src/pages/DockerPage.tsx`
- Modify: `src/pages/ServicesPage.tsx`

- [ ] **Step 1: 读取 DockerPage.tsx 关键部分**

```bash
grep -n "className\|hover\|badge\|status\|border" /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/pages/DockerPage.tsx | head -30
```

- [ ] **Step 2: 更新 DockerPage 列表样式**

在 DockerPage 中应用以下规则：

a) 页面容器/卡片：将 `bg-card border border-border` 替换为 `glass`

b) 列表行 hover：将 `hover:bg-bg2` 替换为 `hover:bg-card`（使用 CSS 变量）

c) 状态 badge（running/stopped/exited）：

```typescript
const CONTAINER_STATUS_STYLE: Record<string, string> = {
  running:  'bg-green/15 text-green border border-green/20',
  stopped:  'bg-red/15 text-red border border-red/20',
  exited:   'bg-text3/15 text-text3 border border-text3/20',
  paused:   'bg-yellow/15 text-yellow border border-yellow/20',
}

// badge 用法：
<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CONTAINER_STATUS_STYLE[container.status] ?? CONTAINER_STATUS_STYLE.exited}`}>
  {container.status}
</span>
```

d) 操作按钮：将实色背景按钮改为 ghost 风格：
```
className="text-xs px-2.5 py-1 rounded-md border border-border text-text2 hover:text-text hover:border-border-light transition-colors"
```

- [ ] **Step 3: 对 ServicesPage.tsx 应用相同变更**

```bash
grep -n "className\|hover\|badge\|status\|border" /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/pages/ServicesPage.tsx | head -20
```

应用与 DockerPage 相同的 status badge 定义和列表样式。

- [ ] **Step 4: 验证构建**

```bash
npm run build 2>&1 | grep -E "error|✓"
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/DockerPage.tsx src/pages/ServicesPage.tsx
git commit -m "feat: upgrade Docker/Services pages with ghost buttons and glass cards"
```

---

## Task 12: Logs 和 Alerts 页面

**Files:**
- Modify: `src/pages/LogsPage.tsx`
- Modify: `src/pages/AlertsPage.tsx`

- [ ] **Step 1: 读取两个文件**

```bash
grep -n "className\|bg-\|border-\|text-red\|text-yellow\|text-green" \
  /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/pages/LogsPage.tsx | head -20
grep -n "className\|bg-\|border-\|text-red\|text-yellow\|text-green" \
  /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/pages/AlertsPage.tsx | head -20
```

- [ ] **Step 2: 更新 LogsPage**

a) 日志容器：将 `bg-bg2 border border-border` 改为 `glass`

b) 日志级别颜色保持不变（`text-red`, `text-yellow`, `text-green` 均已是语义色）

c) 日志行 hover：`hover:bg-card`

- [ ] **Step 3: 更新 AlertsPage**

a) 告警卡片容器：改为 `glass rounded-lg`

b) 告警级别 badge（保持语义色，统一 pill 样式）：

```typescript
const ALERT_LEVEL_STYLE: Record<string, string> = {
  critical: 'bg-red/15 text-red border border-red/25',
  warning:  'bg-yellow/15 text-yellow border border-yellow/25',
  info:     'bg-accent-dim text-accent border border-accent/20',
}
```

- [ ] **Step 4: 验证构建**

```bash
npm run build 2>&1 | grep -E "error|✓"
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/LogsPage.tsx src/pages/AlertsPage.tsx
git commit -m "feat: upgrade Logs/Alerts pages with glass cards and unified badge styles"
```

---

## Task 13: 全量测试 + 冒烟验证

**Files:**
- 验证所有修改文件

- [ ] **Step 1: 运行全量测试**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui
npm run test 2>&1 | tail -20
```

Expected: 所有测试通过，无新增失败

- [ ] **Step 2: 生产构建验证**

```bash
npm run build 2>&1 | tail -10
```

Expected: `✓ built in`，无 TypeScript error

- [ ] **Step 3: 本地预览验证双主题**

```bash
npm run preview &
sleep 2
echo "Preview running, open http://localhost:4173"
```

手动验证清单：
- [ ] 暗色主题：侧边栏半透明边框可见，StatCard 透明卡片，Inter 字体已应用
- [ ] 点击顶栏 ☀️ 按钮，页面切换为 Sonoma 渐变亮色背景
- [ ] 亮色主题：侧边栏磨玻璃效果可见，卡片有白色背景 + blur
- [ ] 刷新页面，主题保持（localStorage 持久化）
- [ ] 点击 🌙 回到暗色

- [ ] **Step 4: 最终 Commit**

```bash
pkill -f "vite preview" 2>/dev/null || true
git add -A
git commit -m "feat: complete dual-theme implementation (Linear dark + macOS Sonoma light)"
```

---

## 实现后检查清单

- [ ] `public/fonts/inter/InterVariable.woff2` 存在且约 320KB
- [ ] `src/stores/themeStore.ts` 已创建
- [ ] `src/index.css` 包含 `[data-theme="light"]` 选择器
- [ ] `src/components/TopBar.tsx` 包含主题切换按钮
- [ ] `.glass` 工具类被 Sidebar/TopBar/StatCard/LoginPage 使用
- [ ] 所有测试通过：`npm run test`
- [ ] 生产构建成功：`npm run build`
- [ ] 两套主题在浏览器中均可正常切换

---

## 后续细节优化（第二阶段，本计划完成后另行规划）

1. 微动效：卡片 hover 上浮 + 主题切换 300ms 渐变过渡
2. Dashboard 面积图渐变填充 + tooltip 磨玻璃化
3. Agent 子 Agent 指示器动画 + SSE 打字效果优化
4. 文件管理器、定时任务、审计日志等页面精调
5. 统一空状态 / 加载 / 错误页面视觉设计
6. 生成标准 `DESIGN.md` 供后续 AI 辅助开发使用

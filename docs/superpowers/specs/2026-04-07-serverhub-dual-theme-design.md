# ServerHub 双主题视觉设计规范

**日期**: 2026-04-07  
**范围**: serverhub-ui 前端视觉改造（方案 B）  
**状态**: 已审批，待实现

---

## 1. 设计目标

将 ServerHub 前端从通用暗色仪表盘升级为两套精心设计的主题，支持用户一键切换：

- **暗色主题**：Linear.app 极简设计语言，近纯黑背景 + 天蓝强调色，适合长时间运维
- **亮色主题**：macOS Sonoma 磨玻璃风格，渐变背景 + Apple Blue 强调色，适合白天使用

---

## 2. 主题系统架构

### 2.1 切换机制

- 切换按钮位于 `TopBar` 右侧（🌙 / ☀️ 图标）
- 主题状态通过 `Zustand` 的 `themeStore` 管理
- `data-theme="light"` 属性挂载在 `<html>` 根节点
- 优先级：用户手动选择 > `localStorage` 持久化 > `prefers-color-scheme` 系统偏好

### 2.2 CSS 变量系统

所有颜色通过 CSS 自定义属性定义，切换主题只需改变 `data-theme` 属性：

```css
/* 暗色主题（默认） */
:root {
  --bg:          #080b14;          /* 主页面背景 */
  --bg2:         #0f1011;          /* 侧栏/顶栏背景 */
  --card:        rgba(255,255,255,0.03);   /* 卡片背景 */
  --border:      rgba(255,255,255,0.07);   /* 边框 */
  --border-std:  rgba(255,255,255,0.05);   /* 轻边框 */
  --accent:      #38bdf8;          /* 主强调色（天蓝） */
  --accent-dim:  rgba(56,189,248,0.12);    /* 强调色背景 */
  --text:        #f7f8f8;          /* 主文字 */
  --text2:       #8a8f98;          /* 次要文字 */
  --text3:       #62666d;          /* 三级文字（分类标签/占位符） */
  --glass-bg:    rgba(255,255,255,0.03);
  --glass-blur:  0px;              /* 暗色不启用 blur（性能） */
  --shadow-card: 0 1px 3px rgba(0,0,0,0.3);
  --radius:      8px;
  --radius-lg:   12px;
}

/* 亮色主题（macOS Sonoma 风） */
[data-theme="light"] {
  --bg:          linear-gradient(160deg, #fef3c7 0%, #dbeafe 40%, #f0fdf4 100%);
  --bg2:         rgba(255,255,255,0.52);
  --card:        rgba(255,255,255,0.72);
  --border:      rgba(255,255,255,0.92);
  --border-std:  rgba(255,255,255,0.78);
  --accent:      #007aff;          /* Apple Blue */
  --accent-dim:  rgba(0,122,255,0.12);
  --text:        #1c1c1e;          /* Apple 主文字 */
  --text2:       rgba(60,60,67,0.55);
  --text3:       rgba(60,60,67,0.38);
  --glass-bg:    rgba(255,255,255,0.72);
  --glass-blur:  20px;             /* 亮色启用磨玻璃 */
  --shadow-card: 0 2px 10px rgba(0,0,0,0.06), inset 0 1px 0 #fff;
  --radius:      10px;
  --radius-lg:   14px;
}
```

---

## 3. 色板

### 3.1 暗色主题

| 用途 | 变量 | 值 |
|------|------|----|
| 主背景 | `--bg` | `#080b14`（近纯黑，蓝调） |
| 侧栏/顶栏 | `--bg2` | `#0f1011` |
| 卡片背景 | `--card` | `rgba(255,255,255,0.03)` |
| 边框 | `--border` | `rgba(255,255,255,0.07)` |
| 主强调色 | `--accent` | `#38bdf8`（Sky Blue） |
| 主文字 | `--text` | `#f7f8f8` |
| 次要文字 | `--text2` | `#8a8f98` |
| 三级文字 | `--text3` | `#62666d` |
| 成功/在线 | — | `#4ade80` |
| 警告 | — | `#fbbf24` |
| 危险/错误 | — | `#f87171` |
| GPU/紫色 | — | `#a78bfa` |

### 3.2 亮色主题（macOS Sonoma）

| 用途 | 变量 | 值 |
|------|------|----|
| 主背景 | `--bg` | `linear-gradient(160deg, #fef3c7, #dbeafe, #f0fdf4)` |
| 侧栏/顶栏 | `--bg2` | `rgba(255,255,255,0.52)` + backdrop-filter blur |
| 卡片背景 | `--card` | `rgba(255,255,255,0.72)` |
| 边框 | `--border` | `rgba(255,255,255,0.92)` |
| 主强调色 | `--accent` | `#007aff`（Apple Blue） |
| 主文字 | `--text` | `#1c1c1e` |
| 次要文字 | `--text2` | `rgba(60,60,67,0.55)` |
| 三级文字 | `--text3` | `rgba(60,60,67,0.38)` |
| 成功/在线 | — | `#34c759`（Apple Green） |
| 警告 | — | `#ff9500`（Apple Orange） |
| 危险/错误 | — | `#ff3b30`（Apple Red） |

---

## 4. 字体系统

### 4.1 字体声明

```css
/* 本地托管，放置于 public/fonts/inter/ */
@font-face {
  font-family: 'Inter Variable';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('/fonts/inter/InterVariable.woff2') format('woff2');
}
```

全局应用：
```css
body {
  font-family: 'Inter Variable', -apple-system, 'SF Pro Display',
               system-ui, 'Segoe UI', sans-serif;
  font-feature-settings: 'cv01', 'ss03'; /* Linear 特征字形 */
}
```

### 4.2 字体层级

| 角色 | 尺寸 | 字重 | 字距 | 应用场景 |
|------|------|------|------|---------|
| 页面标题 | 18px | 600 | -0.3px | DashboardPage、各页面 h1 |
| 卡片/区块标题 | 14px | 600 | -0.1px | StatCard、面板标题 |
| 指标大值 | 22px | 700 | -0.5px | CPU/内存/磁盘数值 |
| 导航项 | 13px | 400 | normal | Sidebar nav 链接 |
| 分类标签 | 10px | 600 | +0.1em + uppercase | Sidebar 分类头 |
| 正文/描述 | 13px | 400 | -0.1px | 卡片说明、列表内容 |
| 辅助/元数据 | 12px | 400 | normal | 时间戳、状态说明 |
| 代码/终端 | 13px | 400 | normal | `ui-monospace` 字体族 |

---

## 5. 组件改造规范

### 5.1 卡片（StatCard、通用卡片）

```css
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  /* 亮色额外属性（通过 data-theme="light" 自动激活） */
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
}
```

**暗色卡片**：透明叠加，半透明白边框，无 blur  
**亮色卡片**：白色半透明 + blur(20px) + inset 高光

### 5.2 侧边栏（Sidebar）

- 背景：`var(--bg2)` + `backdrop-filter: blur(var(--glass-blur))`
- 右边框：`1px solid var(--border)`
- 导航项 active 态：
  - 暗色：`background: var(--accent-dim)`, `color: var(--accent)`
  - 亮色：`background: rgba(255,255,255,0.88)`, `color: var(--accent)`, 白色磨玻璃
- 分类标签：`var(--text3)`, `font-size: 10px`, `font-weight: 600`, `uppercase`, `letter-spacing: 0.1em`

### 5.3 顶栏（TopBar）

- 背景：`var(--bg2)` + `backdrop-filter: blur(var(--glass-blur))`
- 下边框：`1px solid var(--border-std)`
- 新增主题切换按钮：icon-only，hover 时 `background: var(--accent-dim)`
- 服务器选择器：ghost 风格按钮，`border: 1px solid var(--border)`

### 5.4 仪表盘卡片区（dashboard/cards.tsx）

- `StatCard` 采用统一卡片规范
- 数值使用 22px / font-weight 700 / letter-spacing -0.5px
- 状态颜色使用语义色（不跟随主题变量，直接用绿/黄/红）
- 进度条：背景 `var(--border)`, 填充 `var(--accent)` 或状态色

### 5.5 图表（dashboard/charts.tsx）

- 暗色：线条颜色 `#38bdf8`，面积填充 `rgba(56,189,248,0.1)`，网格线 `rgba(255,255,255,0.05)`
- 亮色：线条颜色 `#007aff`，面积填充 `rgba(0,122,255,0.08)`，网格线 `rgba(0,0,0,0.05)`

### 5.6 Agent 聊天面板（agents/ChatPanel.tsx）

- 消息气泡：用卡片规范统一，用户消息用 `var(--accent-dim)` 背景
- 工具调用卡片：`border-left: 2px solid var(--accent)` + 卡片背景
- 输入框：`background: var(--card)`, `border: 1px solid var(--border)`, `border-radius: var(--radius-lg)`

### 5.7 登录页（LoginPage.tsx）

- 暗色：Linear 风格，黑色背景，居中白色表单卡片
- 亮色：Sonoma 渐变背景 + 磨玻璃登录卡（`backdrop-filter: blur(24px)`, 白色 0.75 透明度）

### 5.8 Docker / 服务管理页

- 列表行 hover：`background: var(--card)`, 过渡 150ms
- 状态 badge：圆角 pill，`background: <状态色>20`（20% 透明度），文字用对应状态色
- 操作按钮：ghost 风格，`border: 1px solid var(--border)`，hover 时 `background: var(--card)`

---

## 6. 深度/阴影系统

### 6.1 暗色（层级用透明度叠加，不用投影）

| 层级 | 背景 | 边框 | 用途 |
|------|------|------|------|
| 基础 | `#080b14` | — | 页面背景 |
| 面板 | `#0f1011` | `rgba(255,255,255,0.06)` | 侧栏、顶栏 |
| 卡片 | `rgba(255,255,255,0.03)` | `rgba(255,255,255,0.07)` | 内容卡片 |
| 浮层 | `rgba(255,255,255,0.05)` | `rgba(255,255,255,0.1)` | 下拉、tooltip |
| 模态 | `#191a1b` | `rgba(255,255,255,0.1)` | 对话框 |

### 6.2 亮色（磨玻璃叠加）

| 层级 | 背景 | blur | 边框 |
|------|------|------|------|
| 基础 | Sonoma 渐变 | — | — |
| 面板 | `rgba(255,255,255,0.52)` | 24px | `rgba(255,255,255,0.78)` |
| 卡片 | `rgba(255,255,255,0.72)` | 20px | `rgba(255,255,255,0.92)` |
| 浮层 | `rgba(255,255,255,0.82)` | 16px | `rgba(255,255,255,0.95)` |
| 模态 | `rgba(255,255,255,0.88)` | 24px | `rgba(255,255,255,0.95)` |

---

## 7. 改造文件清单（方案 B）

### 7.1 全局层（自动影响所有页面）

| 文件 | 改动内容 |
|------|---------|
| `src/index.css` | 重写 CSS 变量，引入 Inter Variable `@font-face`，删除旧 Google Fonts `@import`，新增 `[data-theme="light"]` |
| `src/components/Layout.tsx` | 挂载 `data-theme` 到 `<html>`，初始化主题逻辑 |
| `src/components/Sidebar.tsx` | 半透明边框、nav active 态、分类标签间距、磨玻璃背景 |
| `src/components/TopBar.tsx` | 主题切换按钮、磨玻璃顶栏（亮色） |
| `src/stores/themeStore.ts` | **新建**：Zustand 主题状态，localStorage 持久化，系统偏好监听 |

### 7.2 核心组件层

| 文件 | 改动内容 |
|------|---------|
| `src/pages/dashboard/cards.tsx` | StatCard 升级：透明卡片、大值字体、状态 dot |
| `src/pages/dashboard/charts.tsx` | 图表颜色跟随主题变量 |
| `src/pages/dashboard/DashboardPage.tsx` | 页面标题字体、布局间距微调 |
| `src/pages/agents/ChatPanel.tsx` | 气泡磨玻璃化、工具卡片边框、输入框样式 |
| `src/pages/LoginPage.tsx` | 双主题登录页：暗色 Linear + 亮色磨玻璃卡 |
| `src/pages/DockerPage.tsx` | 列表行 hover、状态 badge、操作按钮 ghost 风格 |
| `src/pages/ServicesPage.tsx` | 同 DockerPage |
| `src/pages/LogsPage.tsx` | 日志行颜色（级别色保留），背景跟随主题 |
| `src/pages/AlertsPage.tsx` | 告警卡片颜色规范化 |

### 7.3 依赖本地化

| 资源 | 操作 |
|------|------|
| Inter Variable `.woff2` | 下载到 `public/fonts/inter/InterVariable.woff2`（约 320KB） |
| Inter Variable Italic `.woff2` | 下载到 `public/fonts/inter/InterVariable-Italic.woff2`（可选） |
| 删除 Google Fonts `@import` | 从 `index.css` 和 `index.html` 清除 CDN 引用 |

---

## 8. 响应式行为

- 侧边栏在 < 768px 折叠为抽屉模式（现有行为保持不变）
- 磨玻璃效果在所有断点保持一致
- 主题切换按钮始终可见（不随响应式隐藏）

---

## 9. 后续细节优化计划（方案 B 完成后）

以下为方案 B 完成后的第二阶段优化方向（待单独规划）：

1. **微动效**：卡片 hover 上浮（`transform: translateY(-1px)`）、主题切换渐变过渡（300ms）
2. **AI Agent 界面精调**：子 Agent 指示器、工具调用卡片动画、SSE 流式打字效果优化
3. **Dashboard 图表升级**：面积图渐变填充、数据点 tooltip 磨玻璃化
4. **页面级精调**：文件管理器、定时任务、审计日志等页面按新设计规范精调
5. **空状态设计**：统一空列表/加载/错误状态的视觉呈现
6. **滚动条美化**：亮色主题下滚动条换为浅色系
7. **DESIGN.md 写入项目**：将本规范转为标准 DESIGN.md 格式，供后续 AI 辅助开发使用

---

## 10. 实现注意事项

- `backdrop-filter` 亮色主题启用，暗色 `--glass-blur: 0px` 不触发 GPU 合成层，性能更优
- `backdrop-filter` 在 Safari 需 `-webkit-backdrop-filter` 前缀（已在规范中注明）
- Inter Variable 使用 `font-display: swap` 防止字体加载时 FOUT
- CSS 变量不支持 `background` 为渐变的直接 `var()` 引用——亮色 `--bg` 渐变需在 `body` 或 `#root` 上通过 `[data-theme="light"] body { background: var(--bg); }` 方式应用
- 所有颜色变量改动后需验证 WCAG AA 对比度（文字 vs 背景 ≥ 4.5:1）

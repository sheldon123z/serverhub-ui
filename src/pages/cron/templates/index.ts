import { type ScriptTemplate, type TemplateCategory } from '@/types/cron-agent'
import { BUILTIN_TEMPLATES } from './builtin'

const STORAGE_KEY = 'serverhub-cron-templates-v1'

/** 从 localStorage 加载用户自定义模板 */
export function loadUserTemplates(): ScriptTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** 保存用户自定义模板到 localStorage */
export function saveUserTemplates(templates: ScriptTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

/** 获取所有模板（内置 + 用户自定义） */
export function getAllTemplates(): ScriptTemplate[] {
  return [...BUILTIN_TEMPLATES, ...loadUserTemplates()]
}

/** 按分类过滤模板 */
export function getTemplatesByCategory(category: TemplateCategory): ScriptTemplate[] {
  return getAllTemplates().filter(t => t.category === category)
}

/** 添加用户模板 */
export function addUserTemplate(template: Omit<ScriptTemplate, 'id' | 'isBuiltin'>): ScriptTemplate {
  const newTemplate: ScriptTemplate = {
    ...template,
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    isBuiltin: false,
  }
  const existing = loadUserTemplates()
  saveUserTemplates([...existing, newTemplate])
  return newTemplate
}

/** 更新用户模板 */
export function updateUserTemplate(id: string, updates: Partial<ScriptTemplate>): void {
  const existing = loadUserTemplates()
  const idx = existing.findIndex(t => t.id === id)
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...updates }
    saveUserTemplates(existing)
  }
}

/** 删除用户模板 */
export function deleteUserTemplate(id: string): void {
  saveUserTemplates(loadUserTemplates().filter(t => t.id !== id))
}

/** 模板分类定义 */
export const TEMPLATE_CATEGORIES: { key: TemplateCategory; label: string; icon: string }[] = [
  { key: 'backup', label: '备份', icon: '💾' },
  { key: 'monitoring', label: '监控', icon: '📊' },
  { key: 'cleanup', label: '清理', icon: '🧹' },
  { key: 'security', label: '安全', icon: '🔒' },
  { key: 'report', label: '报告', icon: '📋' },
  { key: 'custom', label: '自定义', icon: '⚙️' },
]

export { BUILTIN_TEMPLATES }

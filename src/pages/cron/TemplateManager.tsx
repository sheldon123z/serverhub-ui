import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  getAllTemplates,
  addUserTemplate,
  updateUserTemplate,
  deleteUserTemplate,
  TEMPLATE_CATEGORIES,
} from '@/pages/cron/templates'
import type { ScriptTemplate, TemplateCategory } from '@/types/cron-agent'

export interface TemplateManagerProps {
  open: boolean
  onClose: () => void
  onTemplateChange: () => void
}

const EMPTY_FORM = {
  name: '',
  category: 'custom' as TemplateCategory,
  description: '',
  promptInstructions: '',
  defaultSchedule: '',
  icon: '📝',
}

export function TemplateManager({ open, onClose, onTemplateChange }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<ScriptTemplate[]>([])
  const [editing, setEditing] = useState<ScriptTemplate | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  // Reload templates whenever panel opens
  useEffect(() => {
    if (open) {
      setTemplates(getAllTemplates())
    }
  }, [open])

  if (!open) return null

  function refresh() {
    setTemplates(getAllTemplates())
    onTemplateChange()
  }

  function openAddForm() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
  }

  function openEditForm(t: ScriptTemplate) {
    setEditing(t)
    setForm({
      name: t.name,
      category: t.category,
      description: t.description,
      promptInstructions: t.promptInstructions,
      defaultSchedule: t.defaultSchedule ?? '',
      icon: t.icon,
    })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditing(null)
    setForm({ ...EMPTY_FORM })
  }

  function handleSave() {
    const { name, category, description, promptInstructions, defaultSchedule, icon } = form
    if (!name.trim() || !promptInstructions.trim()) return

    if (editing) {
      updateUserTemplate(editing.id, {
        name: name.trim(),
        category,
        description: description.trim(),
        promptInstructions: promptInstructions.trim(),
        defaultSchedule: defaultSchedule.trim() || undefined,
        icon: icon.trim() || '📝',
      })
    } else {
      addUserTemplate({
        name: name.trim(),
        category,
        description: description.trim(),
        promptInstructions: promptInstructions.trim(),
        defaultSchedule: defaultSchedule.trim() || undefined,
        icon: icon.trim() || '📝',
      })
    }

    cancelForm()
    refresh()
  }

  function handleDelete(id: string) {
    deleteUserTemplate(id)
    refresh()
  }

  const inputCls =
    'w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:border-accent focus:outline-none'

  return (
    <div className="flex flex-col h-full glass">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b border-border flex-shrink-0"
        style={{
          background: 'var(--bg2-raw)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
        }}
      >
        <span className="text-sm">📋</span>
        <span className="text-[13px] font-semibold text-text flex-1">模板管理</span>
        <button
          onClick={onClose}
          className="text-text3 hover:text-text text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-card transition-colors"
          title="关闭"
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Template list */}
        <ul className="divide-y divide-border">
          {templates.map((t) => (
            <li
              key={t.id}
              className="px-3 py-2 border-b border-border hover:bg-card/50 flex items-center gap-2 transition-colors"
            >
              {/* Icon */}
              <span className="text-base flex-shrink-0">{t.icon}</span>

              {/* Name + category */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[12px] font-medium text-text truncate">{t.name}</span>
                  {/* Category badge */}
                  {(() => {
                    const cat = TEMPLATE_CATEGORIES.find((c) => c.key === t.category)
                    return cat ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
                        {cat.label}
                      </span>
                    ) : null
                  })()}
                  {/* Builtin badge */}
                  {t.isBuiltin && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-card text-text3 border border-border">
                      内置
                    </span>
                  )}
                </div>
                {t.description && (
                  <div className="text-[10px] text-text3 truncate mt-0.5">{t.description}</div>
                )}
              </div>

              {/* Actions (user templates only) */}
              {!t.isBuiltin && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEditForm(t)}
                    className="text-[11px] text-text3 hover:text-accent px-2 py-0.5 rounded hover:bg-accent/10 transition-colors"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-[11px] text-text3 hover:text-red px-2 py-0.5 rounded hover:bg-red/10 transition-colors"
                  >
                    删除
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {/* Add/Edit form */}
        {showForm && (
          <div className="mx-3 my-3 glass rounded-lg p-3 space-y-3 border border-border">
            <div className="text-[12px] font-semibold text-text">
              {editing ? '编辑模板' : '新增模板'}
            </div>

            {/* Icon + Name row */}
            <div className="flex gap-2">
              <div className="w-16">
                <label className="block text-[10px] text-text3 mb-1">图标</label>
                <input
                  type="text"
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  className={cn(inputCls, 'text-center')}
                  maxLength={4}
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] text-text3 mb-1">
                  名称 <span className="text-red">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputCls}
                  placeholder="模板名称"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-[10px] text-text3 mb-1">分类</label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value as TemplateCategory }))
                }
                className={inputCls}
              >
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-[10px] text-text3 mb-1">描述</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className={inputCls}
                placeholder="简短描述（可选）"
              />
            </div>

            {/* Prompt Instructions */}
            <div>
              <label className="block text-[10px] text-text3 mb-1">
                Prompt 指令 <span className="text-red">*</span>
              </label>
              <textarea
                value={form.promptInstructions}
                onChange={(e) => setForm((f) => ({ ...f, promptInstructions: e.target.value }))}
                rows={6}
                className={cn(inputCls, 'resize-y font-mono text-[11px] leading-relaxed')}
                placeholder="向 AI 发送的任务指令内容..."
              />
            </div>

            {/* Default Schedule */}
            <div>
              <label className="block text-[10px] text-text3 mb-1">
                默认 Cron 表达式（可选）
              </label>
              <input
                type="text"
                value={form.defaultSchedule}
                onChange={(e) => setForm((f) => ({ ...f, defaultSchedule: e.target.value }))}
                className={inputCls}
                placeholder="例如：0 3 * * *"
              />
            </div>

            {/* Form actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={cancelForm}
                className="text-[11px] text-text3 hover:text-text px-3 py-1.5 rounded border border-border hover:border-border-light transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.promptInstructions.trim()}
                className="text-[11px] font-semibold bg-accent text-[#0f172a] px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                保存
              </button>
            </div>
          </div>
        )}

        {/* Add button */}
        {!showForm && (
          <div className="px-3 py-2">
            <button
              onClick={openAddForm}
              className={cn(
                'inline-flex items-center gap-1.5 text-[11px] text-text3 hover:text-accent',
                'px-3 py-1.5 rounded border border-dashed border-border hover:border-accent/50',
                'transition-colors w-full justify-center'
              )}
            >
              <span>+</span>
              <span>新增模板</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TEMPLATE_CATEGORIES, getTemplatesByCategory } from '@/pages/cron/templates'
import type { ScriptTemplate, TemplateCategory } from '@/types/cron-agent'

export interface ScriptTemplateSelectorProps {
  onSelectTemplate: (template: ScriptTemplate) => void
  onManageTemplates: () => void
}

export function ScriptTemplateSelector({
  onSelectTemplate,
  onManageTemplates,
}: ScriptTemplateSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>('backup')
  const templates = getTemplatesByCategory(activeCategory)

  return (
    <div className="flex flex-col gap-4">
      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors',
              'text-[11px] font-medium',
              activeCategory === cat.key
                ? 'bg-accent/15 text-accent'
                : 'text-text3 hover:text-text'
            )}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-2 gap-3">
        {templates.length > 0 ? (
          templates.map((template) => (
            <button
              key={template.id}
              onClick={() => onSelectTemplate(template)}
              className={cn(
                'group relative flex flex-col gap-2 rounded-lg p-3 transition-all',
                'glass hover:bg-accent/20 active:scale-95'
              )}
            >
              {/* Icon */}
              <div className="text-xl">{template.icon}</div>

              {/* Name */}
              <div className="text-left text-[11px] font-semibold leading-tight text-text1">
                {template.name}
              </div>

              {/* Description */}
              <div className="text-left text-[10px] leading-tight text-text3">
                {template.description}
              </div>

              {/* Default Schedule Badge */}
              {template.defaultSchedule && (
                <div className="mt-1 inline-flex rounded-full bg-accent/10 px-2 py-0.5">
                  <span className="text-[9px] font-medium text-accent">
                    {template.defaultSchedule}
                  </span>
                </div>
              )}
            </button>
          ))
        ) : (
          <div className="col-span-2 flex items-center justify-center rounded-lg border border-dashed border-text3/30 py-8 text-[11px] text-text3">
            无可用模板
          </div>
        )}
      </div>

      {/* Manage Templates Link */}
      <button
        onClick={onManageTemplates}
        className={cn(
          'mt-2 inline-flex items-center gap-1 text-[10px] text-text3',
          'transition-colors hover:text-accent'
        )}
      >
        <span>管理模板</span>
        <span>⚙️</span>
      </button>
    </div>
  )
}

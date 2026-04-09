import { memo, useCallback, useEffect } from 'react'
import type { Node } from '@xyflow/react'
import { STEP_ACCENT, STEP_ICON, STEP_LABEL } from './nodes'
import { CommonFields } from './property-forms/CommonFields'
import { STEP_FORMS } from './property-forms'

interface PropertyPanelProps {
  node: Node | null
  onUpdate: (id: string, data: Record<string, unknown>) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export const PropertyPanel = memo(function PropertyPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
}: PropertyPanelProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleChange = useCallback(
    (field: string, value: unknown) => {
      if (!node) return
      onUpdate(node.id, { [field]: value })
    },
    [node, onUpdate],
  )

  const handleDelete = useCallback(() => {
    if (!node) return
    if (confirm(`确定删除步骤「${(node.data as Record<string, unknown>).name ?? node.id}」？`)) {
      onDelete(node.id)
    }
  }, [node, onDelete])

  const type = (node?.data as Record<string, unknown>)?.type as string ?? ''
  const TypeForm = type ? STEP_FORMS[type] : null

  return (
    <div
      className={`
        absolute top-0 right-0 h-full w-[320px] z-20
        bg-white/95 dark:bg-[#1a1a2e]/95 backdrop-blur-md
        border-l border-border
        transition-transform duration-200 ease-out
        overflow-y-auto
        ${node ? 'translate-x-0' : 'translate-x-full'}
      `}
      style={{ boxShadow: node ? '-2px 0 20px rgba(0,0,0,0.1)' : 'none' }}
    >
      {node && (
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <i
                className={`ti ${STEP_ICON[type] ?? 'ti-point'} text-lg`}
                style={{ color: STEP_ACCENT[type] ?? '#6b7280' }}
              />
              <span className="text-sm font-semibold text-text">
                {STEP_LABEL[type] ?? type}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-full text-text3 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <i className="ti ti-x text-sm" />
            </button>
          </div>

          <div className="border-t border-border mb-3" />

          <CommonFields
            data={node.data as Record<string, unknown>}
            onChange={handleChange}
          />

          <div className="border-t border-border my-3" />

          {TypeForm && (
            <TypeForm
              data={node.data as Record<string, unknown>}
              onChange={handleChange}
            />
          )}

          <div className="border-t border-border mt-6 pt-4">
            <button
              type="button"
              onClick={handleDelete}
              className="w-full py-2 rounded-lg text-sm font-medium text-red bg-red/10 hover:bg-red/20 transition-colors"
            >
              删除此步骤
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

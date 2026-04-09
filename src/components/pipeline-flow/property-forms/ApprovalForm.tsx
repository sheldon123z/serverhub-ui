import { inputCls, labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function ApprovalForm({ data, onChange }: Props) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>审批人</label>
      <input
        className={inputCls}
        value={String(data.assignee ?? '')}
        onChange={(e) => onChange('assignee', e.target.value)}
        placeholder="admin"
      />
    </div>
  )
}

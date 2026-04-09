import { inputCls, labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function PlaybookForm({ data, onChange }: Props) {
  return (
    <div>
      <label className={labelCls}>剧本 ID</label>
      <input
        className={`${inputCls} font-mono text-xs`}
        value={String(data.playbook_id ?? '')}
        onChange={(e) => onChange('playbook_id', e.target.value)}
        placeholder="system-init-template"
      />
    </div>
  )
}

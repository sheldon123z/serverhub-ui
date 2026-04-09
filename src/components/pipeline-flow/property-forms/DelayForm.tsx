import { inputCls, labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function DelayForm({ data, onChange }: Props) {
  return (
    <div>
      <label className={labelCls}>等待时间 (秒)</label>
      <input
        type="number"
        className={inputCls}
        value={Number(data.seconds ?? 30)}
        onChange={(e) => onChange('seconds', Number(e.target.value))}
        min={1}
      />
    </div>
  )
}

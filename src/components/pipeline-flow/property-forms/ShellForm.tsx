import { inputCls, labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function ShellForm({ data, onChange }: Props) {
  return (
    <div>
      <label className={labelCls}>命令</label>
      <textarea
        className={`${inputCls} font-mono text-xs min-h-[80px] resize-y`}
        value={String(data.command ?? '')}
        onChange={(e) => onChange('command', e.target.value)}
        placeholder="echo hello"
      />
    </div>
  )
}

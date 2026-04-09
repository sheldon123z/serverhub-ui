import { inputCls, labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function SshForm({ data, onChange }: Props) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>目标主机</label>
      <input
        className={inputCls}
        value={String(data.host ?? '')}
        onChange={(e) => onChange('host', e.target.value)}
        placeholder="{{params.target_server}}"
      />

      <label className={labelCls}>命令</label>
      <textarea
        className={`${inputCls} font-mono text-xs min-h-[80px] resize-y`}
        value={String(data.command ?? '')}
        onChange={(e) => onChange('command', e.target.value)}
        placeholder="uptime"
      />
    </div>
  )
}

import { inputCls, labelCls, selectCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function HttpForm({ data, onChange }: Props) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>URL</label>
      <input
        className={`${inputCls} font-mono text-xs`}
        value={String(data.url ?? '')}
        onChange={(e) => onChange('url', e.target.value)}
        placeholder="https://api.example.com/webhook"
      />

      <label className={labelCls}>方法</label>
      <select
        className={selectCls}
        value={String(data.method ?? 'GET')}
        onChange={(e) => onChange('method', e.target.value)}
      >
        <option value="GET">GET</option>
        <option value="POST">POST</option>
        <option value="PUT">PUT</option>
        <option value="DELETE">DELETE</option>
      </select>

      <label className={labelCls}>请求体</label>
      <textarea
        className={`${inputCls} font-mono text-xs min-h-[60px] resize-y`}
        value={String(data.body ?? '')}
        onChange={(e) => onChange('body', e.target.value)}
        placeholder='{"key": "value"}'
      />
    </div>
  )
}

interface CommonFieldsProps {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

const FAILURE_OPTIONS = [
  { value: 'abort', label: '中止' },
  { value: 'skip', label: '跳过' },
  { value: 'retry', label: '重试' },
  { value: 'notify_continue', label: '通知后继续' },
]

export const inputCls =
  'w-full bg-transparent border-b border-border px-0 py-1.5 text-sm text-text focus:border-accent focus:outline-none'

export const labelCls =
  'text-[11px] text-text3 uppercase tracking-wider mt-3 mb-0.5 block'

export const selectCls =
  'w-full bg-transparent border-b border-border px-0 py-1.5 text-sm text-text focus:border-accent focus:outline-none appearance-none'

export function CommonFields({ data, onChange }: CommonFieldsProps) {
  const retryCount = Number(data.retry_count ?? 0)

  return (
    <div className="space-y-0.5">
      <label className={labelCls}>步骤 ID</label>
      <input
        className={`${inputCls} text-text3 font-mono text-xs`}
        value={String(data.id ?? '')}
        readOnly
      />

      <label className={labelCls}>名称</label>
      <input
        className={inputCls}
        value={String(data.name ?? '')}
        onChange={(e) => onChange('name', e.target.value)}
        placeholder="步骤名称"
      />

      <label className={labelCls}>超时 (秒)</label>
      <input
        type="number"
        className={inputCls}
        value={Number(data.timeout ?? 30)}
        onChange={(e) => onChange('timeout', Number(e.target.value))}
        min={1}
      />

      <label className={labelCls}>失败策略</label>
      <select
        className={selectCls}
        value={String(data.on_failure ?? 'abort')}
        onChange={(e) => onChange('on_failure', e.target.value)}
      >
        {FAILURE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <label className={labelCls}>重试次数</label>
      <input
        type="number"
        className={inputCls}
        value={retryCount}
        onChange={(e) => onChange('retry_count', Number(e.target.value))}
        min={0}
        max={10}
      />

      {retryCount > 0 && (
        <>
          <label className={labelCls}>重试间隔 (秒)</label>
          <input
            type="number"
            className={inputCls}
            value={Number(data.retry_delay ?? 5)}
            onChange={(e) => onChange('retry_delay', Number(e.target.value))}
            min={1}
          />
        </>
      )}
    </div>
  )
}

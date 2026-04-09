import { inputCls, labelCls, selectCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function NotifyForm({ data, onChange }: Props) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>通知渠道</label>
      <select
        className={selectCls}
        value={String(data.channel ?? 'telegram')}
        onChange={(e) => onChange('channel', e.target.value)}
      >
        <option value="telegram">Telegram</option>
        <option value="email">邮件</option>
        <option value="webhook">Webhook</option>
      </select>

      <label className={labelCls}>消息内容</label>
      <textarea
        className={`${inputCls} min-h-[80px] resize-y`}
        value={String(data.message ?? '')}
        onChange={(e) => onChange('message', e.target.value)}
        placeholder="任务完成通知"
      />
    </div>
  )
}

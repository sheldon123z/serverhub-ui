import { inputCls, labelCls, selectCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function AgentForm({ data, onChange }: Props) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>提示词</label>
      <textarea
        className={`${inputCls} min-h-[120px] resize-y`}
        value={String(data.prompt ?? '')}
        onChange={(e) => onChange('prompt', e.target.value)}
        placeholder="分析系统状态并生成报告"
      />

      <label className={labelCls}>模型 (可选)</label>
      <input
        className={inputCls}
        value={String(data.model ?? '')}
        onChange={(e) => onChange('model', e.target.value)}
        placeholder="留空使用默认模型"
      />

      <label className={labelCls}>输出格式</label>
      <select
        className={selectCls}
        value={String(data.output_format ?? '')}
        onChange={(e) => onChange('output_format', e.target.value)}
      >
        <option value="">文本</option>
        <option value="json">JSON</option>
      </select>
    </div>
  )
}

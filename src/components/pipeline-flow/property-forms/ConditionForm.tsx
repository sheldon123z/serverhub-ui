import { inputCls, labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function ConditionForm({ data, onChange }: Props) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>条件表达式</label>
      <input
        className={`${inputCls} font-mono text-xs`}
        value={String(data.expression ?? '')}
        onChange={(e) => onChange('expression', e.target.value)}
        placeholder="{{steps.check.output.severity}} >= 'high'"
      />
      <p className="text-[10px] text-text3 mt-1">
        条件分支的目标步骤由连线自动确定：右侧绿色出口 = 是，左侧红色出口 = 否
      </p>
    </div>
  )
}

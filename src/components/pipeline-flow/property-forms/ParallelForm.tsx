import { labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function ParallelForm({ data }: Props) {
  const branchCount = Number(data.branchCount ?? 0)

  return (
    <div>
      <label className={labelCls}>并行分支</label>
      <p className="text-sm text-text2">当前 {branchCount} 个分支</p>
      <p className="text-[10px] text-text3 mt-1">
        从此节点拖出连线到其他步骤即可添加并行分支。每条出线代表一个并行分支。
      </p>
    </div>
  )
}

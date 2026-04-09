import type { ComponentType } from 'react'
import { ShellForm } from './ShellForm'
import { SshForm } from './SshForm'
import { AgentForm } from './AgentForm'
import { ApprovalForm } from './ApprovalForm'
import { ConditionForm } from './ConditionForm'
import { ParallelForm } from './ParallelForm'
import { NotifyForm } from './NotifyForm'
import { HttpForm } from './HttpForm'
import { DelayForm } from './DelayForm'
import { PlaybookForm } from './PlaybookForm'

interface FormProps {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export const STEP_FORMS: Record<string, ComponentType<FormProps>> = {
  shell: ShellForm,
  ssh: SshForm,
  agent: AgentForm,
  approval: ApprovalForm,
  condition: ConditionForm,
  parallel: ParallelForm,
  notify: NotifyForm,
  http: HttpForm,
  delay: DelayForm,
  playbook: PlaybookForm,
}

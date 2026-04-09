import { useState } from 'react'
import { Settings, Brain, Shield, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'general', label: '通用设置', icon: Settings },
  { key: 'ai-model', label: 'AI 模型', icon: Brain },
  { key: 'roles', label: '权限管理', icon: Shield },
  { key: 'channels', label: '通知渠道', icon: Bell },
] as const

type TabKey = (typeof TABS)[number]['key']

interface SettingsLayoutProps {
  defaultTab?: TabKey
  children: Record<TabKey, React.ReactNode>
}

export function SettingsLayout({ defaultTab = 'general', children }: SettingsLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab)

  return (
    <div className="flex gap-6 w-full px-2">
      <div className="w-48 shrink-0 space-y-1">
        <h2 className="text-lg font-semibold mb-4 text-text">系统设置</h2>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
              activeTab === key
                ? 'bg-accent-dim text-accent font-medium'
                : 'text-text2 hover:bg-card hover:text-text',
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        {children[activeTab]}
      </div>
    </div>
  )
}

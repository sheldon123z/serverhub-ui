import { lazy, Suspense } from 'react'
import { SettingsLayout } from './settings/SettingsLayout'
import { GeneralSettings } from './settings/GeneralSettings'
import { AIModelSettings } from './settings/AIModelSettings'

const RolesPage = lazy(() => import('./settings/RolesPage'))
const ChannelManagementPage = lazy(() => import('./settings/ChannelManagementPage'))

export default function SettingsPage() {
  return (
    <SettingsLayout>
      {{
        general: <GeneralSettings />,
        'ai-model': <AIModelSettings />,
        roles: (
          <Suspense fallback={<div className="text-text3 text-sm">加载中...</div>}>
            <RolesPage embedded />
          </Suspense>
        ),
        channels: (
          <Suspense fallback={<div className="text-text3 text-sm">加载中...</div>}>
            <ChannelManagementPage embedded />
          </Suspense>
        ),
      }}
    </SettingsLayout>
  )
}

import { useState, useEffect } from 'react'

interface DecisionCountdownProps {
  timeoutSeconds: number
  startedAt: number
  onTimeoutLabel?: string
}

export function DecisionCountdown({ timeoutSeconds, startedAt, onTimeoutLabel }: DecisionCountdownProps) {
  const [remaining, setRemaining] = useState(timeoutSeconds)

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() / 1000) - startedAt
      const left = Math.max(0, timeoutSeconds - elapsed)
      setRemaining(Math.ceil(left))
    }, 1000)
    return () => clearInterval(interval)
  }, [timeoutSeconds, startedAt])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60

  return (
    <div className="flex items-center gap-2 text-xs text-text3">
      <i className="ti ti-clock" />
      <span className="tabular-nums">
        {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
      </span>
      {onTimeoutLabel && remaining <= 0 && (
        <span className="text-amber-400">超时将自动选择: {onTimeoutLabel}</span>
      )}
    </div>
  )
}

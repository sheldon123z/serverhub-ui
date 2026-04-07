import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Sparkles, Check } from 'lucide-react'

interface SuggestionChipsProps {
  suggestions: string[]
  onSelect: (text: string) => void
  disabled?: boolean
}

export function SuggestionChips({ suggestions, onSelect, disabled: externalDisabled }: SuggestionChipsProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const isDisabled = externalDisabled || selectedIdx !== null

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] text-text3">
        <Sparkles size={11} className="text-accent/60" />
        <span>请选择一个方向：</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((text, idx) => {
          const isSelected = selectedIdx === idx
          return (
            <button
              key={idx}
              onClick={() => {
                if (isDisabled) return
                setSelectedIdx(idx)
                onSelect(text)
              }}
              disabled={isDisabled && !isSelected}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all duration-200',
                isSelected
                  ? 'bg-accent text-[#0f172a] shadow-sm'
                  : isDisabled
                  ? 'bg-card text-text3 opacity-50 cursor-not-allowed'
                  : 'bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 hover:border-accent/40 cursor-pointer',
              )}
            >
              {isSelected ? (
                <Check size={12} />
              ) : (
                <span className="w-4 h-4 rounded-full border border-current opacity-40 flex items-center justify-center text-[9px]">
                  {idx + 1}
                </span>
              )}
              <span>{text}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

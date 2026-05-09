'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AutonomyLevel {
  level: number
  label: string
  description: string
}

const AUTONOMY_LEVELS: AutonomyLevel[] = [
  {
    level: 1,
    label: 'Observe only',
    description: 'AI monitors workspace and provides insights but takes no actions.',
  },
  {
    level: 2,
    label: 'Plan & Propose',
    description: 'AI creates plans and proposes actions for your approval before executing.',
  },
  {
    level: 3,
    label: 'Act with Confirmation',
    description: 'AI acts but pauses on significant changes to confirm with you first.',
  },
  {
    level: 4,
    label: 'Act Autonomously',
    description: 'AI acts independently and reports results. Best for trusted, well-defined workflows.',
  },
]

interface AutonomyDialProps {
  podId?: string
  accountId?: string
  currentLevel?: number
  onLevelChange?: (level: number) => void
  saving?: boolean
}

export function AutonomyDial({ currentLevel = 1, onLevelChange, saving = false }: AutonomyDialProps) {
  const [selected, setSelected] = useState(currentLevel)

  const handleSelect = (level: number) => {
    if (level === selected || saving) return
    setSelected(level)
    onLevelChange?.(level)
  }

  const activeLevel = AUTONOMY_LEVELS.find((l) => l.level === selected)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Autonomy Level</span>
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>


      {/* Segmented control */}
      <div className="flex rounded-lg border bg-muted/30 p-1 gap-1">
        {AUTONOMY_LEVELS.map((item) => (
          <button
            key={item.level}
            type="button"
            disabled={saving}
            onClick={() => handleSelect(item.level)}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all text-center',
              selected === item.level
                ? 'bg-background text-foreground shadow-sm border border-border/50'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Description */}
      {activeLevel && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {activeLevel.description}
        </p>
      )}
    </div>
  )
}

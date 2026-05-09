'use client'

import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentAvatarProps {
    name: string
    color?: string | null
    avatarUrl?: string | null
    size?: 'xs' | 'sm' | 'md' | 'lg'
    className?: string
}

const SIZE_MAP = {
    xs: { outer: 'w-5 h-5 rounded', icon: 'w-3 h-3', text: 'text-[8px]' },
    sm: { outer: 'w-7 h-7 rounded-lg', icon: 'w-3.5 h-3.5', text: 'text-[10px]' },
    md: { outer: 'w-9 h-9 rounded-lg', icon: 'w-4 h-4', text: 'text-xs' },
    lg: { outer: 'w-12 h-12 rounded-xl', icon: 'w-5 h-5', text: 'text-sm' },
}

export function AgentAvatar({ name, color, avatarUrl, size = 'md', className }: AgentAvatarProps) {
    const sz = SIZE_MAP[size]
    const bg = color ? `${color}25` : '#6366f125'
    const initials = name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()

    if (avatarUrl) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={avatarUrl}
                alt={name}
                className={cn(sz.outer, 'object-cover shrink-0', className)}
                style={{ border: `1px solid ${color ?? '#6366f1'}40` }}
            />
        )
    }

    return (
        <div
            className={cn(sz.outer, 'flex items-center justify-center shrink-0 font-bold', className)}
            style={{ backgroundColor: bg, color: color ?? '#6366f1' }}
        >
            {initials ? (
                <span className={sz.text}>{initials}</span>
            ) : (
                <Bot className={sz.icon} />
            )}
        </div>
    )
}

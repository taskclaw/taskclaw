'use client'

import { useRouter } from 'next/navigation'
import {
    MoreHorizontal,
    Layers,
    Settings,
    Trash2,
    LayoutDashboard,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Pod } from '@/types/pod'
import { cn } from '@/lib/utils'

interface PodCardProps {
    pod: Pod
    onDelete?: (pod: Pod) => void
}

export function PodCard({ pod, onDelete }: PodCardProps) {
    const router = useRouter()
    const color = pod.color || '#6366f1'

    return (
        <div
            onClick={() => router.push(`/dashboard/pods/${pod.slug}`)}
            className={cn(
                'bg-card border border-border rounded-xl overflow-hidden cursor-pointer transition-all group hover:border-muted-foreground/30 hover:shadow-lg hover:shadow-black/10',
            )}
        >
            {/* Colored left border via top bar */}
            <div className="h-1" style={{ backgroundColor: color }} />

            <div className="p-4">
                {/* Header row */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
                            style={{
                                backgroundColor: `${color}20`,
                                color: color,
                            }}
                        >
                            {pod.icon && pod.icon.length <= 2 ? (
                                <span className="text-base">{pod.icon}</span>
                            ) : (
                                <Layers className="w-4 h-4" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold truncate">{pod.name}</h3>
                            {pod.description && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                    {pod.description}
                                </p>
                            )}
                        </div>
                    </div>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 rounded text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground transition-all"
                            >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-lg">
                            <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/dashboard/pods/${pod.slug}`)
                            }}>
                                <LayoutDashboard className="text-muted-foreground" />
                                <span>Open Cockpit</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/dashboard/pods/${pod.slug}/settings`)
                            }}>
                                <Settings className="text-muted-foreground" />
                                <span>Settings</span>
                            </DropdownMenuItem>
                            {onDelete && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={(e) => {
                                        e.stopPropagation()
                                        onDelete(pod)
                                    }}>
                                        <Trash2 className="text-muted-foreground" />
                                        <span>Delete</span>
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Stats footer */}
                <div className="flex items-center gap-3 pt-3 border-t border-border text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        <span>{pod.board_count ?? 0} boards</span>
                    </div>
                    {pod.backbone_connection_id && (
                        <div className="flex items-center gap-1 ml-auto">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                            <span>Backbone</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

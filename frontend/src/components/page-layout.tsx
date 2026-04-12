'use client'

/**
 * PageLayout — unified page structure for list pages across the dashboard.
 *
 * Anatomy:
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Header (h-16, shrink-0)                              │
 *   ├──────────────┬──────────────────────────────────────┤
 *   │ Sidebar      │ Filter bar (shrink-0)                 │
 *   │ (optional,   ├──────────────────────────────────────┤
 *   │  w-52)       │ Content (flex-1, overflow-y-auto)     │
 *   └──────────────┴──────────────────────────────────────┘
 */

import { ReactNode } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

// ─── PageHeader ───────────────────────────────────────────────────────────────

interface PageHeaderProps {
    /** Icon before the title, e.g. <Bot className="w-4 h-4 text-primary" /> */
    icon?: ReactNode
    title: ReactNode
    /** Extra chips/badges right after the title */
    meta?: ReactNode
    /** Right-side actions (buttons, etc.) */
    actions?: ReactNode
    className?: string
}

export function PageHeader({ icon, title, meta, actions, className }: PageHeaderProps) {
    return (
        <header className={cn('flex h-16 shrink-0 items-center gap-2 border-b border-border px-2', className)}>
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            {icon && <span className="shrink-0">{icon}</span>}
            <span className="text-base font-bold">{title}</span>
            {meta && <span className="flex items-center gap-1.5">{meta}</span>}
            <div className="flex-1" />
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
    )
}

// ─── PageFilterBar ────────────────────────────────────────────────────────────

interface PageFilterBarProps {
    /** Left side — search, tabs, filters */
    left?: ReactNode
    /** Right side — view toggle, sort, etc. */
    right?: ReactNode
    className?: string
}

export function PageFilterBar({ left, right, className }: PageFilterBarProps) {
    return (
        <div className={cn('flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 min-h-[44px]', className)}>
            <div className="flex items-center gap-2 flex-1 min-w-0">{left}</div>
            {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
        </div>
    )
}

// ─── PageSidebar ──────────────────────────────────────────────────────────────

interface PageSidebarProps {
    children: ReactNode
    className?: string
    width?: string
}

export function PageSidebar({ children, className, width = 'w-52' }: PageSidebarProps) {
    return (
        <aside className={cn('shrink-0 border-r border-border flex flex-col overflow-y-auto', width, className)}>
            {children}
        </aside>
    )
}

// ─── PageContent ──────────────────────────────────────────────────────────────

interface PageContentProps {
    children: ReactNode
    className?: string
    /** Set to true for pages that manage their own overflow (e.g. kanban board) */
    noScroll?: boolean
}

export function PageContent({ children, className, noScroll }: PageContentProps) {
    return (
        <div className={cn(
            'flex-1 min-h-0',
            !noScroll && 'overflow-y-auto',
            className,
        )}>
            {children}
        </div>
    )
}

// ─── PageLayout ───────────────────────────────────────────────────────────────

interface PageLayoutProps {
    header: ReactNode
    filterBar?: ReactNode
    sidebar?: ReactNode
    children: ReactNode
    className?: string
}

export function PageLayout({ header, filterBar, sidebar, children, className }: PageLayoutProps) {
    return (
        <div className={cn('flex flex-col flex-1 min-h-0', className)}>
            {header}
            <div className="flex flex-1 min-h-0">
                {sidebar}
                <div className="flex flex-col flex-1 min-h-0">
                    {filterBar}
                    {children}
                </div>
            </div>
        </div>
    )
}

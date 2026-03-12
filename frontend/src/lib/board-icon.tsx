import { icons, LayoutGrid } from 'lucide-react'

/**
 * Resolve a kebab-case icon name (e.g. "layout-grid") to a Lucide React component.
 * Falls back to LayoutGrid if the name doesn't match any known icon.
 */
export function BoardIcon({ name, className }: { name?: string | null; className?: string }) {
    if (!name) return <LayoutGrid className={className} />

    // Convert kebab-case to PascalCase: "layout-grid" → "LayoutGrid"
    const pascal = name
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('')

    const Icon = icons[pascal as keyof typeof icons]
    if (!Icon) return <LayoutGrid className={className} />

    return <Icon className={className} />
}

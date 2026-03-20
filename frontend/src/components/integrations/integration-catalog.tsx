'use client'

import { useState, useMemo } from 'react'
import { Search, Plug, Settings2, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type {
    IntegrationCatalogItem,
    IntegrationDefinition,
    IntegrationConnection,
} from '@/types/integration'

interface IntegrationCatalogProps {
    items: IntegrationCatalogItem[]
    mode: 'settings' | 'board'
    boardConnectionIds?: Set<string>
    onConnect: (definition: IntegrationDefinition) => void
    onManage: (definition: IntegrationDefinition, connection: IntegrationConnection) => void
    onToggleBoard?: (connection: IntegrationConnection, add: boolean) => void
    loading?: boolean
    /** Filter out items whose definitions belong to any of these categories */
    excludeCategories?: string[]
}

function getStatusBadge(connection: IntegrationConnection | null) {
    if (!connection) {
        return (
            <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted">
                Not connected
            </Badge>
        )
    }
    switch (connection.status) {
        case 'active':
            return (
                <Badge variant="outline" className="text-[10px] text-green-600 bg-green-500/10 border-green-500/20">
                    Connected
                </Badge>
            )
        case 'error':
            return (
                <Badge variant="outline" className="text-[10px] text-red-500 bg-red-500/10 border-red-500/20">
                    Error
                </Badge>
            )
        case 'expired':
            return (
                <Badge variant="outline" className="text-[10px] text-amber-500 bg-amber-500/10 border-amber-500/20">
                    Expired
                </Badge>
            )
        case 'revoked':
            return (
                <Badge variant="outline" className="text-[10px] text-red-400 bg-red-500/10 border-red-500/20">
                    Revoked
                </Badge>
            )
        case 'pending':
            return (
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-muted">
                    Pending
                </Badge>
            )
        default:
            return null
    }
}

export function IntegrationCatalog({
    items,
    mode,
    boardConnectionIds,
    onConnect,
    onManage,
    onToggleBoard,
    loading,
    excludeCategories,
}: IntegrationCatalogProps) {
    const [search, setSearch] = useState('')
    const [categoryFilter, setCategoryFilter] = useState<string>('all')

    const allCategories = useMemo(() => {
        const cats = new Set<string>()
        items.forEach((item) =>
            item.definition.categories?.forEach((c) => {
                if (!excludeCategories?.includes(c)) {
                    cats.add(c)
                }
            })
        )
        return Array.from(cats).sort()
    }, [items, excludeCategories])

    const filtered = useMemo(() => {
        return items.filter((item) => {
            const def = item.definition

            // Filter out excluded categories
            if (excludeCategories?.length) {
                if (excludeCategories.some(cat => def.categories?.includes(cat))) {
                    return false
                }
            }

            const matchesSearch =
                !search ||
                def.name.toLowerCase().includes(search.toLowerCase()) ||
                def.description?.toLowerCase().includes(search.toLowerCase()) ||
                def.slug.toLowerCase().includes(search.toLowerCase())

            const matchesCategory =
                categoryFilter === 'all' ||
                def.categories?.includes(categoryFilter)

            return matchesSearch && matchesCategory
        })
    }, [items, search, categoryFilter, excludeCategories])

    return (
        <div className="space-y-4">
            {/* Search & Filter */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search integrations..."
                        className="pl-9 h-9 text-sm"
                    />
                </div>
                {allCategories.length > 0 && (
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger className="w-40 h-9 text-sm">
                            <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {allCategories.map((cat) => (
                                <SelectItem key={cat} value={cat}>
                                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            {/* Grid */}
            {filtered.length === 0 ? (
                <div className="py-12 text-center">
                    <Plug className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">
                        {search || categoryFilter !== 'all'
                            ? 'No integrations match your filters.'
                            : 'No integrations available yet.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filtered.map((item) => {
                        const { definition, connection } = item
                        const isConnected = connection && connection.status === 'active'
                        const isOnBoard = boardConnectionIds?.has(connection?.id ?? '')

                        return (
                            <Card
                                key={definition.id}
                                className={cn(
                                    'hover:border-primary/30 transition-colors cursor-pointer group',
                                    isConnected && 'border-green-500/20'
                                )}
                                onClick={() => {
                                    if (connection) {
                                        onManage(definition, connection)
                                    } else {
                                        onConnect(definition)
                                    }
                                }}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-3">
                                        <span className="text-2xl shrink-0 mt-0.5">
                                            {definition.icon || '🔌'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="text-sm font-semibold truncate">
                                                    {definition.name}
                                                </h3>
                                                {getStatusBadge(connection)}
                                            </div>
                                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                                {definition.description}
                                            </p>
                                            {definition.categories?.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {definition.categories.map((cat) => (
                                                        <Badge
                                                            key={cat}
                                                            variant="secondary"
                                                            className="text-[10px] px-1.5 py-0"
                                                        >
                                                            {cat}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                            {connection?.external_account_name && (
                                                <p className="text-[10px] text-muted-foreground mt-1.5 truncate">
                                                    Account: {connection.external_account_name}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions row */}
                                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                                        {connection ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs flex-1"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onManage(definition, connection)
                                                }}
                                            >
                                                <Settings2 className="w-3 h-3 mr-1" />
                                                Manage
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="default"
                                                size="sm"
                                                className="h-7 text-xs flex-1"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onConnect(definition)
                                                }}
                                            >
                                                <Plug className="w-3 h-3 mr-1" />
                                                Connect
                                            </Button>
                                        )}

                                        {mode === 'board' && connection && connection.status === 'active' && onToggleBoard && (
                                            <Button
                                                variant={isOnBoard ? 'secondary' : 'outline'}
                                                size="sm"
                                                className={cn(
                                                    'h-7 text-xs',
                                                    isOnBoard && 'bg-primary/10 text-primary border-primary/20'
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onToggleBoard(connection, !isOnBoard)
                                                }}
                                            >
                                                {isOnBoard ? 'On Board' : 'Add to Board'}
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

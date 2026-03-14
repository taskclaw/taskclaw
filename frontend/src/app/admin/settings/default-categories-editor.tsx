'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Trash2, Plus, Save, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { updateSystemSettings } from './actions'

interface DefaultCategory {
    name: string
    color: string
    icon: string
}

const AVAILABLE_COLORS = [
    { name: 'Pink', value: '#EC4899' },
    { name: 'Orange', value: '#F97316' },
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Green', value: '#22C55E' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Teal', value: '#14B8A6' },
    { name: 'Yellow', value: '#EAB308' },
    { name: 'Cyan', value: '#06B6D4' },
    { name: 'Rose', value: '#F43F5E' },
    { name: 'Lime', value: '#84CC16' },
    { name: 'Violet', value: '#A855F7' },
]

const AVAILABLE_ICONS = [
    'Heart', 'Target', 'Briefcase', 'BookOpen',
    'Star', 'Zap', 'Music', 'Palette',
    'Code', 'Dumbbell', 'ShoppingCart', 'Home', 'Plane', 'Folder',
]

interface DefaultCategoriesEditorProps {
    categories: DefaultCategory[]
    existingExtendedSettings: Record<string, unknown>
}

export function DefaultCategoriesEditor({
    categories: initialCategories,
    existingExtendedSettings,
}: DefaultCategoriesEditorProps) {
    const [categories, setCategories] = useState<DefaultCategory[]>(
        initialCategories.length > 0
            ? initialCategories
            : [
                  { name: 'Personal Life', color: '#EC4899', icon: 'Heart' },
                  { name: 'Year Goals Tasks', color: '#F97316', icon: 'Target' },
                  { name: 'Work', color: '#3B82F6', icon: 'Briefcase' },
                  { name: 'Studies', color: '#8B5CF6', icon: 'BookOpen' },
              ]
    )
    const [saving, setSaving] = useState(false)

    const updateCategory = (index: number, field: keyof DefaultCategory, value: string) => {
        const updated = [...categories]
        updated[index] = { ...updated[index], [field]: value }
        setCategories(updated)
    }

    const removeCategory = (index: number) => {
        setCategories(categories.filter((_, i) => i !== index))
    }

    const addCategory = () => {
        setCategories([
            ...categories,
            { name: '', color: AVAILABLE_COLORS[0].value, icon: 'Folder' },
        ])
    }

    const handleSave = async () => {
        // Validate
        const valid = categories.filter((c) => c.name.trim())
        if (valid.length === 0) {
            toast.error('At least one agent with a name is required')
            return
        }

        setSaving(true)
        try {
            const result = await updateSystemSettings({
                extended_settings: {
                    ...existingExtendedSettings,
                    default_categories: valid.map((c) => ({
                        name: c.name.trim(),
                        color: c.color,
                        icon: c.icon,
                    })),
                },
            })
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Default agents updated successfully')
            }
        } catch {
            toast.error('Failed to save agents')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="space-y-4">
            {categories.map((cat, index) => (
                <div
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                >
                    {/* Color indicator */}
                    <div
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                    />

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                        <Input
                            value={cat.name}
                            onChange={(e) => updateCategory(index, 'name', e.target.value)}
                            placeholder="Agent name"
                            className="h-8 text-sm"
                        />
                    </div>

                    {/* Color select */}
                    <Select
                        value={cat.color}
                        onValueChange={(v) => updateCategory(index, 'color', v)}
                    >
                        <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {AVAILABLE_COLORS.map((c) => (
                                <SelectItem key={c.value} value={c.value}>
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: c.value }}
                                        />
                                        {c.name}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Icon select */}
                    <Select
                        value={cat.icon}
                        onValueChange={(v) => updateCategory(index, 'icon', v)}
                    >
                        <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {AVAILABLE_ICONS.map((icon) => (
                                <SelectItem key={icon} value={icon}>
                                    {icon}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Remove */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeCategory(index)}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            ))}

            <div className="flex items-center gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={addCategory}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Agent
                </Button>

                <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? (
                        <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                            Save Changes
                        </>
                    )}
                </Button>
            </div>

            <p className="text-xs text-muted-foreground">
                These agents will be shown as defaults during new user onboarding.
                Users can customize them before completing setup.
            </p>
        </div>
    )
}

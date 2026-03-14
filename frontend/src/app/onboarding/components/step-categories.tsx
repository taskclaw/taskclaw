'use client'

import { useState } from 'react'
import { Plus, Check, Loader2, ArrowLeft } from 'lucide-react'
import { CategoryCard, type DefaultCategory } from './category-card'

const AVAILABLE_COLORS = [
    '#EC4899', '#F97316', '#3B82F6', '#8B5CF6',
    '#22C55E', '#EF4444', '#14B8A6', '#EAB308',
    '#06B6D4', '#F43F5E', '#84CC16', '#A855F7',
]

const AVAILABLE_ICONS = [
    'Heart', 'Target', 'Briefcase', 'BookOpen',
    'Star', 'Zap', 'Music', 'Palette',
    'Code', 'Dumbbell', 'ShoppingCart', 'Home', 'Plane',
]

interface StepCategoriesProps {
    defaultCategories: DefaultCategory[]
    onFinish: (categories: DefaultCategory[]) => void
    onBack: () => void
    isFinishing: boolean
}

export function StepCategories({
    defaultCategories,
    onFinish,
    onBack,
    isFinishing,
}: StepCategoriesProps) {
    const [selected, setSelected] = useState<DefaultCategory[]>([...defaultCategories])
    const [showAddForm, setShowAddForm] = useState(false)
    const [newName, setNewName] = useState('')
    const [newColor, setNewColor] = useState(AVAILABLE_COLORS[0])
    const [newIcon, setNewIcon] = useState(AVAILABLE_ICONS[0])

    const toggleCategory = (cat: DefaultCategory) => {
        const exists = selected.find((s) => s.name === cat.name)
        if (exists) {
            setSelected(selected.filter((s) => s.name !== cat.name))
        } else {
            setSelected([...selected, cat])
        }
    }

    const removeCategory = (cat: DefaultCategory) => {
        setSelected(selected.filter((s) => s.name !== cat.name))
    }

    const addCustomCategory = () => {
        if (!newName.trim()) return
        const newCat: DefaultCategory = {
            name: newName.trim(),
            color: newColor,
            icon: newIcon,
        }
        setSelected([...selected, newCat])
        setNewName('')
        setNewColor(AVAILABLE_COLORS[0])
        setNewIcon(AVAILABLE_ICONS[0])
        setShowAddForm(false)
    }

    // Merge defaults with any custom selections for the grid
    const allCategories = [...defaultCategories]
    const customCategories = selected.filter(
        (s) => !defaultCategories.find((d) => d.name === s.name)
    )

    return (
        <div className="w-full max-w-lg mx-auto">
            {/* Back button */}
            <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6"
            >
                <ArrowLeft className="w-4 h-4" />
                Back
            </button>

            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 mb-2">
                    How would you like to organize your life?
                </h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                    Select or create agents to keep your tasks and goals separated.
                    You can change these later.
                </p>
            </div>

            {/* Category grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                {allCategories.map((cat) => (
                    <CategoryCard
                        key={cat.name}
                        category={cat}
                        selected={!!selected.find((s) => s.name === cat.name)}
                        onToggle={() => toggleCategory(cat)}
                        onRemove={() => removeCategory(cat)}
                    />
                ))}
                {customCategories.map((cat) => (
                    <CategoryCard
                        key={cat.name}
                        category={cat}
                        selected={true}
                        onToggle={() => removeCategory(cat)}
                        onRemove={() => removeCategory(cat)}
                        isCustom
                    />
                ))}
            </div>

            {/* Add new category */}
            {!showAddForm ? (
                <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full border border-dashed border-[#334155] rounded-xl p-4 text-slate-500 hover:border-[#FF4500] hover:text-[#FF4500] transition-all flex items-center justify-center gap-2 mb-6"
                >
                    <Plus className="w-5 h-5" />
                    Add New Agent
                </button>
            ) : (
                <div className="border border-[#334155] rounded-xl p-4 bg-[#1E293B] mb-6 space-y-3">
                    <input
                        type="text"
                        placeholder="Agent name..."
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') addCustomCategory()
                        }}
                        autoFocus
                        className="w-full h-10 px-3 rounded-lg bg-[#0F172A] border border-[#334155] text-slate-50 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#FF4500]/50 focus:border-[#FF4500] text-sm"
                    />

                    {/* Color picker */}
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-2">
                            Color
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {AVAILABLE_COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => setNewColor(color)}
                                    className={`w-7 h-7 rounded-full transition-all flex items-center justify-center ${
                                        newColor === color
                                            ? 'ring-2 ring-offset-2 ring-offset-[#1E293B] scale-110'
                                            : 'hover:scale-105'
                                    }`}
                                    style={{
                                        backgroundColor: color,
                                        ['--tw-ring-color' as string]: color,
                                    }}
                                >
                                    {newColor === color && (
                                        <Check className="w-3.5 h-3.5 text-white drop-shadow-sm" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={() => {
                                setShowAddForm(false)
                                setNewName('')
                            }}
                            className="flex-1 h-9 rounded-lg border border-[#334155] text-slate-400 text-sm hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={addCustomCategory}
                            disabled={!newName.trim()}
                            className="flex-1 h-9 rounded-lg bg-[#FF4500] text-black text-sm font-bold hover:bg-[#E63E00] transition-colors disabled:opacity-50"
                        >
                            Add
                        </button>
                    </div>
                </div>
            )}

            {/* Finish CTA */}
            <button
                onClick={() => onFinish(selected)}
                disabled={isFinishing || selected.length === 0}
                className="w-full h-12 rounded-lg bg-[#FF4500] text-black font-bold hover:bg-[#E63E00] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                    boxShadow: '0 0 20px rgba(255, 69, 0, 0.2)',
                }}
            >
                {isFinishing ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Setting up...
                    </>
                ) : (
                    <>
                        Finish Setup
                        <Check className="w-4 h-4" />
                    </>
                )}
            </button>

            {/* Helper text */}
            <p className="text-center text-xs text-slate-500 mt-3">
                You can always add or remove agents later.
            </p>
        </div>
    )
}

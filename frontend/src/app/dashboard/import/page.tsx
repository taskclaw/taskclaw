'use client'

import { useState, useCallback } from 'react'
import { Upload, FileJson, Package, Bot, Wand2, Brain, LayoutGrid, AlertCircle, CheckCircle2, X, Clipboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { importBundle, type BundleImportResult } from './actions'

interface ParsedBundle {
    raw: any
    categories: number
    skills: number
    knowledge_docs: number
    boards: number
    categoryNames: string[]
    boardNames: string[]
    skillNames: string[]
}

function parseBundle(json: any): ParsedBundle | null {
    if (!json || typeof json !== 'object') return null

    const categories = json.categories || []
    const boards = json.boards || []

    // Support single board manifest (has steps + manifest_version) as a bundle with 1 board
    if (json.manifest_version && json.steps) {
        return {
            raw: { bundle_version: '1.0', categories: json.categories || [], boards: [json] },
            categories: (json.categories || []).length,
            skills: (json.categories || []).reduce((acc: number, c: any) => acc + (c.skills?.length || 0), 0),
            knowledge_docs: (json.categories || []).reduce((acc: number, c: any) => acc + (c.knowledge_docs?.length || 0), 0),
            boards: 1,
            categoryNames: (json.categories || []).map((c: any) => c.name),
            boardNames: [json.name || 'Untitled Board'],
            skillNames: (json.categories || []).flatMap((c: any) => (c.skills || []).map((s: any) => s.name)),
        }
    }

    let totalSkills = 0
    let totalKnowledge = 0
    const allSkillNames: string[] = []

    for (const cat of categories) {
        const skills = cat.skills?.length || 0
        totalSkills += skills
        totalKnowledge += cat.knowledge_docs?.length || 0
        for (const s of cat.skills || []) {
            allSkillNames.push(s.name)
        }
    }

    // Also count skills/knowledge from boards' embedded categories
    for (const board of boards) {
        for (const cat of board.categories || []) {
            totalSkills += cat.skills?.length || 0
            totalKnowledge += cat.knowledge_docs?.length || 0
            for (const s of cat.skills || []) {
                allSkillNames.push(s.name)
            }
        }
    }

    return {
        raw: json,
        categories: categories.length,
        skills: totalSkills,
        knowledge_docs: totalKnowledge,
        boards: boards.length,
        categoryNames: categories.map((c: any) => c.name),
        boardNames: boards.map((b: any) => b.name || 'Untitled Board'),
        skillNames: allSkillNames,
    }
}

function StatBadge({ icon: Icon, label, count, color }: {
    icon: React.ElementType
    label: string
    count: number
    color: string
}) {
    if (count === 0) return null
    return (
        <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border',
            color,
        )}>
            <Icon className="w-4 h-4" />
            <span className="text-sm font-medium">{count}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
        </div>
    )
}

export default function ImportPage() {
    const [dragActive, setDragActive] = useState(false)
    const [parsed, setParsed] = useState<ParsedBundle | null>(null)
    const [parseError, setParseError] = useState<string | null>(null)
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<BundleImportResult | null>(null)
    const [pasteMode, setPasteMode] = useState(false)
    const [pasteText, setPasteText] = useState('')

    const handleJsonInput = useCallback((text: string, filename?: string) => {
        setParseError(null)
        setResult(null)

        try {
            const json = JSON.parse(text)
            const bundle = parseBundle(json)
            if (!bundle) {
                setParseError('Invalid format. Expected a TaskClaw bundle or board manifest JSON.')
                return
            }
            if (bundle.categories === 0 && bundle.boards === 0) {
                setParseError('Bundle is empty — no categories, skills, or boards found.')
                return
            }
            setParsed(bundle)
        } catch {
            setParseError(`Invalid JSON${filename ? ` in ${filename}` : ''}. Check for syntax errors.`)
        }
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragActive(false)

        const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.json'))
        if (files.length === 0) {
            setParseError('Please drop .json files only.')
            return
        }

        // For now, handle single file. Multiple files could be merged in the future.
        const file = files[0]
        const reader = new FileReader()
        reader.onload = () => {
            handleJsonInput(reader.result as string, file.name)
        }
        reader.readAsText(file)
    }, [handleJsonInput])

    const handleFileSelect = useCallback(() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = () => {
            const file = input.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
                handleJsonInput(reader.result as string, file.name)
            }
            reader.readAsText(file)
        }
        input.click()
    }, [handleJsonInput])

    const handlePaste = useCallback(() => {
        if (!pasteText.trim()) return
        handleJsonInput(pasteText.trim())
    }, [pasteText, handleJsonInput])

    const handleImport = async () => {
        if (!parsed) return
        setImporting(true)
        setResult(null)

        try {
            const res = await importBundle(parsed.raw)
            setResult(res)
            if (res.success) {
                toast.success('Bundle imported successfully')
            } else if (res.error) {
                toast.error(res.error)
            }
        } catch (error: any) {
            toast.error(error.message || 'Import failed')
        } finally {
            setImporting(false)
        }
    }

    const handleReset = () => {
        setParsed(null)
        setParseError(null)
        setResult(null)
        setPasteText('')
        setPasteMode(false)
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="border-b border-border px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Package className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold">Import</h1>
                        <p className="text-xs text-muted-foreground">
                            Import boards, agents, skills, and knowledge from JSON manifests
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="max-w-2xl mx-auto space-y-6">

                    {/* Drop Zone / Paste Zone */}
                    {!parsed && (
                        <>
                            {!pasteMode ? (
                                <>
                                    <div
                                        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                                        onDragLeave={(e) => { e.preventDefault(); setDragActive(false) }}
                                        onDrop={handleDrop}
                                        onClick={handleFileSelect}
                                        className={cn(
                                            'relative rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all',
                                            dragActive
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:border-primary/30 hover:bg-accent/20',
                                        )}
                                    >
                                        <div className="flex flex-col items-center gap-3">
                                            <div className={cn(
                                                'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                                                dragActive ? 'bg-primary/20' : 'bg-accent/50',
                                            )}>
                                                {dragActive
                                                    ? <Upload className="w-6 h-6 text-primary" />
                                                    : <FileJson className="w-6 h-6 text-muted-foreground" />
                                                }
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">
                                                    {dragActive ? 'Drop your JSON file here' : 'Drop a JSON manifest here'}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    or click to browse files
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="h-px flex-1 bg-border" />
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">or</span>
                                        <div className="h-px flex-1 bg-border" />
                                    </div>

                                    <button
                                        onClick={() => setPasteMode(true)}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/20 transition-all"
                                    >
                                        <Clipboard className="w-4 h-4" />
                                        Paste JSON manually
                                    </button>
                                </>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                            Paste JSON
                                        </label>
                                        <button
                                            onClick={() => { setPasteMode(false); setPasteText('') }}
                                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            Back to file drop
                                        </button>
                                    </div>
                                    <textarea
                                        value={pasteText}
                                        onChange={(e) => setPasteText(e.target.value)}
                                        placeholder='{"bundle_version": "1.0", "categories": [...], "boards": [...]}'
                                        className="w-full h-48 px-4 py-3 rounded-xl border border-border bg-accent/20 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                                    />
                                    <Button
                                        onClick={handlePaste}
                                        disabled={!pasteText.trim()}
                                        className="w-full"
                                    >
                                        Parse JSON
                                    </Button>
                                </div>
                            )}
                        </>
                    )}

                    {/* Parse Error */}
                    {parseError && (
                        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20">
                            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm text-destructive font-medium">Parse Error</p>
                                <p className="text-xs text-destructive/80 mt-0.5">{parseError}</p>
                            </div>
                        </div>
                    )}

                    {/* Preview */}
                    {parsed && !result?.success && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-bold">Preview</h2>
                                <button
                                    onClick={handleReset}
                                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                                >
                                    <X className="w-3 h-3" /> Clear
                                </button>
                            </div>

                            {/* Stats */}
                            <div className="flex flex-wrap gap-2">
                                <StatBadge icon={Bot} label="agents" count={parsed.categories} color="border-purple-500/20 bg-purple-500/5 text-purple-400" />
                                <StatBadge icon={Wand2} label="skills" count={parsed.skills} color="border-blue-500/20 bg-blue-500/5 text-blue-400" />
                                <StatBadge icon={Brain} label="knowledge docs" count={parsed.knowledge_docs} color="border-cyan-500/20 bg-cyan-500/5 text-cyan-400" />
                                <StatBadge icon={LayoutGrid} label="boards" count={parsed.boards} color="border-indigo-500/20 bg-indigo-500/5 text-indigo-400" />
                            </div>

                            {/* Details */}
                            <div className="space-y-3">
                                {parsed.categoryNames.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Agents</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {parsed.categoryNames.map((name, i) => (
                                                <span key={i} className="px-2 py-1 rounded-md bg-accent/50 text-xs">
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {parsed.skillNames.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Skills</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {parsed.skillNames.map((name, i) => (
                                                <span key={i} className="px-2 py-1 rounded-md bg-accent/50 text-xs">
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {parsed.boardNames.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Boards</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {parsed.boardNames.map((name, i) => (
                                                <span key={i} className="px-2 py-1 rounded-md bg-accent/50 text-xs">
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Import Button */}
                            <Button
                                onClick={handleImport}
                                disabled={importing}
                                className="w-full"
                                size="lg"
                            >
                                {importing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                        Importing...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-4 h-4 mr-2" />
                                        Import All
                                    </>
                                )}
                            </Button>
                        </div>
                    )}

                    {/* Result */}
                    {result?.success && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3 px-4 py-4 rounded-xl bg-green-500/10 border border-green-500/20">
                                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-green-400">Import Complete</p>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        {(result.categories_created ?? 0) > 0 && (
                                            <p className="text-muted-foreground">
                                                <span className="text-foreground font-medium">{result.categories_created}</span> agents created
                                            </p>
                                        )}
                                        {(result.categories_reused ?? 0) > 0 && (
                                            <p className="text-muted-foreground">
                                                <span className="text-foreground font-medium">{result.categories_reused}</span> agents reused
                                            </p>
                                        )}
                                        {(result.skills_created ?? 0) > 0 && (
                                            <p className="text-muted-foreground">
                                                <span className="text-foreground font-medium">{result.skills_created}</span> skills created
                                            </p>
                                        )}
                                        {(result.knowledge_docs_created ?? 0) > 0 && (
                                            <p className="text-muted-foreground">
                                                <span className="text-foreground font-medium">{result.knowledge_docs_created}</span> knowledge docs created
                                            </p>
                                        )}
                                        {(result.boards_created ?? 0) > 0 && (
                                            <p className="text-muted-foreground">
                                                <span className="text-foreground font-medium">{result.boards_created}</span> boards created
                                            </p>
                                        )}
                                    </div>
                                    {result.errors && result.errors.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-green-500/20">
                                            <p className="text-xs text-amber-400 font-medium mb-1">Warnings:</p>
                                            {result.errors.map((err, i) => (
                                                <p key={i} className="text-[11px] text-muted-foreground">{err}</p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Button onClick={handleReset} variant="outline" className="w-full">
                                Import Another
                            </Button>
                        </div>
                    )}

                    {/* Error result */}
                    {result && !result.success && result.error && (
                        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20">
                            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm text-destructive font-medium">Import Failed</p>
                                <p className="text-xs text-destructive/80 mt-0.5">{result.error}</p>
                            </div>
                        </div>
                    )}

                    {/* Help */}
                    {!parsed && !parseError && (
                        <div className="rounded-xl border border-border bg-accent/10 p-4 space-y-3">
                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">How to generate manifests</h3>
                            <div className="space-y-2 text-xs text-muted-foreground">
                                <p>Use the TaskClaw Builder skills in Claude Code:</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/30">
                                        <LayoutGrid className="w-3.5 h-3.5 text-primary" />
                                        <code className="text-[11px]">/board-architect</code>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/30">
                                        <Wand2 className="w-3.5 h-3.5 text-primary" />
                                        <code className="text-[11px]">/skill-writer</code>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/30">
                                        <Bot className="w-3.5 h-3.5 text-primary" />
                                        <code className="text-[11px]">/agent-designer</code>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/30">
                                        <Brain className="w-3.5 h-3.5 text-primary" />
                                        <code className="text-[11px]">/knowledge-curator</code>
                                    </div>
                                </div>
                                <p className="text-muted-foreground/60 pt-1">
                                    Or export a board from the Boards page (context menu &rarr; Export JSON) and import it here.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

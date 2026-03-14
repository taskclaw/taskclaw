'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSystemSettings, updateSystemSettings } from './actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Loader2, Palette, FolderOpen } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { DefaultCategoriesEditor } from "./default-categories-editor"

export default function AdminSettingsPage() {
    const [settings, setSettings] = useState<{
        allow_multiple_projects: boolean
        allow_multiple_teams: boolean
        extended_settings?: Record<string, unknown>
    } | null>(null)
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState(false)

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const data = await getSystemSettings()
                if (data) {
                    setSettings(data)
                }
            } catch (error) {
                console.error(error)
                toast.error("Failed to load settings")
            } finally {
                setLoading(false)
            }
        }
        fetchSettings()
    }, [])

    const handleToggle = async (key: 'allow_multiple_projects' | 'allow_multiple_teams', checked: boolean) => {
        setUpdating(true)
        // Optimistic update
        setSettings(prev => prev ? { ...prev, [key]: checked } : null)

        try {
            const result = await updateSystemSettings({ [key]: checked })
            if (result.error) {
                toast.error(result.error)
                // Revert on error
                setSettings(prev => prev ? { ...prev, [key]: !checked } : null)
            } else {
                toast.success("Settings updated successfully")
            }
        } catch (error) {
            console.error(error)
            toast.error("An unexpected error occurred")
            // Revert on error
            setSettings(prev => prev ? { ...prev, [key]: !checked } : null)
        } finally {
            setUpdating(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Global Settings</h1>
                    <p className="text-muted-foreground">Manage system-wide configurations.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Project Configuration</CardTitle>
                    <CardDescription>
                        Control how projects are handled in the system.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between space-x-2">
                        <div className="space-y-0.5">
                            <Label htmlFor="multiple-projects">Allow Multiple Projects</Label>
                            <p className="text-sm text-muted-foreground">
                                If disabled, users will be restricted to a single default project.
                                Existing projects will not be deleted, but users won't be able to create new ones or switch between them.
                            </p>
                        </div>
                        <Switch
                            id="multiple-projects"
                            checked={settings?.allow_multiple_projects ?? true}
                            onCheckedChange={(checked) => handleToggle('allow_multiple_projects', checked)}
                            disabled={updating}
                        />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between space-x-2">
                        <div className="space-y-0.5">
                            <Label htmlFor="multiple-teams">Allow Multiple Teams</Label>
                            <p className="text-sm text-muted-foreground">
                                If disabled, users will be restricted to a single team.
                                Existing teams will not be deleted, but users won't be able to create new ones or switch between them.
                            </p>
                        </div>
                        <Switch
                            id="multiple-teams"
                            checked={settings?.allow_multiple_teams ?? true}
                            onCheckedChange={(checked) => handleToggle('allow_multiple_teams', checked)}
                            disabled={updating}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FolderOpen className="h-5 w-5" />
                        Default Onboarding Agents
                    </CardTitle>
                    <CardDescription>
                        Configure the default agents shown to new users during onboarding.
                        Users can customize these before completing their setup.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <DefaultCategoriesEditor
                        categories={
                            (settings?.extended_settings?.default_categories as Array<{
                                name: string
                                color: string
                                icon: string
                            }>) || []
                        }
                        existingExtendedSettings={settings?.extended_settings || {}}
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Appearance</CardTitle>
                    <CardDescription>
                        Customize the look and feel of the application for all users.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Link href="/admin/settings/appearance">
                        <Button variant="outline">
                            <Palette className="mr-2 h-4 w-4" />
                            Theme Settings
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        </div>
    )
}

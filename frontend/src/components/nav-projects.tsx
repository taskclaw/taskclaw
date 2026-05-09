"use client"

import { useState } from "react"
import {
    Folder,
    Forward,
    MoreHorizontal,
    Trash2,
    Plus,
    type LucideIcon,
} from "lucide-react"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar"

import { NavLink as Link } from "@/components/nav-link"
import { useRouter } from "next/navigation"
import { deleteProject } from "@/app/dashboard/actions"
import { CreateProjectDialog } from "@/components/create-project-dialog"
import { toast } from "sonner"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { cn } from "@/lib/utils"

export function NavProjects({
    projects,
    activeTeamId,
}: {
    projects: {
        id: string
        name: string
        url: string
        icon: LucideIcon
    }[]
    activeTeamId?: string
}) {
    const { isMobile } = useSidebar()
    const router = useRouter()
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleteLoading(true)
        try {
            const result = await deleteProject(deleteTarget.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                setDeleteTarget(null)
                setDeletingId(deleteTarget.id)
                setTimeout(() => {
                    setDeletingId(null)
                    toast.success('Project deleted successfully')
                    router.refresh()
                }, 500)
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete project')
        } finally {
            setDeleteLoading(false)
        }
    }

    return (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <SidebarMenu>
                {projects.map((item) => (
                    <SidebarMenuItem
                        key={item.name}
                        className={cn(deletingId === item.id && 'animate-deleting')}
                    >
                        <SidebarMenuButton asChild>
                            <Link href={item.url}>
                                <item.icon />
                                <span className="truncate">{item.name}</span>
                            </Link>
                        </SidebarMenuButton>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuAction showOnHover suppressHydrationWarning>
                                    <MoreHorizontal />
                                    <span className="sr-only">More</span>
                                </SidebarMenuAction>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                className="w-48 rounded-lg"
                                side={isMobile ? "bottom" : "right"}
                                align={isMobile ? "end" : "start"}
                            >
                                <DropdownMenuItem>
                                    <Folder className="text-muted-foreground" />
                                    <span>View Project</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    <Forward className="text-muted-foreground" />
                                    <span>Share Project</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setDeleteTarget({ id: item.id, name: item.name })
                                    }}
                                >
                                    <Trash2 className="text-muted-foreground" />
                                    <span>Delete Project</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                ))}
                <SidebarMenuItem>
                    {activeTeamId && (
                        <CreateProjectDialog accountId={activeTeamId}>
                            <SidebarMenuButton className="text-sidebar-foreground/70" suppressHydrationWarning>
                                <Plus className="text-sidebar-foreground/70" />
                                <span>Add Project</span>
                            </SidebarMenuButton>
                        </CreateProjectDialog>
                    )}
                </SidebarMenuItem>
            </SidebarMenu>

            <ConfirmDeleteDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                onConfirm={confirmDelete}
                title="Delete project?"
                description="This will permanently delete this project and all its data."
                loading={deleteLoading}
            />
        </SidebarGroup>
    )
}

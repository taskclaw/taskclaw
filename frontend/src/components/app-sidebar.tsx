"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { getInboxCount } from "@/app/dashboard/inbox/actions"
import {
    Frame,
    GalleryVerticalEnd,
    Settings2,
    MessageCircle,
    Brain,
    BrainCircuit,
    Plug,
    Bot,
    Import,
    Library,
    RefreshCw,
    Activity,
    Inbox,
} from "lucide-react"

import { isCloudEdition } from "@/lib/edition"
import { BrandLogo } from "@/components/brand-logo"
import { NavMain } from "@/components/nav-main"
import { NavBoards } from "@/components/nav-boards"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import { OnboardingChecklist } from "@/components/onboarding-checklist"
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
} from "@/components/ui/sidebar"

// Navigation data for the sidebar
const data = {
    navMain: [
        {
            title: "Inbox",
            url: "/dashboard/inbox",
            icon: Inbox,
            items: [],
        },
        {
            title: "AI Chat",
            url: "/dashboard/chat",
            icon: MessageCircle,
            items: [],
        },
        {
            title: "Knowledge Base",
            url: "/dashboard/knowledge",
            icon: Brain,
            items: [],
        },
        {
            title: "Agents",
            url: "/dashboard/agents",
            icon: Bot,
            items: [],
        },
        {
            title: "Skill Library",
            url: "/dashboard/settings/skills",
            icon: Library,
            items: [],
        },
        {
            title: "Import",
            url: "/dashboard/import",
            icon: Import,
            items: [],
        },
        {
            title: "Integrations",
            url: "/dashboard/settings/integrations",
            icon: Plug,
            items: [],
        },
        {
            title: "Syncs",
            url: "/dashboard/settings/syncs",
            icon: RefreshCw,
            items: [],
        },
        {
            title: "Factory",
            url: "/dashboard/factory",
            icon: Activity,
            items: [],
        },
        {
            title: "Settings",
            url: "#",
            icon: Settings2,
            items: [
                {
                    title: "Team",
                    url: "/dashboard/settings/team",
                },
                {
                    title: "Memory",
                    url: "/dashboard/settings/memory",
                },
                {
                    title: "Autonomy",
                    url: "/dashboard/settings/autonomy",
                },
                // Billing and AI Usage are cloud-only features
                ...(isCloudEdition ? [
                    {
                        title: "Billing",
                        url: "/dashboard/settings/billing",
                    },
                ] : []),
                {
                    title: "AI Backbones",
                    url: "/dashboard/settings/backbones",
                },
                ...(isCloudEdition ? [
                    {
                        title: "AI Usage",
                        url: "/dashboard/settings/usage",
                    },
                ] : []),
                {
                    title: "API Keys",
                    url: "/dashboard/settings/api-keys",
                },
                {
                    title: "Webhooks",
                    url: "/dashboard/settings/webhooks",
                },
            ],
        },
    ],
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
    user: { name: string; email: string; avatar: string; role?: string } | null
    teams: { id: string; name: string; plan: string }[]
    activeTeam?: { id: string; name: string; plan: string }
    projects: { id: string; name: string; url: string }[]
    allowMultipleProjects?: boolean
    allowMultipleTeams?: boolean
}

export function AppSidebar({ user, teams, activeTeam, projects, allowMultipleProjects = true, allowMultipleTeams = true, ...props }: AppSidebarProps) {
    // Add icons to teams
    const teamsWithIcons = teams.map(t => ({
        ...t,
        logo: GalleryVerticalEnd,
    }))

    const activeTeamWithIcon = activeTeam ? {
        ...activeTeam,
        logo: GalleryVerticalEnd,
    } : undefined

    // Add icons to projects
    const projectsWithIcons = projects.map(p => ({
        ...p,
        icon: Frame,
    }))

    return (
        <Sidebar collapsible="icon" {...props}>
            <SidebarHeader>
                <BrandLogo className="justify-center py-4 [&_img]:h-auto [&_img]:w-[90%]" />
                <TeamSwitcher
                    teams={teamsWithIcons}
                    activeTeam={activeTeamWithIcon}
                    readOnly={!allowMultipleTeams}
                />
            </SidebarHeader>
            <SidebarContent>
                <NavBoards />
                <NavMain items={navMainWithBadges(data.navMain, useInboxCount())} />
                {allowMultipleProjects && (
                    <NavProjects projects={projectsWithIcons} activeTeamId={activeTeam?.id} />
                )}
            </SidebarContent>
            <SidebarFooter>
                <OnboardingChecklist />
                <NavUser user={user ? { ...user, email: user.email || '' } : {
                    name: 'Session Expired',
                    email: 'Please log out',
                    avatar: '',
                }} />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}

/**
 * Polls /inbox/count every 30s. Cheap query (two head:true counts) so the
 * sidebar badge stays roughly in sync without the user having to refresh.
 */
function useInboxCount(): number | null {
    const [count, setCount] = useState<number | null>(null)
    useEffect(() => {
        let cancelled = false
        const tick = async () => {
            try {
                const { count: c } = await getInboxCount()
                if (!cancelled) setCount(c)
            } catch {
                // 401s and the like during sign-in flips are normal — silent.
            }
        }
        void tick()
        const interval = setInterval(tick, 30_000)
        return () => {
            cancelled = true
            clearInterval(interval)
        }
    }, [])
    return count
}

/**
 * Inject the live inbox count onto the Inbox row of the nav list. Keeps
 * the static `data.navMain` declaration above readable.
 */
function navMainWithBadges<T extends { title: string; url: string }>(
    items: T[],
    inboxCount: number | null,
): (T & { badge?: number | null })[] {
    return items.map((it) =>
        it.url === '/dashboard/inbox' ? { ...it, badge: inboxCount } : it,
    )
}

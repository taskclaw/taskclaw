"use client"

import * as React from "react"
import {
    Frame,
    GalleryVerticalEnd,
    Settings2,
    MessageCircle,
    Brain,
    Plug,
    Bot,
    Import,
    Library,
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
            title: "Settings",
            url: "#",
            icon: Settings2,
            items: [
                {
                    title: "Team",
                    url: "/dashboard/settings/team",
                },
                // Billing and AI Usage are cloud-only features
                ...(isCloudEdition ? [
                    {
                        title: "Billing",
                        url: "/dashboard/settings/billing",
                    },
                ] : []),
                {
                    title: "OpenClaw Settings",
                    url: "/dashboard/settings/ai-provider",
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
                <NavMain items={data.navMain} />
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

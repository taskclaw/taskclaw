import { AppSidebar } from '@/components/app-sidebar'
import { AiBubble } from '@/components/ai/ai-bubble'
import { SystemStatusBar } from '@/components/system-status-bar'
import {
    SidebarInset,
    SidebarProvider,
} from '@/components/ui/sidebar'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUserAccounts, getUserDetails, getAccountProjects, getSystemSettings } from "@/app/dashboard/actions"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    interface Account {
        id: string
        name: string
        plan: string
    }

    const accounts: Account[] = await getUserAccounts()
    const user = await getUserDetails()

    // If session is expired or user can't be fetched, redirect to login
    if (!user) {
        redirect('/login')
    }

    const settings = await getSystemSettings()
    const cookieStore = await cookies()
    let activeAccountId = cookieStore.get('current_account_id')?.value

    // Transform accounts to match TeamSwitcher expected format
    const teams = accounts.map(account => ({
        id: account.id,
        name: account.name,
        plan: account.plan,
    }))

    // Find active team or default to first
    const activeTeam = teams.find(t => t.id === activeAccountId) || teams[0]
    
    // Set cookie if not present, or fix stale cookie referencing a non-existent account
    if ((!activeAccountId || !teams.find(t => t.id === activeAccountId)) && activeTeam) {
        activeAccountId = activeTeam.id
        cookieStore.set('current_account_id', activeAccountId, {
            path: '/',
            maxAge: 60 * 60 * 24 * 7, // 1 week
        })
    }

    // Fetch projects for active team
    interface Project {
        id: string
        name: string
        url: string
    }
    const projectsData: Project[] = activeTeam ? await getAccountProjects(activeTeam.id) : []

    const projects = projectsData.map(p => ({
        id: p.id,
        name: p.name,
        url: p.url,
    }))

    return (
        <SidebarProvider>
            <AppSidebar
                user={user ? { ...user, email: user.email || '', role: user.role } : null}
                teams={teams}
                activeTeam={activeTeam}
                projects={projects}
                allowMultipleProjects={settings?.allow_multiple_projects ?? true}
                allowMultipleTeams={settings?.allow_multiple_teams ?? true}
            />
            <SidebarInset>
                <div className="flex flex-col h-screen min-h-0 overflow-hidden">
                    <div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-h-0 overflow-y-auto">
                        {children}
                    </div>
                    <div className="sticky bottom-0 z-30 shrink-0">
                        <SystemStatusBar />
                    </div>
                </div>
            </SidebarInset>
            {/* <AiBubble /> */}
        </SidebarProvider>
    )
}

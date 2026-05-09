import { cookies } from 'next/headers'
import { getAccountMembers, getAccountInvitations, getUserAccounts } from "@/app/dashboard/actions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InviteMemberDialog } from "@/components/invite-member-dialog"
import { InvitationRow } from "./invitation-row"

export default async function TeamSettingsPage() {
    interface Account {
        id: string
    }
    const accounts: Account[] = await getUserAccounts()
    const cookieStore = await cookies()
    let activeAccountId = cookieStore.get('current_account_id')?.value

    if (!activeAccountId && accounts.length > 0) {
        activeAccountId = accounts[0].id
    }

    // Validate that the activeAccountId from cookie actually exists in the user's accounts
    // If not (stale cookie), fallback to the first account
    const isValidAccount = accounts.some(account => account.id === activeAccountId)
    if ((!activeAccountId || !isValidAccount) && accounts.length > 0) {
        activeAccountId = accounts[0].id
    }

    if (!activeAccountId) {
        return (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm">
                <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">No Account Found</h3>
                    <p className="text-sm text-muted-foreground">
                        You don't have any active accounts.
                    </p>
                </div>
            </div>
        )
    }

    interface Member {
        id: string
        name: string
        email: string
        role: string
    }
    const members: Member[] = await getAccountMembers(activeAccountId)
    const invitations = await getAccountInvitations(activeAccountId)

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Team Members</h2>
                    <p className="text-muted-foreground">
                        Manage who has access to this account.
                    </p>
                </div>
                <InviteMemberDialog accountId={activeAccountId} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Members</CardTitle>
                    <CardDescription>
                        People with access to this workspace.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {members.map((member) => (
                                <TableRow key={member.id}>
                                    <TableCell className="flex items-center gap-3">
                                        <Avatar className="h-9 w-9">
                                            <AvatarImage src="" alt={member.name} />
                                            <AvatarFallback>
                                                {(member.name || member.email || '?')
                                                    .split(" ")
                                                    .map((n: string) => n[0])
                                                    .join("")
                                                    .toUpperCase()
                                                    .slice(0, 2)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{member.name}</span>
                                            <span className="text-xs text-muted-foreground">{member.email}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="capitalize">
                                            {member.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {/* Actions will go here */}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {invitations.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Pending Invitations</CardTitle>
                        <CardDescription>
                            People who have been invited but haven't joined yet.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Sent At</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invitations.map((invite: any) => (
                                    <InvitationRow key={invite.id} invite={invite} accountId={activeAccountId} />
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}

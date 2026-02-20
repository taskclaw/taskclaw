'use client'

import { TableCell, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { deleteInvitation } from "@/app/dashboard/actions"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { cn } from "@/lib/utils"

export function InvitationRow({ invite, accountId }: { invite: any, accountId: string }) {
    const [showRevokeConfirm, setShowRevokeConfirm] = useState(false)
    const [revokeLoading, setRevokeLoading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const router = useRouter()

    async function confirmRevoke() {
        setRevokeLoading(true)
        try {
            await deleteInvitation(accountId, invite.id)
            setShowRevokeConfirm(false)
            setIsDeleting(true)
            setTimeout(() => {
                toast.success('Invitation revoked')
                router.refresh()
            }, 500)
        } catch (error: any) {
            toast.error(error.message || 'Failed to revoke invitation')
        } finally {
            setRevokeLoading(false)
        }
    }

    return (
        <>
            <TableRow className={cn(isDeleting && 'animate-deleting')}>
                <TableCell>{invite.email}</TableCell>
                <TableCell>
                    <Badge variant="outline" className="capitalize">
                        {invite.role}
                    </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                    {new Date(invite.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowRevokeConfirm(true)}
                        disabled={revokeLoading || isDeleting}
                    >
                        Revoke
                    </Button>
                </TableCell>
            </TableRow>

            <ConfirmDeleteDialog
                open={showRevokeConfirm}
                onOpenChange={setShowRevokeConfirm}
                onConfirm={confirmRevoke}
                title="Revoke invitation?"
                description={`Revoke the invitation to ${invite.email}? They will no longer be able to join.`}
                confirmLabel="Revoke"
                loading={revokeLoading}
            />
        </>
    )
}

import { useState, useEffect } from 'react'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Loader2, Trash2, Unlink, Shield, User, ShieldAlert } from "lucide-react"
import { getAdminUserDetails, updateUserRole, deleteUser } from '../actions'
import { toast } from "sonner"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

interface UserSheetProps {
    userId: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onClose: () => void
}

export function UserSheet({ userId, open, onOpenChange, onClose }: UserSheetProps) {
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleteLoading, setDeleteLoading] = useState(false)

    useEffect(() => {
        if (open && userId) {
            fetchDetails()
        } else {
            setUser(null)
        }
    }, [open, userId])

    const fetchDetails = async () => {
        setLoading(true)
        const data = await getAdminUserDetails(userId!)
        setUser(data)
        setLoading(false)
    }

    const handleSave = async () => {
        if (!user) return
        setSaving(true)
        const res = await updateUserRole(user.id, user.app_metadata?.role)
        setSaving(false)

        if (res.error) {
            toast.error("Error", {
                description: res.error,
            })
        } else {
            toast.success("Success", {
                description: "User updated successfully",
            })
            onClose()
        }
    }

    const handleDelete = async () => {
        setDeleteLoading(true)
        try {
            const res = await deleteUser(user.id)
            if (res.error) {
                toast.error("Error", { description: res.error })
            } else {
                toast.success("Success", { description: "User deleted successfully" })
                setShowDeleteConfirm(false)
                onClose()
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete user')
        } finally {
            setDeleteLoading(false)
        }
    }

    const getInitials = (name: string) => {
        return name
            ?.split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'U'
    }

    const getRoleIcon = (role: string) => {
        switch (role) {
            case 'super_admin':
                return <ShieldAlert className="h-4 w-4 text-primary" />
            case 'admin':
                return <Shield className="h-4 w-4 text-blue-500" />
            default:
                return <User className="h-4 w-4 text-muted-foreground" />
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto p-0 gap-0">
                {loading || !user ? (
                    <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : (
                    <>
                        <div className="bg-muted/30 p-6 pb-8 border-b">
                            <SheetHeader className="space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-16 w-16 border-2 border-background shadow-sm">
                                            <AvatarImage src={user.avatar} />
                                            <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                                                {getInitials(user.name || user.email)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="space-y-1">
                                            <SheetTitle className="text-xl">{user.name || 'Unnamed User'}</SheetTitle>
                                            <SheetDescription className="text-sm">
                                                {user.email}
                                            </SheetDescription>
                                            <div className="flex items-center gap-2 pt-1">
                                                <Badge variant="outline" className="gap-1.5 pl-1.5 pr-2.5 py-0.5 font-normal capitalize">
                                                    {getRoleIcon(user.app_metadata?.role || 'member')}
                                                    {(user.app_metadata?.role || 'member').replace('_', ' ')}
                                                </Badge>
                                                {user.status === 'pending' ? (
                                                    <Badge variant="outline" className="border-yellow-500 text-yellow-600 font-normal">
                                                        Pending
                                                    </Badge>
                                                ) : user.status === 'suspended' ? (
                                                    <Badge variant="outline" className="border-red-500 text-red-600 font-normal">
                                                        Suspended
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="font-normal">
                                                        Active
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </SheetHeader>
                        </div>

                        <div className="p-6 space-y-8">
                            <div className="space-y-4">
                                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Account Details</h3>
                                <div className="grid gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email Address</Label>
                                        <Input id="email" value={user.email} disabled className="bg-muted/50" />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="role">Platform Role</Label>
                                        <Select
                                            value={user.app_metadata?.role || 'member'}
                                            onValueChange={(val) => setUser({ ...user, app_metadata: { ...user.app_metadata, role: val } })}
                                        >
                                            <SelectTrigger className="bg-background">
                                                <SelectValue placeholder="Select role" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="member">
                                                    <div className="flex items-center gap-2">
                                                        <User className="h-4 w-4 text-muted-foreground" />
                                                        <span>Member</span>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="admin">
                                                    <div className="flex items-center gap-2">
                                                        <Shield className="h-4 w-4 text-blue-500" />
                                                        <span>Admin</span>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="super_admin">
                                                    <div className="flex items-center gap-2">
                                                        <ShieldAlert className="h-4 w-4 text-primary" />
                                                        <span>Super Admin</span>
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-[0.8rem] text-muted-foreground">
                                            Controls global access permissions across the platform.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Linked Accounts</h3>
                                    <Badge variant="outline">{user.linkedAccounts?.length || 0} Accounts</Badge>
                                </div>

                                {user.linkedAccounts?.length === 0 ? (
                                    <div className="rounded-lg border border-dashed p-8 text-center">
                                        <p className="text-sm text-muted-foreground">No linked accounts found.</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-3">
                                        {user.linkedAccounts?.map((account: any) => (
                                            <div
                                                key={account.id}
                                                className="group flex items-center justify-between rounded-lg border bg-card p-4 transition-all hover:bg-muted/50 hover:shadow-sm"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground">
                                                        {account.name[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-sm">{account.name}</p>
                                                        <p className="text-xs text-muted-foreground capitalize">{account.role}</p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10"
                                                >
                                                    <Unlink className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Separator />

                            <div className="flex items-center justify-between pt-2">
                                <Button
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setShowDeleteConfirm(true)}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete User
                                </Button>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                                    <Button onClick={handleSave} disabled={saving}>
                                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save Changes
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </SheetContent>

            <ConfirmDeleteDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
                onConfirm={handleDelete}
                title="Delete user?"
                description="This action cannot be undone. The user will lose all access."
                loading={deleteLoading}
            />
        </Sheet>
    )
}

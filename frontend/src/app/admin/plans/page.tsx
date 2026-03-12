'use client'

import { useState, useEffect } from 'react'
import { getAdminPlans, deletePlan } from './actions'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, CheckCircle, MoreHorizontal, Edit, Trash, Zap, Unplug } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { PlanDialog } from './plan-dialog'
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { cn } from "@/lib/utils"

export default function PlansPage() {
    const [plans, setPlans] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedPlan, setSelectedPlan] = useState<any>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const fetchPlans = async () => {
        setLoading(true)
        const res = await getAdminPlans()
        if (Array.isArray(res)) {
            setPlans(res)
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchPlans()
    }, [])

    const handleEdit = (plan: any) => {
        setSelectedPlan(plan)
        setIsDialogOpen(true)
    }

    const handleCreate = () => {
        setSelectedPlan(null)
        setIsDialogOpen(true)
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleteLoading(true)
        try {
            const res = await deletePlan(deleteTarget.id)
            if (res.error) {
                toast.error("Error", { description: res.error })
            } else {
                setDeleteTarget(null)
                setDeletingId(deleteTarget.id)
                setTimeout(() => {
                    setDeletingId(null)
                    toast.success("Success", { description: "Plan deleted successfully" })
                    fetchPlans()
                }, 500)
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete plan')
        } finally {
            setDeleteLoading(false)
        }
    }

    const handleDialogClose = (refresh: boolean) => {
        setIsDialogOpen(false)
        setSelectedPlan(null)
        if (refresh) fetchPlans()
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Subscription Plans</h1>
                    <p className="text-muted-foreground">Manage pricing tiers and features.</p>
                </div>
                <Button onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" /> New Plan
                </Button>
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {plans.map((plan) => (
                        <div key={plan.id} className={cn('flex flex-col gap-6 rounded-xl border bg-card p-6 relative', plan.is_default && 'ring-2 ring-primary/20 border-primary', deletingId === plan.id && 'animate-deleting')}>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between flex-wrap gap-1">
                                    <h2 className="text-lg font-bold leading-tight">{plan.name}</h2>
                                    <div className="flex gap-1">
                                        {plan.is_default && (
                                            <Badge variant="default">Default</Badge>
                                        )}
                                        {plan.is_hidden && (
                                            <Badge variant="secondary">Hidden</Badge>
                                        )}
                                        {plan.stripe_price_id ? (
                                            <Badge variant="outline" className="text-green-500 border-green-500/30 text-xs">
                                                <Zap className="h-3 w-3 mr-1" />
                                                Stripe
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 text-xs">
                                                <Unplug className="h-3 w-3 mr-1" />
                                                No Stripe
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <p className="flex items-baseline gap-1">
                                    <span className="text-4xl font-black leading-tight tracking-tight">
                                        ${(plan.price_cents / 100).toFixed(0)}
                                    </span>
                                    <span className="text-base font-medium text-muted-foreground">/ {plan.interval || 'month'}</span>
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 text-muted-foreground">
                                {plan.features?.map((feature: string, i: number) => (
                                    <div key={i} className="flex gap-3 items-center text-sm">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        {feature}
                                    </div>
                                ))}
                            </div>

                            <div className="mt-auto pt-6 flex gap-2">
                                <Button variant="secondary" className="flex-1" onClick={() => handleEdit(plan)}>
                                    Edit
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="secondary" size="icon">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handleEdit(plan)}>
                                            <Edit className="mr-2 h-4 w-4" /> Edit Details
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget({ id: plan.id, name: plan.name })}>
                                            <Trash className="mr-2 h-4 w-4" /> Delete Plan
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <PlanDialog
                plan={selectedPlan}
                open={isDialogOpen}
                onOpenChange={(open) => !open && handleDialogClose(false)}
                onClose={() => handleDialogClose(true)}
            />

            <ConfirmDeleteDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                onConfirm={confirmDelete}
                title="Delete plan?"
                description={`This will permanently delete the "${deleteTarget?.name}" plan.`}
                loading={deleteLoading}
            />
        </div>
    )
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getAuthToken, isTokenExpired } from '@/lib/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'

async function getAuthHeaders() {
    const token = await getAuthToken()
    if (!token || isTokenExpired(token)) return null
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    }
}

export async function getUserDetails() {
    const headers = await getAuthHeaders()
    if (!headers) {
        return null
    }

    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const res = await fetch(`${API_URL}/users/me`, {
            headers,
            cache: 'no-store',
            signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (!res.ok) {
            return null
        }

        return await res.json()
    } catch (error) {
        return null
    }
}

export async function getUserAccounts() {
    const headers = await getAuthHeaders()
    if (!headers) return []

    try {
        const res = await fetch(`${API_URL}/accounts`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) {
            return []
        }

        return await res.json()
    } catch (error) {
        return []
    }
}

export async function getAccountProjects(accountId: string) {
    const headers = await getAuthHeaders()
    if (!headers) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/projects`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) {
            const error = await res.json()
            console.error('Error fetching projects:', error)
            return []
        }

        return await res.json()
    } catch (error) {
        console.error('Error fetching projects:', error)
        return []
    }
}

export async function createProject(accountId: string, name: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/projects`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name }),
        })

        if (!res.ok) {
            const error = await res.json()
            return { error: error.message }
        }

        const project = await res.json()
        revalidatePath('/dashboard')
        return { success: true, project }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function getProjectDetails(projectId: string) {
    const headers = await getAuthHeaders()
    if (!headers) return null

    try {
        const res = await fetch(`${API_URL}/projects/${projectId}`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) {
            return null
        }

        return await res.json()
    } catch (error) {
        return null
    }
}

export async function updateProject(projectId: string, name: string, description?: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/projects/${projectId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ name, description }),
        })

        if (!res.ok) {
            const error = await res.json()
            return { error: error.message }
        }

        revalidatePath('/dashboard')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function deleteProject(projectId: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/projects/${projectId}`, {
            method: 'DELETE',
            headers,
        })

        if (!res.ok) {
            const error = await res.json()
            return { error: error.message }
        }

        revalidatePath('/dashboard')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function getSystemSettings() {
    const headers = await getAuthHeaders()
    if (!headers) return null

    try {
        const res = await fetch(`${API_URL}/system-settings`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) {
            return null
        }

        return await res.json()
    } catch (error) {
        return null
    }
}

export async function getAccountMembers(accountId: string) {
    const headers = await getAuthHeaders()
    if (!headers) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/members`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) {
            return []
        }

        return await res.json()
    } catch (error) {
        return []
    }
}

export async function getAccountInvitations(accountId: string) {
    const headers = await getAuthHeaders()
    if (!headers) return []

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/invitations`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) {
            return []
        }

        return await res.json()
    } catch (error) {
        return []
    }
}

export async function inviteMember(accountId: string, email: string, role: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/invitations`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email, role }),
        })

        if (!res.ok) {
            const error = await res.json()
            return { error: error.message }
        }

        revalidatePath(`/dashboard/settings/team`)
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function deleteInvitation(accountId: string, invitationId: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/invitations/${invitationId}`, {
            method: 'DELETE',
            headers,
        })

        if (!res.ok) {
            const error = await res.json()
            return { error: error.message }
        }

        revalidatePath(`/dashboard/settings/team`)
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function getPlans() {
    const headers = await getAuthHeaders()
    if (!headers) return []

    try {
        const res = await fetch(`${API_URL}/plans`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) {
            return []
        }

        return await res.json()
    } catch (error) {
        return []
    }
}

export async function getAccountSubscription(accountId: string) {
    const headers = await getAuthHeaders()
    if (!headers) return null

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}/subscription`, {
            headers,
            cache: 'no-store',
        })

        if (!res.ok) {
            return null
        }

        return await res.json()
    } catch (error) {
        return null
    }
}

export async function createAccount(name: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ name }),
        })

        if (!res.ok) {
            const error = await res.json()
            return { error: error.message }
        }

        const account = await res.json()
        revalidatePath('/dashboard')
        return { success: true, account }
    } catch (error: any) {
        return { error: error.message }
    }
}

export async function updateAccount(accountId: string, name: string) {
    const headers = await getAuthHeaders()
    if (!headers) return { error: 'Not authenticated' }

    try {
        const res = await fetch(`${API_URL}/accounts/${accountId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ name }),
        })

        if (!res.ok) {
            const error = await res.json()
            return { error: error.message }
        }

        revalidatePath('/dashboard')
        return { success: true }
    } catch (error: any) {
        return { error: error.message }
    }
}

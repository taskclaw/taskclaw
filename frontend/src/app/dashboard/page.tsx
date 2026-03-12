import { redirect } from 'next/navigation'
import { getBoards } from '@/app/dashboard/boards/actions'

export default async function DashboardPage() {
    const boards = await getBoards()

    // If exactly one board, go directly to it
    if (boards.length === 1) {
        redirect(`/dashboard/boards/${boards[0].id}`)
    }

    // Otherwise, show boards management page
    redirect('/dashboard/boards')
}

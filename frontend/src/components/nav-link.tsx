'use client'

import Link, { type LinkProps } from 'next/link'
import { usePathname } from 'next/navigation'
import type { AnchorHTMLAttributes } from 'react'

type NavLinkProps = LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>

/**
 * Drop-in replacement for Next.js <Link> that fires the navigation-loader:start
 * event on click so the loader overlay appears immediately — before the RSC
 * response arrives.
 *
 * Skips the event when navigating to the current page (no actual navigation).
 */
export function NavLink({ href, onClick, children, ...props }: NavLinkProps) {
    const pathname = usePathname()

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        const target = typeof href === 'string' ? href : href.pathname ?? ''
        const isSamePage = target === pathname || target === ''

        if (!isSamePage) {
            window.dispatchEvent(new Event('navigation-loader:start'))
        }

        onClick?.(e)
    }

    return (
        <Link href={href} onClick={handleClick} {...props}>
            {children}
        </Link>
    )
}

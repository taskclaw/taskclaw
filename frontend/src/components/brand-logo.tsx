import * as React from "react"
import { Command, GalleryVerticalEnd, AudioWaveform } from "lucide-react"
import Image from "next/image"

import { cn } from "@/lib/utils"

// Mapping for dynamic icon selection
const ICONS: Record<string, React.ElementType> = {
    Command,
    GalleryVerticalEnd,
    AudioWaveform,
}

interface BrandLogoProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "horizontal" | "square"
    name?: string
    logo?: React.ElementType
    theme?: "dark" | "light"
}

export function BrandLogo({
    className,
    variant = "square",
    // Allow props to override, but fallback to env vars, then defaults
    name,
    logo,
    theme,
    ...props
}: BrandLogoProps) {
    const envBrandName = process.env.NEXT_PUBLIC_BRAND_NAME
    const envLogoType = process.env.NEXT_PUBLIC_LOGO_TYPE
    const envIconName = process.env.NEXT_PUBLIC_BRAND_ICON_LOGO
    const envImagePath = process.env.NEXT_PUBLIC_BRAND_IMAGE_PATH

    const finalName = name || envBrandName || "TaskClaw"

    // Determine which Logo component to use (if icon mode)
    let LogoComponent = logo || Command
    if (!logo && envLogoType === "icon" && envIconName && ICONS[envIconName]) {
        LogoComponent = ICONS[envIconName]
    }

    // Default to image mode — use TaskClaw logo PNGs with theme switching
    const isImageMode = envLogoType === "image" || (!envLogoType && !logo)
    const darkLogoPath = "/images/logo/taskclaw_logo_dark.png"
    const lightLogoPath = "/images/logo/taskclaw_logo_light.png"
    const fallbackImagePath = envImagePath || darkLogoPath

    if (isImageMode) {
        if (variant === "horizontal") {
            return (
                <div className={cn("flex items-center gap-2 px-2 py-1", className)} {...props}>
                    {/* Show dark logo by default, light logo in light mode via CSS */}
                    <Image
                        src={theme === "light" ? lightLogoPath : darkLogoPath}
                        alt={finalName}
                        width={200}
                        height={56}
                        className={cn(
                            "h-14 w-auto object-contain",
                            !theme && "dark:block hidden"
                        )}
                        priority
                    />
                    {!theme && (
                        <Image
                            src={lightLogoPath}
                            alt={finalName}
                            width={200}
                            height={56}
                            className="h-14 w-auto object-contain dark:hidden block"
                            priority
                        />
                    )}
                </div>
            )
        }

        // Square variant — compact for sidebar
        return (
            <div className={cn("flex items-center gap-2 px-2 py-2", className)} {...props}>
                <Image
                    src={theme === "light" ? lightLogoPath : darkLogoPath}
                    alt={finalName}
                    width={160}
                    height={48}
                    className={cn(
                        "h-12 w-auto object-contain",
                        !theme && "dark:block hidden"
                    )}
                    priority
                />
                {!theme && (
                    <Image
                        src={lightLogoPath}
                        alt={finalName}
                        width={160}
                        height={48}
                        className="h-12 w-auto object-contain dark:hidden block"
                        priority
                    />
                )}
            </div>
        )
    }

    // Icon mode fallback (backwards compatibility)
    if (variant === "horizontal") {
        return (
            <div className={cn("flex items-center gap-2 px-2 py-2", className)} {...props}>
                <div className="flex h-8 w-full items-center justify-start">
                    <LogoComponent className="mr-2 size-6" />
                    <span className="text-lg font-bold truncate">{finalName}</span>
                </div>
            </div>
        )
    }

    // Square variant (icon mode)
    return (
        <div className={cn("flex items-center gap-2 px-2 py-2", className)} {...props}>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <LogoComponent className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-bold text-base">
                    {finalName}
                </span>
            </div>
        </div>
    )
}

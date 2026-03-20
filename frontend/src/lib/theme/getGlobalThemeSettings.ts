import { unstable_cache } from "next/cache";
import type { ThemeSetName } from "@/theme/theme.types";

/**
 * Global theme settings fetched from backend
 * NOTE: theme_mode has been removed - mode is now client-side only (localStorage)
 */
export interface GlobalThemeSettings {
  theme_set: ThemeSetName;
}

const DEFAULT_SETTINGS: GlobalThemeSettings = {
  theme_set: "corporate",
};

/**
 * Default API URL for development
 * In production, set NEXT_PUBLIC_API_URL or API_URL environment variable
 */
const DEFAULT_API_URL = "http://localhost:3003";

async function fetchThemeSettings(): Promise<GlobalThemeSettings> {
  try {
    // Use environment variable or fallback to localhost for development
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || DEFAULT_API_URL;

    const res = await fetch(`${apiUrl}/system-settings/theme`, {
      next: { tags: ["global-theme"] },
      // Timeout to avoid blocking SSR
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      console.warn(`[theme] Failed to fetch theme: ${res.status}`);
      return DEFAULT_SETTINGS;
    }

    const data = await res.json();
    
    return {
      theme_set: data.theme_set ?? "corporate",
    };
  } catch (error) {
    console.warn("[theme] Error fetching theme settings:", error);
    return DEFAULT_SETTINGS;
  }
}

// Cache with 60 second revalidation
// Tag "global-theme" allows manual invalidation after update
export const getGlobalThemeSettings = unstable_cache(
  fetchThemeSettings,
  ["global-theme-settings"],
  {
    revalidate: 60,
    tags: ["global-theme"],
  }
);

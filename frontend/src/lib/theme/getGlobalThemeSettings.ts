import { unstable_cache } from "next/cache";
import type { ThemeSetName } from "@/theme/theme.types";
import { serverApiBase } from "@/lib/api-base";

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

async function fetchThemeSettings(): Promise<GlobalThemeSettings> {
  try {
    // Host-portable: resolve the backend base at runtime (INTERNAL_API_URL),
    // never inline a host-specific URL at build time.
    const apiUrl = serverApiBase();

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

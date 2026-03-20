"use server";

import { revalidateTag } from "next/cache";
import { getAuthToken } from "@/lib/auth";

interface UpdateThemeData {
  theme_set: string;
}

interface UpdateResult {
  success?: boolean;
  error?: string;
}

export async function updateGlobalTheme(
  data: UpdateThemeData,
): Promise<UpdateResult> {
  try {
    const token = await getAuthToken();

    if (!token) {
      return { error: "Unauthorized - no token" };
    }

    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.API_URL ||
      "http://localhost:3003";
    const res = await fetch(`${apiUrl}/system-settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const error = await res.json();
      return { error: error.message || "Failed to update theme" };
    }

    // CRITICAL: Invalidate cache so all users see the new theme
    revalidateTag("global-theme");

    return { success: true };
  } catch (error) {
    console.error("Error updating theme:", error);
    return { error: "An unexpected error occurred" };
  }
}

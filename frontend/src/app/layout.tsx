import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AppThemeProvider } from "@/components/theme/AppThemeProvider";
import { GlobalThemeInjector } from "@/components/theme/GlobalThemeInjector";
import { getThemeSetFromEnv } from "@/config/theme-env";
import { getGlobalThemeSettings } from "@/lib/theme/getGlobalThemeSettings";
import { THEME_SETS, getThemeSet } from "@/theme/themeConfig";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: 'TaskClaw — Where Tasks Begin Themselves',
    template: '%s | TaskClaw',
  },
  description:
    'Open-source AI task orchestration. Sync Notion, ClickUp, and more into one Kanban board. Let AI execute your tasks on your own infrastructure.',
  keywords: [
    'task management',
    'open source',
    'kanban board',
    'ai task automation',
    'self-hosted',
    'notion alternative',
    'clickup alternative',
    'project management',
    'ai productivity',
    'openclaw',
    'taskclaw',
  ],
  authors: [{ name: 'TaskClaw' }],
  creator: 'TaskClaw',
  publisher: 'TaskClaw',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  ),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'TaskClaw',
    title: 'TaskClaw — Where Tasks Begin Themselves',
    description:
      'Open-source AI task orchestration. Sync all your tools into one board. Let AI do the heavy lifting.',
    images: [
      {
        url: '/images/og/taskclaw-og.png',
        width: 1200,
        height: 630,
        alt: 'TaskClaw — Open Source AI Task Orchestration',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TaskClaw — Where Tasks Begin Themselves',
    description:
      'Open-source AI task orchestration. Sync all your tools. Let AI execute.',
    images: ['/images/og/taskclaw-og.png'],
    creator: '@taskclaw',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large' as const,
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch only theme_set from the backend (mode is client-side)
  let themeSettings;
  try {
    themeSettings = await getGlobalThemeSettings();
  } catch {
    // Fallback to environment variable
    themeSettings = {
      theme_set: getThemeSetFromEnv(),
    };
  }

  const themeSet = getThemeSet(themeSettings.theme_set);
  const tokensByMode = THEME_SETS[themeSet].modes;

  // Anti-flicker boot script with OS preference detection.
  // This runs BEFORE React hydration to avoid a flash of the wrong theme.
  const themeInitScript = `(function(){
    try {
      var STORAGE_KEY = "mf:theme-mode";
      var stored = localStorage.getItem(STORAGE_KEY);
      var mode;
      
      // Determine mode: localStorage > OS preference
      if (stored === "dark" || stored === "light") {
        mode = stored;
      } else {
        // "system" or null: detect OS preference
        mode = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      
      var root = document.documentElement;
      
      // Apply Tailwind's dark class
      root.classList.toggle("dark", mode === "dark");
      
      // Apply color-scheme for native elements (scrollbars, inputs)
      root.style.colorScheme = mode;
      
      // Apply theme-set CSS variables
      var tokens = ${JSON.stringify(tokensByMode)};
      var modeTokens = tokens[mode] || tokens.light;
      
      if (modeTokens && modeTokens.colors) {
        for (var key in modeTokens.colors) {
          if (Object.prototype.hasOwnProperty.call(modeTokens.colors, key)) {
            root.style.setProperty("--" + key, modeTokens.colors[key]);
          }
        }
      }
      
      if (modeTokens && modeTokens.radius && modeTokens.radius.radius) {
        root.style.setProperty("--radius", modeTokens.radius.radius);
      }
    } catch (e) {
      console.error("Theme init error:", e);
    }
  })();`;

  return (
    <html lang="en" data-app-theme={themeSet} suppressHydrationWarning>
      <head>
        <GlobalThemeInjector themeSet={themeSet} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppThemeProvider themeSet={themeSet}>
          {children}
          <Toaster />
        </AppThemeProvider>
      </body>
    </html>
  );
}

"use client";

import { AppLogo } from '@/components/app-logo';
import { LanguageSelector } from '@kit/ui/language-selector';

export function Footer() {
  return (
    <footer className="relative py-10 border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center gap-4">
          <AppLogo className="w-[85px] md:w-[95px]" />
          <p className="text-foreground/50 text-sm">
            Where tasks begin themselves.
          </p>
          <div className="flex items-center gap-4 text-xs text-foreground/40">
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground/70 transition-colors"
            >
              Twitter
            </a>
            <span className="text-foreground/20">&middot;</span>
            <a
              href="mailto:hello@onset.dev"
              className="hover:text-foreground/70 transition-colors"
            >
              hello@onset.dev
            </a>
            <span className="text-foreground/20">&middot;</span>
            <span>&copy; {new Date().getFullYear()} TaskClaw</span>
          </div>
          <LanguageSelector />
        </div>
      </div>
    </footer>
  );
}

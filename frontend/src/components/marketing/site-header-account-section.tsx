'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';

// Local minimal user shape (was the GoTrue User type).
type User = { id?: string; email?: string; user_metadata?: Record<string, unknown>; [k: string]: unknown };

import { Button } from '@kit/ui/button';
import { If } from '@kit/ui/if';
import { Trans } from '@kit/ui/trans';

import featuresFlagConfig from '@/config/feature-flags.config';
import pathsConfig from '@/config/paths.config';
import CtaButton from './CtaButton';

// Check if fake door validation is enabled
const FAKEDOOR_ENABLED = process.env.NEXT_PUBLIC_FAKEDOOR_ENABLE === 'true';

const ModeToggle = dynamic(() =>
  import('@kit/ui/mode-toggle').then((mod) => ({
    default: mod.ModeToggle,
  })),
);

const features = {
  enableThemeToggle: featuresFlagConfig.enableThemeToggle,
};

export function SiteHeaderAccountSection({
  user,
}: React.PropsWithChildren<{
  user: User | null;
}>) {
  if (!user) {
    return <AuthButtons />;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden md:flex">
        <If condition={features.enableThemeToggle}>
          <ModeToggle />
        </If>
      </div>

      <Button asChild variant="outline">
        <Link href={pathsConfig.app.home}>
          Dashboard
        </Link>
      </Button>
    </div>
  );
}

function AuthButtons() {
  // When fake door is enabled, show the CTA button instead of auth buttons
  if (FAKEDOOR_ENABLED) {
    return (
      <div className={'flex gap-x-2.5 mr-4'}>
        <div className={'hidden md:flex'}>
          <If condition={features.enableThemeToggle}>
            <ModeToggle />
          </If>
        </div>

        <CtaButton
          variant="primary"
          size="sm"
          ctaId="header-cta"
          className="rounded-md py-1.5 px-3 text-sm font-medium"
        >
          <Trans i18nKey={'common:header-right-cta'} defaults="Get Started" />
        </CtaButton>
      </div>
    );
  }

  // Default behavior when fake door is disabled
  return (
    <div className={'flex gap-x-2.5 mr-4'}>
      <div className={'hidden md:flex'}>
        <If condition={features.enableThemeToggle}>
          <ModeToggle />
        </If>
      </div>

      <div className={'flex gap-x-2.5'}>
        <Button className={'hidden md:block'} asChild variant={'ghost'}>
          <Link href={pathsConfig.auth.signIn}>
            <Trans i18nKey={'auth:signIn'} defaults="Sign In" />
          </Link>
        </Button>

        <Button asChild className="group" variant={'default'}>
          <Link href={pathsConfig.auth.signUp}>
            <Trans i18nKey={'auth:signUp'} defaults="Sign Up" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

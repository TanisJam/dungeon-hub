import type { ReactNode } from 'react';
import { TopBar } from './topbar';
import { TabBar } from './tabbar';

type AppShellProps = {
  title: string;
  subtitle?: ReactNode;
  rightAction?: ReactNode;
  constructorHref?: string;
  children: ReactNode;
};

/**
 * AppShell — authenticated page shell.
 * Renders TopBar (sticky), scrollable main content with bottom padding,
 * and fixed TabBar at the bottom.
 * Server component — TopBar and TabBar handle their own client boundaries.
 */
export function AppShell({
  title,
  subtitle,
  rightAction,
  constructorHref,
  children,
}: AppShellProps) {
  return (
    <>
      <TopBar title={title} subtitle={subtitle} right={rightAction} />
      <main className="mx-auto max-w-sm px-4 py-4 pb-24">{children}</main>
      <TabBar constructorHref={constructorHref} />
    </>
  );
}

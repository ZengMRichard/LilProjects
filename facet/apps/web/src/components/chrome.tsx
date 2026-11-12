"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { api } from "@/lib/api/client";
import { useMe } from "@/lib/api/hooks";
import type { Me } from "@/lib/api/types";
import { cx } from "@/lib/format";
import { Logo, Spinner } from "./icons";

export const DISCLAIMER = "General information, not a diagnosis or medical advice.";

const NAV = [
  { href: "/reports", label: "Reports" },
  { href: "/progress", label: "Progress" },
  { href: "/plan", label: "Plan" },
  { href: "/settings", label: "Settings" },
];

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-[15px] font-medium tracking-tight text-fg">
      <Logo />
      Facet
    </Link>
  );
}

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-black/70 backdrop-blur-xl">
      <div className="shell flex h-16 items-center justify-between gap-6">
        <Wordmark />
        {signedIn ? (
          <nav className="flex items-center gap-1 overflow-x-auto text-sm" aria-label="Main">
            {NAV.map((item) => {
              const active =
                pathname === item.href || (item.href === "/reports" && pathname.startsWith("/report"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "rounded-full px-3.5 py-1.5 transition-colors",
                    active ? "bg-powder-300/10 text-powder-200" : "text-fg-2 hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link href="/scan" className="btn btn-primary btn-sm ml-2">
              New scan
            </Link>
          </nav>
        ) : (
          <nav className="flex items-center gap-2 text-sm" aria-label="Main">
            <Link href="/sample" className="btn btn-ghost btn-sm hidden sm:inline-flex">
              Sample report
            </Link>
            <Link href="/signin" className="btn btn-secondary btn-sm">
              Sign in
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="no-print mt-24 border-t border-line">
      <div className="shell flex flex-col gap-6 py-10 text-sm text-fg-3 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md space-y-3">
          <Wordmark />
          <p>
            {DISCLAIMER} Facet is for adults aged 18 or older and analyses only the account holder's own face.
          </p>
        </div>
        <div className="space-y-2 md:text-right">
          <p className="num text-xs uppercase tracking-widest text-fg-3">Development build</p>
          <p className="max-w-xs md:ml-auto">
            Reference ranges are provisional placeholders and the skin snapshot is experimental. Not for
            release.
          </p>
        </div>
      </div>
    </footer>
  );
}

export function ResultsDisclaimer() {
  return (
    <p className="mt-10 border-t border-line pt-5 text-center text-xs text-fg-3" role="note">
      {DISCLAIMER}
    </p>
  );
}

export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-fg-2" role="status">
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-bad/30 bg-bad/5 px-4 py-3 text-sm text-bad">
      {children}
    </p>
  );
}

/** Wraps signed-in pages: sends visitors to sign-in, and to onboarding when a scan needs it. */
export function AppShell({
  children,
  title,
  intro,
  actions,
  narrow,
}: {
  children: (me: Me) => ReactNode;
  title?: string;
  intro?: ReactNode;
  actions?: ReactNode;
  narrow?: boolean;
}) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const unauthenticated = me.error?.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace(`/signin?next=${encodeURIComponent(pathname)}`);
  }, [unauthenticated, router, pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader signedIn={Boolean(me.data)} />
      <main className={cx("shell flex-1 py-10 md:py-14", narrow && "max-w-3xl")}>
        {(title || actions) && (
          <div className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl space-y-3">
              {title && <h1 className="text-3xl font-medium md:text-[2.5rem] md:leading-[1.1]">{title}</h1>}
              {intro && <p className="text-fg-2">{intro}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}
        {me.data ? (
          children(me.data)
        ) : me.error && !unauthenticated ? (
          <ErrorNote>{me.error.message}</ErrorNote>
        ) : (
          <PageLoading />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export async function signOut() {
  await api("/v1/auth/session", { method: "DELETE" });
  window.location.href = "/";
}

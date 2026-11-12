"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { ErrorNote, Wordmark } from "@/components/chrome";
import { IconArrow, Spinner } from "@/components/icons";
import { ApiError, api } from "@/lib/api/client";
import type { MagicLinkResponse, Me } from "@/lib/api/types";

function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/reports";
}

function SignInForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const link = await api<MagicLinkResponse>("/v1/auth/magic-link", { method: "POST", json: { email } });
      if (!link.dev_token) {
        setError("Check your inbox for a sign-in link.");
        return;
      }
      // Development has no mail server, so the link's token comes straight back.
      const me = await api<Me>("/v1/auth/session", { method: "POST", json: { token: link.dev_token } });
      const ready =
        me.age_verified && me.consents.some((c) => c.type === "biometric_processing" && c.granted);
      router.replace(ready ? next : `/onboarding?next=${encodeURIComponent(next)}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card card-raised w-full max-w-md space-y-6 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-medium">Sign in to Facet</h1>
        <p className="text-sm text-fg-2">
          Enter your email and we will sign you in. No password to remember.
        </p>
      </div>
      <label className="block space-y-2 text-sm">
        <span className="text-fg-2">Email</span>
        <input
          className="field"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {error && <ErrorNote>{error}</ErrorNote>}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? <Spinner /> : null}
        Continue <IconArrow size={16} />
      </button>
      <p className="text-xs leading-relaxed text-fg-3">
        Development build: the sign-in link is applied instantly instead of being emailed. Facet is for adults
        aged 18 or older.
      </p>
    </form>
  );
}

export default function SignInPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-10 px-5 py-16">
      <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative">
        <Wordmark />
      </div>
      <div className="relative flex w-full justify-center">
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
    </main>
  );
}

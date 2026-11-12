"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { AppShell, ErrorNote } from "@/components/chrome";
import { IconArrow, IconCheck, IconShield, IconX } from "@/components/icons";
import { ApiError, api } from "@/lib/api/client";
import { useSetConsent } from "@/lib/api/hooks";
import type { Me } from "@/lib/api/types";

const COLLECT = [
  "Photos of your face from three angles: front, left and right.",
  "A map of points on your face (face geometry), worked out from those photos, and the measurements in your report.",
];
const PROMISES = [
  "Used only to build your report. Nothing else.",
  "Photos are encrypted and deleted 30 days after your report is delivered, or immediately if you choose.",
  "Face geometry and measurements are kept until you withdraw consent or delete your account.",
  "You can withdraw consent at any time in Settings. That deletes your photos and face geometry at once.",
];
const NEVER = [
  "No face recognition, and no matching your face against anyone else's.",
  "Never sold or shared for advertising.",
  "Never used to train models unless you separately opt in under Settings.",
];

function Steps({ me }: { me: Me }) {
  const router = useRouter();
  const client = useQueryClient();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/scan";
  const biometric = me.consents.find((c) => c.type === "biometric_processing")!;
  const setConsent = useSetConsent();
  const [birthDate, setBirthDate] = useState("");
  const [read, setRead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitAge(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api<Me>("/v1/me/age", { method: "POST", json: { birth_date: birthDate } });
      await client.invalidateQueries({ queryKey: ["me"] });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (me.age_blocked) {
    return (
      <div className="card p-8">
        <h2 className="text-xl font-medium">Facet is only for adults</h2>
        <p className="mt-3 text-sm leading-relaxed text-fg-2">
          You need to be 18 or older to use Facet, so we cannot offer you a scan. Nothing about your face has
          been collected. You can delete this account from Settings.
        </p>
      </div>
    );
  }

  if (!me.age_verified) {
    return (
      <form onSubmit={submitAge} className="card card-raised space-y-6 p-8">
        <div>
          <p className="eyebrow">Step 1 of 2</p>
          <h2 className="mt-2 text-2xl font-medium">Confirm your age</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
            Facet is for people aged 18 or older. We check your date of birth once and keep only the result,
            never the date.
          </p>
        </div>
        <label className="block max-w-xs space-y-2 text-sm">
          <span className="text-fg-2">Date of birth</span>
          <input
            className="field"
            type="date"
            name="birth_date"
            required
            max={new Date().toISOString().slice(0, 10)}
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
          />
        </label>
        {error && <ErrorNote>{error}</ErrorNote>}
        <button type="submit" className="btn btn-primary" disabled={busy || !birthDate}>
          Continue <IconArrow size={16} />
        </button>
      </form>
    );
  }

  if (!biometric.granted) {
    return (
      <div className="card card-raised space-y-7 p-8">
        <div>
          <p className="eyebrow">Step 2 of 2 · Biometric consent</p>
          <h2 className="mt-2 text-2xl font-medium">Your face geometry is biometric data</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
            We need your written consent before the camera turns on. This screen covers processing your face
            for your own report and nothing else. Research use and analyst review are separate choices, off by
            default, in Settings.
          </p>
        </div>
        <ConsentList title="What we collect" icon="check" items={COLLECT} />
        <ConsentList title="How it is used and kept" icon="check" items={PROMISES} />
        <ConsentList title="What we never do" icon="x" items={NEVER} />
        <p className="flex gap-3 rounded-xl border border-line-2 bg-powder-300/[0.04] p-4 text-[13px] leading-relaxed text-fg-2">
          <IconShield className="mt-0.5 shrink-0 text-powder-300" size={16} />
          In this build the face mesh runs in your browser, and your photos go only to the Facet server you
          are running. Consent text version {biometric.version}.
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-powder-300"
            checked={read}
            onChange={(event) => setRead(event.target.checked)}
          />
          <span>
            I have read this, and I consent to Facet processing my face geometry to build my report.
          </span>
        </label>
        {setConsent.error && <ErrorNote>{setConsent.error.message}</ErrorNote>}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!read || setConsent.isPending}
            onClick={() =>
              setConsent.mutate(
                { type: "biometric_processing", version: biometric.version, grant: true },
                { onSuccess: () => router.replace(next) },
              )
            }
          >
            I consent <IconArrow size={16} />
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => router.replace("/reports")}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-8">
      <h2 className="text-xl font-medium">You are all set</h2>
      <p className="mt-2 text-sm text-fg-2">Your age is confirmed and biometric consent is recorded.</p>
      <button type="button" className="btn btn-primary mt-6" onClick={() => router.replace(next)}>
        Continue <IconArrow size={16} />
      </button>
    </div>
  );
}

function ConsentList({ title, items, icon }: { title: string; items: string[]; icon: "check" | "x" }) {
  const Icon = icon === "check" ? IconCheck : IconX;
  return (
    <div>
      <h3 className="eyebrow mb-3">{title}</h3>
      <ul className="space-y-2.5 text-sm leading-relaxed text-fg-2">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <Icon
              size={16}
              className={`mt-0.5 shrink-0 ${icon === "check" ? "text-powder-300" : "text-fg-3"}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <AppShell narrow title="Before your first scan" intro="Two short steps: your age, then your consent.">
      {(me) => (
        <Suspense>
          <Steps me={me} />
        </Suspense>
      )}
    </AppShell>
  );
}

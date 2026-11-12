"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, ErrorNote, signOut } from "@/components/chrome";
import { IconDownload, IconTrash } from "@/components/icons";
import { api } from "@/lib/api/client";
import { useAudit, useScans, useSetConsent } from "@/lib/api/hooks";
import type { ConsentState, Me } from "@/lib/api/types";
import { formatDate, formatDateTime } from "@/lib/format";

const CONSENT_COPY: Record<string, { body: string; off: string }> = {
  biometric_processing: {
    body: "Lets Facet process photos of your face and the face geometry worked out from them, to build your own report. Required for scanning.",
    off: "Withdrawing deletes your stored photos and face geometry immediately and stops new scans. Your past measurements stay until you delete your account.",
  },
  research_use: {
    body: "Lets Facet use your scans to improve its models. Off unless you turn it on, and never bundled with anything else. Nothing in this build uses scans for research; the switch only records your choice.",
    off: "",
  },
  analyst_review: {
    body: "Lets a human analyst view your photos to correct landmarks and write commentary. Asked for only when you buy an analyst review, which is not available yet.",
    off: "",
  },
};

const ACTION_LABEL: Record<string, string> = {
  "image.upload": "Photo uploaded",
  "image.read": "Photo read to build the report",
  "image.url": "Photo link issued",
  "object.read": "File opened",
  "image.delete": "Photo deleted",
  "image.export": "Photo included in an export",
  "pdf.render": "PDF created",
  "pdf.delete": "PDF deleted",
  "landmarks.delete": "Face geometry deleted",
  "consent.grant": "Consent given",
  "consent.revoke": "Consent withdrawn",
  "account.export": "Data exported",
};

function ConsentCard({ consent }: { consent: ConsentState }) {
  const mutate = useSetConsent();
  const copy = CONSENT_COPY[consent.type]!;
  const toggle = () => {
    if (
      consent.granted &&
      consent.type === "biometric_processing" &&
      !window.confirm(`${copy.off}\n\nWithdraw consent?`)
    )
      return;
    mutate.mutate({ type: consent.type, version: consent.version, grant: !consent.granted });
  };
  return (
    <li className="card p-5" data-consent={consent.type}>
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-medium">{consent.title}</h3>
            {consent.required && <span className="pill">Required to scan</span>}
            {!consent.available && <span className="pill">Not available yet</span>}
          </div>
          <p className="text-sm leading-relaxed text-fg-2">{copy.body}</p>
          <p className="text-xs text-fg-3">
            {consent.granted && consent.granted_at
              ? `Given on ${formatDate(consent.granted_at)} · text version ${consent.version}`
              : consent.revoked_at
                ? `Withdrawn on ${formatDate(consent.revoked_at)}`
                : "Not given"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={consent.granted}
          aria-label={consent.title}
          disabled={!consent.available || mutate.isPending}
          onClick={toggle}
          className={`relative mt-1 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${
            consent.granted ? "border-powder-300 bg-powder-300" : "border-line-3 bg-ink-700"
          }`}
        >
          <span
            className={`absolute top-0.5 size-[18px] rounded-full transition-all ${
              consent.granted ? "left-[22px] bg-black" : "left-0.5 bg-fg-2"
            }`}
          />
        </button>
      </div>
      {mutate.error && (
        <div className="mt-3">
          <ErrorNote>{mutate.error.message}</ErrorNote>
        </div>
      )}
    </li>
  );
}

function SettingsScreen({ me }: { me: Me }) {
  const client = useQueryClient();
  const scans = useScans();
  const [showAudit, setShowAudit] = useState(false);
  const audit = useAudit(showAudit);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stored = (scans.data ?? []).filter((scan) => scan.images.some((image) => image.stored));

  async function deletePhotos(scanId: string) {
    await api(`/v1/scans/${scanId}/images/purge`, { method: "POST" });
    await client.invalidateQueries();
  }

  async function deleteAccount() {
    setError(null);
    try {
      await api("/v1/me", { method: "DELETE" });
      window.location.href = "/";
    } catch {
      setError("The account could not be deleted. Try again.");
    }
  }

  return (
    <div className="space-y-14">
      <section aria-labelledby="account">
        <h2 id="account" className="eyebrow mb-4">
          Account
        </h2>
        <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-[15px] font-medium">{me.email}</p>
            <p className="mt-1 text-xs text-fg-3">
              {me.age_blocked
                ? "Under 18: scanning is not available"
                : me.age_verified
                  ? "Age confirmed, 18 or older"
                  : "Age not confirmed yet"}{" "}
              · region {me.region}
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </section>

      <section aria-labelledby="consents">
        <h2 id="consents" className="eyebrow mb-4">
          Consent
        </h2>
        <p className="mb-4 max-w-2xl text-sm leading-relaxed text-fg-2">
          Three separate choices. None is bundled with another, and each can be withdrawn here at any time.
        </p>
        <ul className="space-y-3">
          {me.consents.map((consent) => (
            <ConsentCard key={consent.type} consent={consent} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="photos">
        <h2 id="photos" className="eyebrow mb-4">
          Photos
        </h2>
        <p className="mb-4 max-w-2xl text-sm leading-relaxed text-fg-2">
          Photos are encrypted and deleted automatically {me.image_retention_days} days after each report is
          delivered. You can delete them sooner; your measurements are not affected.
        </p>
        {stored.length === 0 ? (
          <p className="card p-5 text-sm text-fg-3">No photos are stored.</p>
        ) : (
          <ul className="space-y-3">
            {stored.map((scan) => {
              const purge = scan.images.find((image) => image.stored)?.purge_at;
              return (
                <li key={scan.id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
                  <div>
                    <p className="text-[15px] font-medium">
                      Scan of <span className="num">{formatDate(scan.created_at)}</span>
                    </p>
                    <p className="mt-1 text-xs text-fg-3">
                      {scan.images.filter((image) => image.stored).length} photos
                      {purge ? ` · deleted automatically on ${formatDate(purge)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void deletePhotos(scan.id)}
                  >
                    <IconTrash size={15} />
                    Delete now
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="data">
        <h2 id="data" className="eyebrow mb-4">
          Your data
        </h2>
        <div className="card divide-y divide-line">
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="max-w-xl">
              <p className="text-[15px] font-medium">Export everything</p>
              <p className="mt-1 text-sm text-fg-2">
                A zip with your account, consents, scans, face geometry, measurements, reports, any stored
                photos and the access log.
              </p>
            </div>
            <a href="/v1/me/export" className="btn btn-secondary btn-sm" download>
              <IconDownload size={15} />
              Download export
            </a>
          </div>
          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-xl">
                <p className="text-[15px] font-medium">Access log</p>
                <p className="mt-1 text-sm text-fg-2">Every time a photo was read or deleted, and by what.</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowAudit(!showAudit)}
              >
                {showAudit ? "Hide" : "Show"} log
              </button>
            </div>
            {showAudit && (
              <div className="mt-5 max-h-80 overflow-auto rounded-xl border border-line">
                <table className="w-full text-left text-[13px]">
                  <thead className="sticky top-0 bg-ink-850 text-fg-3">
                    <tr>
                      <th className="px-4 py-2.5 font-normal">When</th>
                      <th className="px-4 py-2.5 font-normal">What</th>
                      <th className="px-4 py-2.5 font-normal">By</th>
                    </tr>
                  </thead>
                  <tbody className="text-fg-2">
                    {(audit.data ?? []).map((entry, index) => (
                      <tr key={index} className="border-t border-line">
                        <td className="whitespace-nowrap px-4 py-2 num">{formatDateTime(entry.at)}</td>
                        <td className="px-4 py-2">{ACTION_LABEL[entry.action] ?? entry.action}</td>
                        <td className="px-4 py-2 text-fg-3 num">
                          {entry.actor.startsWith("user:") ? "you" : entry.actor}
                        </td>
                      </tr>
                    ))}
                    {audit.data?.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-4 text-fg-3">
                          Nothing yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="danger">
        <h2 id="danger" className="eyebrow mb-4">
          Delete account
        </h2>
        <div className="card space-y-4 border-bad/25 p-5">
          <p className="max-w-2xl text-sm leading-relaxed text-fg-2">
            Deletes your account, photos, face geometry, measurements and reports. This cannot be undone. Type{" "}
            <span className="text-fg num">delete</span> to confirm.
          </p>
          <div className="flex flex-wrap gap-3">
            <input
              className="field max-w-[12rem]"
              aria-label="Type delete to confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="delete"
            />
            <button
              type="button"
              className="btn btn-danger"
              disabled={confirm.trim().toLowerCase() !== "delete"}
              onClick={() => void deleteAccount()}
            >
              <IconTrash size={16} />
              Delete my account
            </button>
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell
      narrow
      title="Settings"
      intro="Consent, photos and your data. Everything here takes effect immediately."
    >
      {(me) => <SettingsScreen me={me} />}
    </AppShell>
  );
}

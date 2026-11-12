import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import { HeroMesh } from "@/components/hero-mesh";
import {
  IconArrow,
  IconCamera,
  IconCheck,
  IconHeart,
  IconRuler,
  IconShield,
  IconWave,
} from "@/components/icons";
import { MetricCard } from "@/components/report/metric-card";
import type { MetricCard as Card } from "@/lib/api/types";

const EXAMPLE: Card = {
  key: "eyes.canthal_tilt",
  region: "eyes",
  title: "Canthal tilt",
  unit: "deg",
  locked: false,
  experimental: false,
  value: 4.2,
  display: "+4.2°",
  ci_low: 3.4,
  ci_high: 5.0,
  ci_display: "+3.4° to +5.0°",
  confidence: "high",
  confidence_reason: "Repeat measurements on this frame varied by about 10% of the reference range.",
  reference: {
    low: 1,
    high: 9,
    range_display: "1° to 9°",
    band: "typical",
    side: "typical",
    borderline: false,
    provisional: true,
    group_label: "Adults, pooled",
  },
  what: "The angle of the line from the inner corner to the outer corner of each eye, averaged over both eyes.",
  meaning:
    "Your outer eye corners sit slightly higher than the inner corners, which is the most common arrangement.",
  definition: "arctan((y_en - y_ex) / (x_ex - x_en)), mean of both eyes",
  landmarks: ["endocanthion", "exocanthion"],
};

const STEPS = [
  {
    icon: IconCamera,
    title: "Guided capture",
    body: "Three views: front, left and right. The camera checks your head angle, lighting, sharpness and expression live, and takes the photo for you when everything lines up.",
  },
  {
    icon: IconRuler,
    title: "Landmarks, then plain geometry",
    body: "A face mesh finds the points. Ordinary maths turns them into ratios and angles, scaled by the distance between your pupils, so every number is explainable and repeatable.",
  },
  {
    icon: IconWave,
    title: "A report that shows its working",
    body: "Each card gives what was measured, your value, the typical range, what it means in plain words, and how confident the system is.",
  },
];

const PRINCIPLES = [
  {
    icon: IconRuler,
    title: "No score. No ranking.",
    body: "There is no overall number and no comparison with other users. Values are described against a range, never graded.",
  },
  {
    icon: IconWave,
    title: "Honest about uncertainty",
    body: "Every measurement is repeated under small changes to the frame. The spread becomes the interval you see on the card.",
  },
  {
    icon: IconShield,
    title: "Your face stays yours",
    body: "Written opt-in consent before any capture. Photos are encrypted, deleted after 30 days or at once if you ask, and never used to identify anyone.",
  },
  {
    icon: IconHeart,
    title: "Conservative by design",
    body: "Lifestyle and skincare first, each with an evidence level. Procedures appear only as questions to take to a qualified professional.",
  },
];

const TIERS = [
  {
    name: "Free preview",
    price: "$0",
    note: "",
    items: ["Face shape", "Three headline proportions", "Skin snapshot", "Starter routine"],
    available: true,
  },
  {
    name: "Full report",
    price: "$29",
    note: "one-time",
    items: [
      "All measured proportions",
      "Symmetry map",
      "Full routine plan with evidence levels",
      "PDF export",
    ],
    available: true,
    featured: true,
  },
  {
    name: "Tracking",
    price: "$9.99",
    note: "per month",
    items: ["Re-scan every 14 days", "Change measured against noise", "Plan check-ins"],
    available: false,
  },
  {
    name: "Analyst review",
    price: "$149",
    note: "one-time",
    items: ["A human corrects the landmarks", "Written commentary", "Video walkthrough"],
    available: false,
  },
];

const FAQ = [
  {
    q: "Will this tell me how attractive I am?",
    a: "No. Nothing here has been shown to predict how other people see you, and Facet gives no overall score. It measures proportions and tells you where each one sits against a reference range.",
  },
  {
    q: "What happens to my photos?",
    a: "They are encrypted at rest, used only to build your report, and deleted 30 days after it is delivered, or immediately if you choose. Every access and every deletion is written to an audit log you can read in Settings.",
  },
  {
    q: "How accurate is it?",
    a: "This is a development build. Landmarks come from a general-purpose face mesh, the reference ranges are provisional placeholders, and the skin snapshot is experimental. Each card shows its own interval and confidence so you can judge for yourself.",
  },
  {
    q: "Who can use it?",
    a: "Adults aged 18 or older, for their own face only. Capture needs a live camera and a blink, to discourage uploading photos of other people.",
  },
];

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader signedIn={false} />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
          <div
            className="pointer-events-none absolute left-1/2 top-[-18rem] size-[46rem] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgb(100 164 214 / 0.28), transparent)" }}
            aria-hidden="true"
          />
          <div className="shell relative grid items-center gap-10 pb-20 pt-16 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-24">
            <div className="rise space-y-8">
              <span className="pill pill-accent">Measured, not scored</span>
              <h1 className="text-[2.75rem] font-medium leading-[1.02] sm:text-6xl lg:text-[4.5rem]">
                Understand your face, <span className="text-powder-300">in numbers you can trust.</span>
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-fg-2">
                Facet turns three guided selfies into a measured report on your facial proportions, in under
                two minutes. Plain explanations, conservative advice, and no attractiveness score.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/signin?next=/scan" className="btn btn-primary">
                  Start a scan <IconArrow size={16} />
                </Link>
                <Link href="/sample" className="btn btn-secondary">
                  See a sample report
                </Link>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-3">
                {["18+ only", "Photos deleted after 30 days", "No face recognition, ever"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <IconCheck size={14} className="text-powder-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative mx-auto aspect-square w-full max-w-[34rem]">
              <div className="absolute inset-[6%] rounded-full border border-line" aria-hidden="true" />
              <div className="absolute inset-[18%] rounded-full border border-line" aria-hidden="true" />
              <HeroMesh className="absolute inset-0 size-full" />
              <div className="absolute bottom-[8%] left-0 hidden rounded-xl border border-line-2 bg-black/70 px-3.5 py-2.5 backdrop-blur sm:block">
                <p className="eyebrow">Canthal tilt</p>
                <p className="mt-1 text-xl font-medium num">+4.2°</p>
              </div>
              <div className="absolute right-0 top-[12%] hidden rounded-xl border border-line-2 bg-black/70 px-3.5 py-2.5 backdrop-blur sm:block">
                <p className="eyebrow">Symmetry index</p>
                <p className="mt-1 text-xl font-medium num">0.972</p>
              </div>
            </div>
          </div>
        </section>

        <section className="shell py-20" aria-labelledby="how">
          <p className="eyebrow">How it works</p>
          <h2 id="how" className="mt-3 max-w-2xl text-3xl font-medium md:text-4xl">
            Machine learning finds the points. Plain maths does the rest.
          </h2>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="card p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-full border border-line-2 text-powder-300">
                    <step.icon size={18} />
                  </span>
                  <span className="text-xs text-fg-3 num">0{index + 1}</span>
                </div>
                <h3 className="mt-6 text-lg font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-2">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="shell grid items-center gap-12 py-20 lg:grid-cols-2" aria-labelledby="cards">
          <div className="space-y-5">
            <p className="eyebrow">The metric card</p>
            <h2 id="cards" className="text-3xl font-medium md:text-4xl">
              One pattern for every number.
            </h2>
            <p className="max-w-lg leading-relaxed text-fg-2">
              What was measured, your value, the typical range for the reference group, what it means in plain
              words, and how confident the system is. If a reading cannot be made honestly, the card stays
              blank and says why.
            </p>
            <ul className="space-y-2.5 text-sm text-fg-2">
              {[
                "Facial thirds and fifths, width to height, face shape",
                "Canthal tilt, eye spacing, eye opening shape",
                "Nose, lip, jaw and chin proportions",
                "A symmetry map by region, and a skin snapshot",
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <IconCheck size={16} className="mt-0.5 shrink-0 text-powder-300" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div
              className="pointer-events-none absolute -inset-10 opacity-70 blur-3xl"
              style={{ background: "radial-gradient(closest-side, rgb(100 164 214 / 0.18), transparent)" }}
              aria-hidden="true"
            />
            <div className="relative mx-auto max-w-md">
              <MetricCard card={EXAMPLE} expanded />
              <p className="mt-3 text-center text-xs text-fg-3">An example card with illustrative values.</p>
            </div>
          </div>
        </section>

        <section className="shell py-20" aria-labelledby="principles">
          <p className="eyebrow">Principles</p>
          <h2 id="principles" className="mt-3 max-w-2xl text-3xl font-medium md:text-4xl">
            Harm reduction is a product requirement, not a disclaimer.
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((item) => (
              <div key={item.title} className="card flex gap-5 p-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-powder-300/10 text-powder-200">
                  <item.icon size={18} />
                </span>
                <div>
                  <h3 className="text-lg font-medium">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-2">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="shell py-20" aria-labelledby="pricing">
          <p className="eyebrow">Pricing</p>
          <h2 id="pricing" className="mt-3 text-3xl font-medium md:text-4xl">
            Start free. Pay once if it is useful.
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-fg-3">
            Prices are starting hypotheses. Checkout in this build is in test mode and takes no payment.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`card flex flex-col p-6 ${tier.featured ? "card-raised" : ""} ${tier.available ? "" : "opacity-60"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-medium">{tier.name}</h3>
                  {!tier.available && <span className="pill">Later</span>}
                </div>
                <p className="mt-5 flex items-baseline gap-2">
                  <span className="text-4xl font-medium tracking-tight">{tier.price}</span>
                  <span className="text-sm text-fg-3">{tier.note}</span>
                </p>
                <ul className="mt-6 space-y-2.5 text-sm text-fg-2">
                  {tier.items.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <IconCheck size={15} className="mt-0.5 shrink-0 text-powder-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-2xl text-sm text-fg-3">
            No affiliate links and no paid placement in recommendations. Skincare suggestions are
            ingredient-level only.
          </p>
        </section>

        <section className="shell py-20" aria-labelledby="faq">
          <p className="eyebrow">Questions</p>
          <h2 id="faq" className="mt-3 text-3xl font-medium md:text-4xl">
            Before you scan
          </h2>
          <div className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="border-t border-line pt-6">
                <h3 className="text-lg font-medium">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-2">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="shell pb-8">
          <div className="card card-raised relative overflow-hidden px-6 py-14 text-center md:py-20">
            <h2 className="mx-auto max-w-2xl text-3xl font-medium md:text-5xl">
              See what the numbers say, and what they cannot.
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/signin?next=/scan" className="btn btn-primary">
                Start a scan <IconArrow size={16} />
              </Link>
              <Link href="/sample" className="btn btn-secondary">
                See a sample report
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

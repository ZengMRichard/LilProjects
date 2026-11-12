"""Templated narrative: the report opener, per-metric meaning and the harmony summary.

This is the fallback text for every report and the only text when no LLM is configured. It is
deterministic: the same findings always produce the same words.
"""

from __future__ import annotations

from dataclasses import dataclass

from facet_templates.metric_copy import COPY, format_bound, format_value

DISCLAIMER = "General information, not a diagnosis or medical advice."

OPENER = {
    "title": "What these numbers can and cannot tell you",
    "can": [
        "How specific distances and angles on your face compare with each other, measured the same way every time.",
        "Where each measurement sits against a reference range, and how sure the system is.",
        "Whether a measurement has changed between two scans by more than measurement noise.",
    ],
    "cannot": [
        "How you look to other people. No measurement here has been shown to predict that, and "
        "this report gives no overall score.",
        "Whether anything needs to change. A value outside a range is less common, not worse.",
        "Anything about your health. This is not a medical assessment.",
    ],
    "asymmetry": "Every face is asymmetric. Most measured asymmetry is normal and is not noticeable to other people.",
    "ranges": "Reference ranges describe how a group of people measured. They are population averages, not targets.",
}

SHAPE_TEXT = {
    "oval": "Your face is somewhat longer than it is wide, with a jaw a little narrower than your cheekbones.",
    "round": "Your face is close to as wide as it is long, with a softly curved jaw line.",
    "square": "Your forehead, cheekbones and jaw are close in width, with a broad jaw line.",
    "oblong": "Your face is noticeably longer than it is wide, with fairly even width from forehead to jaw.",
    "heart": "Your forehead and cheekbones are the widest part of your face, which narrows toward the chin.",
    "diamond": "Your cheekbones are the widest part of your face, with a narrower forehead and jaw.",
}
SHAPE_NOTE = "Face shape is a styling convention, not a measurement standard, and many faces sit between two shapes."


@dataclass(frozen=True)
class Finding:
    """One measured metric, as handed to the narrative layer."""

    key: str
    unit: str
    value: float
    band: str | None  # below | typical | above | None when not compared
    low: float | None = None
    high: float | None = None


def shape_text(label: str, runner_up: str | None) -> str:
    text = SHAPE_TEXT[label]
    if runner_up:
        text += f" It sits between {label} and {runner_up}."
    return f"{text} {SHAPE_NOTE}"


def meaning(finding: Finding) -> str:
    copy = COPY[finding.key]
    if finding.band is None:
        return copy.unranged
    text = {"below": copy.below, "typical": copy.typical, "above": copy.above}[finding.band]
    return text


def range_label(finding: Finding) -> str | None:
    if finding.low is None or finding.high is None:
        return None
    return f"{format_bound(finding.low, finding.unit)} to {format_bound(finding.high, finding.unit)}"


def _join(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def summary(findings: list[Finding], symmetry_index: float | None, provisional: bool) -> str:
    """The harmony summary: which proportions are typical and which are distinctive."""
    compared = [f for f in findings if f.band is not None]
    typical = [f for f in compared if f.band == "typical"]
    distinctive = [f for f in compared if f.band != "typical"]
    parts: list[str] = []
    if compared:
        parts.append(
            f"Of the {len(compared)} proportions compared with a reference range, {len(typical)} sit "
            f"within the typical range."
        )
    if distinctive:
        names = [
            f"{COPY[f.key].title.lower()} ({format_value(f.value, f.unit, COPY[f.key].signed)}, "
            f"{'below' if f.band == 'below' else 'above'} the range)"
            for f in distinctive
        ]
        verb = "is" if len(distinctive) == 1 else "are"
        parts.append(
            f"More distinctive for you {verb} {_join(names)}. Distinctive means less common in the "
            f"reference group; it does not mean better or worse."
        )
    elif compared:
        parts.append("None sits outside its range.")
    if symmetry_index is not None:
        parts.append(
            f"Your overall symmetry index is {format_value(symmetry_index, 'index')}. Every face "
            f"has some left-right difference, and most measured asymmetry is normal."
        )
    if provisional and compared:
        parts.append(
            "The reference ranges in this build are provisional placeholders, so treat each band as a rough guide."
        )
    return " ".join(parts)


def findings_brief(findings: list[Finding], symmetry_index: float | None) -> str:
    """Structured findings as plain lines, for the optional LLM rewrite. Numbers only from here."""
    lines = []
    for f in findings:
        copy = COPY[f.key]
        line = f"- {copy.title}: {format_value(f.value, f.unit, copy.signed)}"
        if f.band is not None:
            line += f"; typical range {range_label(f)}; position: {f.band}"
        else:
            line += "; not compared with a range"
        lines.append(line)
    if symmetry_index is not None:
        lines.append(f"- Overall symmetry index: {format_value(symmetry_index, 'index')}")
    return "\n".join(lines)

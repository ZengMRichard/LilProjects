"""Banned-phrase list and the checks every piece of narrative text must pass.

Spec section 9: no grading words, no forum slang, no unproven self-treatments, no recommending
a specific procedure, and no numbers the engine did not produce. Template text is checked in
tests; LLM output is checked at run time and falls back to the template on any failure.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Whole words or phrases, matched case-insensitively on word boundaries.
BANNED_TERMS: tuple[str, ...] = (
    # grading language
    "flaw", "flaws", "flawed", "flawless", "defect", "defects", "defective", "ugly", "uglier",
    "fix", "fixes", "fixed", "fixing", "attractive", "unattractive", "attractiveness",
    "beautiful", "beauty", "handsome", "pretty", "ideal", "ideally", "perfect", "perfectly",
    "imperfect", "imperfection", "imperfections", "abnormal", "abnormality", "deformity",
    "deformed", "weak chin", "weak jaw", "strong jaw", "problem area", "problem areas",
    "too wide", "too narrow", "too long", "too short", "too big", "too small", "out of 10",
    # forum slang
    "failo", "halo", "mog", "mogs", "mogging", "mogged", "looksmax", "looksmaxx",
    "looksmaxxing", "looksmaxing", "psl", "hunter eyes", "prey eyes", "chad", "normie",
    "subhuman", "truecel", "incel", "blackpill", "ascend", "ascension", "maxilla recessed",
    # unproven or harmful self-treatments
    "mewing", "mew", "bone smashing", "bonesmashing", "jaw trainer", "face pulling",
    "thumb pulling", "chin tucks will change",
    # specific procedures, injectables and devices: allowed only as consult questions,
    # which are written by hand in plan.py and never pass through this check
    "rhinoplasty", "genioplasty", "blepharoplasty", "canthoplasty", "facelift", "implant",
    "implants", "filler", "fillers", "botox", "injectable", "injectables", "surgery",
    "surgical", "surgeon", "liposuction", "buccal fat",
)  # fmt: skip

_PATTERN = re.compile(
    r"(?<![A-Za-z])("
    + "|".join(re.escape(term) for term in sorted(BANNED_TERMS, key=len, reverse=True))
    + r")(?![A-Za-z])",
    re.IGNORECASE,
)
_NUMBER = re.compile(r"(?<![A-Za-z])[+-]?\d+(?:\.\d+)?")


@dataclass(frozen=True)
class TextCheck:
    ok: bool
    banned: tuple[str, ...]
    unknown_numbers: tuple[str, ...]


def find_banned(text: str) -> tuple[str, ...]:
    return tuple(sorted({match.group(1).lower() for match in _PATTERN.finditer(text)}))


def _numbers(text: str) -> set[str]:
    return {match.group(0).lstrip("+") for match in _NUMBER.finditer(text.replace("−", "-"))}


def check_text(text: str, allowed_numbers_from: str | None = None) -> TextCheck:
    """Check narrative text.

    ``allowed_numbers_from`` is the structured-findings text an LLM was given. When set, every
    number in ``text`` must also appear there, so a rewrite cannot introduce a metric.
    """
    banned = find_banned(text)
    unknown: tuple[str, ...] = ()
    if allowed_numbers_from is not None:
        unknown = tuple(sorted(_numbers(text) - _numbers(allowed_numbers_from)))
    return TextCheck(not banned and not unknown, banned, unknown)

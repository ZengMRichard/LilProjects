"""Wellbeing screening (spec section 9).

If a user's goals or messages mention distress, self-harm or disordered eating, the app shows
support resources and pauses upsells. This is keyword screening, deliberately broad: a false
positive costs one supportive card and a paused upgrade prompt.

The resource list needs review by the clinical advisors before launch (docs/DECISIONS.md).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_PATTERNS: dict[str, tuple[str, ...]] = {
    "self_harm": (
        r"kill(ing)? my ?self", r"suicid", r"end (it all|my life)", r"self[- ]?harm",
        r"hurt(ing)? my ?self", r"cut(ting)? my ?self", r"(don'?t|do not) want to (live|be alive|be here)",
        r"better off dead", r"want to die", r"no reason to live",
    ),
    "disordered_eating": (
        r"starv(e|ing)", r"purg(e|ing)", r"anorexi", r"bulimi", r"stop(ped)? eating",
        r"make my ?self (sick|throw up|vomit)", r"binge", r"laxative",
    ),
    "distress": (
        r"hate (my ?self|my face|how i look|the way i look|looking at)", r"disgust(ed|ing)",
        r"can'?t (stand|bear) (my|looking|seeing)", r"worthless", r"hopeless", r"ugly",
        r"(can'?t|cannot) (leave|go out of) the house", r"obsess", r"depress", r"ashamed of my",
        r"nobody (will|would) (ever )?(love|want)", r"ruin(ed|ing)? my life", r"desperate",
        r"hideous", r"repulsive", r"deformed",
    ),
}  # fmt: skip
_COMPILED = {
    category: re.compile("|".join(f"(?:{p})" for p in patterns), re.IGNORECASE)
    for category, patterns in _PATTERNS.items()
}

SUPPORT = {
    "title": "You matter more than any measurement",
    "body": "Some of what you wrote sounds heavy. A face report cannot weigh in on your worth, and "
    "it is not the right tool when things feel this hard. Talking to someone can help.",
    "resources": [
        {
            "name": "988 Suicide & Crisis Lifeline (US)",
            "detail": "Call or text 988, any time.",
            "url": "https://988lifeline.org",
        },
        {
            "name": "Crisis Text Line (US)",
            "detail": "Text HOME to 741741, any time.",
            "url": "https://www.crisistextline.org",
        },
        {
            "name": "Find a helpline in your country",
            "detail": "A directory of free, confidential support lines worldwide.",
            "url": "https://findahelpline.com",
        },
        {
            "name": "Body Dysmorphic Disorder Foundation",
            "detail": "Information and support if worries about your appearance take up a lot of your day.",
            "url": "https://bddfoundation.org",
        },
    ],
    "note": "If you are in immediate danger, call your local emergency number. We have paused "
    "upgrade prompts on your account.",
}


@dataclass(frozen=True)
class Screening:
    flagged: bool
    categories: tuple[str, ...]


def screen_text(text: str | None) -> Screening:
    if not text:
        return Screening(False, ())
    hits = tuple(category for category, pattern in _COMPILED.items() if pattern.search(text))
    return Screening(bool(hits), hits)

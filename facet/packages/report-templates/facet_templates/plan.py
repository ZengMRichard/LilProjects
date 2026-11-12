"""Routine-plan catalogue and ranking.

Recommendation rules (spec section 9): lifestyle and skincare first, then grooming and style,
then topics to discuss with a professional. No specific procedure, injectable, dose or provider
is ever recommended; procedures appear only as questions to ask. Every item carries an evidence
level. Skincare is ingredient-level only, with no brands and no affiliate links.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

EVIDENCE_LEVELS = ("strong", "moderate", "limited", "anecdotal")
CATEGORY_ORDER = ("lifestyle", "skincare", "grooming", "style", "professional")
CATEGORY_LABELS = {
    "lifestyle": "Lifestyle",
    "skincare": "Skincare",
    "grooming": "Grooming",
    "style": "Style",
    "professional": "Topics to discuss with a professional",
}
GOALS = ("skin", "jaw", "style", "general")

PLAN_PREFACE = (
    "Proportions such as facial thirds or jaw width come from bone structure. No routine changes "
    "them, and this plan does not try to. It covers skin, grooming and habits, in order of how "
    "good the evidence is for each."
)


@dataclass(frozen=True)
class CatalogItem:
    key: str
    category: str
    action: str
    detail: str
    evidence_level: str
    evidence_note: str
    weight: float  # base relevance; higher sorts first within a category
    goals: tuple[str, ...] = ()  # goals that raise relevance
    skin: tuple[tuple[str, str], ...] = ()  # (attribute, minimum band) pairs that raise relevance
    requires: tuple[str, ...] = ()  # include only when one of these goals or skin triggers applies


CATALOG: tuple[CatalogItem, ...] = (
    CatalogItem(
        "sunscreen", "skincare", "Wear broad-spectrum sunscreen, SPF 30 or higher, every day",
        "Apply to face and neck each morning and reapply when outdoors. This is the single habit "
        "with the best evidence for slowing visible skin ageing and uneven pigmentation.",
        "strong", "Randomised trials show daily use slows photoageing.", 10,
        goals=("skin",), skin=(("spots", "medium"), ("redness", "medium")),
    ),
    CatalogItem(
        "sleep", "lifestyle", "Keep a regular sleep schedule of 7 to 9 hours",
        "Short sleep makes the under-eye area look darker and puffier the next day. Regular sleep "
        "is the first thing to try for under-eye darkness.",
        "moderate", "Controlled studies link sleep loss to darker under-eye appearance.", 8,
        skin=(("under_eye", "medium"),),
    ),
    CatalogItem(
        "no_smoking", "lifestyle", "If you smoke, stopping is the largest change you can make for your skin",
        "Smoking speeds up wrinkling and dulls skin tone. Your doctor or pharmacist can help with "
        "quitting.",
        "strong", "Large observational and twin studies link smoking to faster skin ageing.", 5,
        goals=("skin",),
    ),
    CatalogItem(
        "cleanse_moisturise", "skincare", "Cleanse gently and moisturise once or twice a day",
        "A mild, fragrance-free cleanser and a plain moisturiser support the skin barrier, which "
        "evens out the look of texture and dryness. Harsh scrubs tend to make texture and redness "
        "more visible.",
        "moderate", "Trials show moisturisers improve barrier function and roughness.", 7,
        goals=("skin",), skin=(("texture", "medium"), ("redness", "medium")),
    ),
    CatalogItem(
        "retinoid", "skincare", "Consider a retinoid at night",
        "Retinoids are the best-studied ingredient class for skin texture and fine lines. Start "
        "two or three nights a week, use sunscreen in the morning, and expect dryness at first. "
        "Do not use them if you are pregnant or trying to conceive; ask a pharmacist if unsure.",
        "moderate", "Strong trial evidence for prescription strengths; moderate for retinol.", 6,
        goals=("skin",), skin=(("texture", "medium"), ("spots", "medium")),
        requires=("goal:skin", "skin:texture", "skin:spots"),
    ),
    CatalogItem(
        "azelaic_acid", "skincare", "Consider azelaic acid for redness or uneven tone",
        "Azelaic acid is an ingredient with trial evidence for facial redness and dark marks, and "
        "it is usually well tolerated.",
        "moderate", "Randomised trials in rosacea and post-inflammatory pigmentation.", 5,
        skin=(("redness", "medium"), ("spots", "medium")), requires=("skin:redness", "skin:spots"),
    ),
    CatalogItem(
        "niacinamide", "skincare", "Consider niacinamide for uneven tone",
        "Niacinamide is a gentle ingredient with some trial evidence for reducing blotchiness and "
        "dark marks.",
        "limited", "A small number of trials, mostly short and industry-funded.", 4,
        skin=(("spots", "medium"), ("redness", "high")), requires=("skin:spots", "skin:redness"),
    ),
    CatalogItem(
        "under_eye_care", "skincare", "For under-eye darkness, try a cold compress in the morning",
        "Cold reduces puffiness for a short time. Under-eye darkness is often inherited or comes "
        "from the shape of the eye socket, so creams and compresses have limited effect.",
        "limited", "Short-term effect only; little trial evidence.", 3,
        skin=(("under_eye", "medium"),), requires=("skin:under_eye",),
    ),
    CatalogItem(
        "posture", "lifestyle", "Carry your head level over your shoulders",
        "A forward head position changes how the jaw and neck line look in photos and in person. "
        "This is about posture, not bone structure.",
        "anecdotal", "No trials; based on how head position changes the visible neck line.", 4,
        goals=("jaw",), requires=("goal:jaw",),
    ),
    CatalogItem(
        "brows", "grooming", "Keep your brows tidy",
        "Removing stray hairs between and below the brows keeps their natural shape clear. Avoid "
        "reshaping heavily, since over-plucked brows can be slow to grow back.",
        "anecdotal", "Style preference; no outcome studies.", 4, goals=("style", "general"),
    ),
    CatalogItem(
        "facial_hair", "grooming", "If you grow facial hair, shape it to follow your jaw line",
        "A clean neckline and cheek line frame the lower face. A barber can set the lines for you "
        "to maintain.",
        "anecdotal", "Style preference; no outcome studies.", 5,
        goals=("jaw", "style"), requires=("goal:jaw", "goal:style"),
    ),
    CatalogItem(
        "haircut", "style", "Ask a barber or stylist for a cut that suits your face shape",
        "Take your face-shape result with you. Volume and length can change how wide or long a "
        "face reads. The full style guide arrives in a later release.",
        "anecdotal", "Style preference; no outcome studies.", 5,
        goals=("style",), requires=("goal:style", "goal:general"),
    ),
    CatalogItem(
        "skin_check", "professional", "Have any new or changing spot checked by a doctor",
        "This app looks at overall tone only. It cannot assess moles or skin lesions. See a doctor "
        "about any spot that is new, changing, itchy or bleeding.",
        "strong", "Standard medical guidance.", 9, goals=("skin",),
    ),
    CatalogItem(
        "redness_consult", "professional", "Raise persistent facial redness with a dermatologist",
        "Redness that lasts for weeks, flushes easily or comes with bumps has several possible "
        "causes that a dermatologist can tell apart. Questions to ask: what is causing it, what "
        "the treatment options are, and what could be triggering it.",
        "strong", "Standard medical guidance.", 7,
        skin=(("redness", "high"),), requires=("skin:redness:high",),
    ),
    CatalogItem(
        "bite_consult", "professional", "Questions for a dentist or orthodontist about your jaw",
        "If your goal involves your jaw or bite, a dental professional is the right person to "
        "assess it. Questions to ask: how do my teeth and jaws fit together, does that affect how "
        "my jaw sits, what are all the options including doing nothing, and what result is "
        "realistic for each?",
        "strong", "Standard referral guidance.", 6, goals=("jaw",), requires=("goal:jaw",),
    ),
    CatalogItem(
        "procedure_questions", "professional", "If you are considering any procedure, take these questions",
        "Questions to ask: is the provider board-certified in the relevant specialty, how often do "
        "they perform this, what is the realistic range of outcomes including poor ones, what are "
        "the risks, the recovery and the cost of revision, and what happens if I do nothing? This "
        "report cannot tell you whether a procedure is right for you.",
        "strong", "Standard patient-safety guidance.", 3,
    ),
)  # fmt: skip

_BAND_RANK = {"low": 0, "medium": 1, "high": 2}
SKIN_WORDS = {"under_eye": "under-eye darkness", "spots": "spot coverage"}


@dataclass(frozen=True)
class PlannedItem:
    key: str
    category: str
    category_label: str
    action: str
    detail: str
    evidence_level: str
    evidence_note: str
    reason: str


def _triggers(goals: tuple[str, ...], skin_bands: Mapping[str, str]) -> set[str]:
    out = {f"goal:{g}" for g in goals}
    for attribute, band in skin_bands.items():
        if _BAND_RANK.get(band, 0) >= 1:
            out.add(f"skin:{attribute}")
        if band == "high":
            out.add(f"skin:{attribute}:high")
    return out


def build_plan(goals: tuple[str, ...], skin_bands: Mapping[str, str]) -> list[PlannedItem]:
    """Rank the catalogue for one report. Deterministic; categories stay in the required order."""
    active = _triggers(goals, skin_bands)
    scored: list[tuple[int, float, CatalogItem, str]] = []
    for item in CATALOG:
        if item.requires and not active.intersection(item.requires):
            continue
        score = item.weight
        reasons: list[str] = []
        matched_goals = [g for g in item.goals if g in goals]
        if matched_goals:
            score += 3
            reasons.append(f"it matches your {matched_goals[0]} goal")
        for attribute, minimum in item.skin:
            band = skin_bands.get(attribute)
            if band and _BAND_RANK[band] >= _BAND_RANK[minimum]:
                score += 2 + _BAND_RANK[band]
                reasons.append(f"your skin snapshot shows {band} {SKIN_WORDS.get(attribute, attribute)}")
        reason = "Suggested because " + " and ".join(reasons) + "." if reasons else "A general habit."
        scored.append((CATEGORY_ORDER.index(item.category), -score, item, reason))
    scored.sort(key=lambda entry: (entry[0], entry[1], entry[2].key))
    return [
        PlannedItem(
            key=item.key,
            category=item.category,
            category_label=CATEGORY_LABELS[item.category],
            action=item.action,
            detail=item.detail,
            evidence_level=item.evidence_level,
            evidence_note=item.evidence_note,
            reason=reason,
        )
        for _, _, item, reason in scored
    ]

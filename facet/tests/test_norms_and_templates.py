"""Reference ranges, report copy, the banned-phrase list, the plan and wellbeing screening."""

from __future__ import annotations

import pytest

from facet_metrics.registry import BY_KEY, METRICS, UNAVAILABLE
from facet_norms import NormEntry, band_side, load_norms, parse_norms, place
from facet_templates.banned import check_text, find_banned
from facet_templates.metric_copy import COPY, UNAVAILABLE_TITLES, format_value
from facet_templates.narrative import OPENER, SHAPE_NOTE, SHAPE_TEXT, Finding, findings_brief, meaning, summary
from facet_templates.plan import CATALOG, CATEGORY_ORDER, EVIDENCE_LEVELS, PLAN_PREFACE, build_plan
from facet_templates.wellbeing import SUPPORT, screen_text
from facet_worker.skin import TEXT as SKIN_TEXT


def test_provisional_norms_load_and_only_cover_validated_style_metrics():
    norms = load_norms()
    assert norms.provisional and norms.status == "provisional"
    group = norms.group(None)
    assert group.source is None, "no study may be cited until one is licensed"
    for key, entry in group.metrics.items():
        assert key in BY_KEY, key
        assert not BY_KEY[key].experimental, f"{key} is experimental and must not be compared"
        assert entry.low < entry.high
    assert norms.group("no-such-group").key == "pooled_adult"


def test_range_only_entries_give_three_bands_and_no_percentile():
    entry = NormEntry(1.0, 2.0)
    assert place(0.9, entry).band == "below_typical"
    assert place(1.0, entry).band == "typical"
    assert place(2.0, entry).band == "typical"
    assert place(2.1, entry).band == "above_typical"
    assert place(1.5, entry).percentile is None


def test_cited_entries_give_percentile_bands():
    norms = parse_norms(
        {
            "version": "t",
            "status": "validated",
            "groups": {"pooled_adult": {"label": "Test", "metrics": {"m": {"mean": 10.0, "sd": 2.0}}}},
        }
    )
    entry = norms.group(None).metrics["m"]
    assert place(10.0, entry).band == "p25_75"
    assert place(10.0, entry).percentile == pytest.approx(0.5)
    assert place(6.0, entry).band == "p0_10"
    assert place(8.0, entry).band == "p10_25"
    assert place(12.2, entry).band == "p75_90"
    assert place(14.0, entry).band == "p90_100"
    assert [band_side(b) for b in ("p0_10", "p10_25", "p25_75", "p90_100")] == ["below", "typical", "typical", "above"]
    assert not norms.provisional


def test_invalid_norms_are_rejected():
    with pytest.raises(ValueError):
        parse_norms(
            {
                "version": "t",
                "status": "x",
                "groups": {"pooled_adult": {"label": "T", "metrics": {"m": {"low": 2, "high": 1}}}},
            }
        )
    with pytest.raises(ValueError):
        parse_norms({"version": "t", "status": "x", "groups": {"other": {"label": "T", "metrics": {}}}})


def test_every_metric_has_copy_and_every_ranged_metric_has_three_meanings():
    ranged = set(load_norms().group(None).metrics)
    for spec in METRICS:
        copy = COPY[spec.key]
        assert copy.title and copy.what
        if spec.key in ranged:
            assert copy.below and copy.typical and copy.above, spec.key
        else:
            assert copy.unranged, spec.key
    assert COPY["symmetry.overall"].unranged
    assert set(UNAVAILABLE) == set(UNAVAILABLE_TITLES)


def all_report_text() -> list[str]:
    texts: list[str] = []
    for copy in COPY.values():
        texts += [copy.title, copy.what, copy.below, copy.typical, copy.above, copy.unranged]
    texts += [OPENER["title"], OPENER["asymmetry"], OPENER["ranges"], *OPENER["can"], *OPENER["cannot"]]
    texts += [*SHAPE_TEXT.values(), SHAPE_NOTE, PLAN_PREFACE, *UNAVAILABLE.values()]
    for bands in SKIN_TEXT.values():
        texts += bands.values()
    # Every plan item except the hand-written consult questions.
    for item in CATALOG:
        if item.category != "professional":
            texts += [item.action, item.detail, item.evidence_note]
    findings = [
        Finding("eyes.canthal_tilt", "deg", 4.2, "typical", 1.0, 9.0),
        Finding("jaw.bigonial_bizygomatic", "ratio", 0.9, "above", 0.68, 0.84),
        Finding("lips.philtrum_length", "ipd", 0.1, "below", 0.17, 0.27),
        Finding("nose.nasofrontal_angle", "deg", 141.0, None),
    ]
    texts += [meaning(f) for f in findings]
    texts += [summary(findings, 0.972, True), summary(findings[:1], None, False), summary([], 0.99, False)]
    return [t for t in texts if t]


def test_no_report_text_uses_a_banned_phrase():
    for text in all_report_text():
        assert find_banned(text) == (), text


@pytest.mark.parametrize(
    "text",
    [
        "Positive tilt, attractive.",
        "This is a flaw you can fix.",
        "Your jaw is too narrow.",
        "Try mewing every day.",
        "Hunter eyes are ideal.",
        "Consider a rhinoplasty.",
        "A filler would help.",
        "You are a 6 out of 10.",
        "Major failo.",
    ],
)
def test_banned_list_catches_grading_slang_and_procedures(text):
    assert find_banned(text), text


def test_banned_matching_is_whole_word():
    assert find_banned("The prefix of this fixture is fine: affix, suffix, mewl, chadwick.") == ()


def test_llm_number_guard():
    brief = findings_brief([Finding("eyes.canthal_tilt", "deg", 4.2, "typical", 1.0, 9.0)], 0.972)
    assert "+4.2°" in brief and "0.972" in brief
    assert check_text("Your canthal tilt is +4.2°, within the range of 1° to 9°.", brief).ok
    invented = check_text("Your canthal tilt is +4.2°, better than 87% of people.", brief)
    assert not invented.ok and invented.unknown_numbers == ("87",)


def test_summary_describes_without_grading():
    findings = [
        Finding("eyes.canthal_tilt", "deg", 4.2, "typical", 1.0, 9.0),
        Finding("jaw.bigonial_bizygomatic", "ratio", 0.9, "above", 0.68, 0.84),
    ]
    text = summary(findings, 0.972, True)
    assert "Of the 2 proportions compared with a reference range, 1 sit" in text
    assert "jaw width to cheekbone width (0.90, above the range)" in text
    assert "does not mean better or worse" in text
    assert "most measured asymmetry is normal" in text
    assert "provisional" in text


def test_value_formatting():
    assert format_value(4.2, "deg", signed=True) == "+4.2°"
    assert format_value(-1.25, "deg", signed=True) == "-1.2°" or format_value(-1.25, "deg", signed=True) == "-1.3°"
    assert format_value(0.2345, "share") == "23.4%" or format_value(0.2345, "share") == "23.5%"
    assert format_value(0.2082, "ipd") == "0.21 × IPD"
    assert format_value(0.97213, "index") == "0.972"


def test_plan_order_and_evidence_levels():
    plan = build_plan(
        ("skin", "jaw", "style"), {"redness": "high", "texture": "medium", "under_eye": "medium", "spots": "low"}
    )
    categories = [CATEGORY_ORDER.index(item.category) for item in plan]
    assert categories == sorted(categories), "lifestyle and skincare first, professional topics last"
    assert plan[-1].category == "professional"
    assert all(item.evidence_level in EVIDENCE_LEVELS and item.evidence_note for item in plan)
    keys = [item.key for item in plan]
    assert "sunscreen" in keys and "redness_consult" in keys and "bite_consult" in keys and "facial_hair" in keys
    assert len(keys) == len(set(keys))


def test_plan_only_includes_triggered_items():
    plain = [item.key for item in build_plan((), {})]
    assert "retinoid" not in plain and "redness_consult" not in plain and "posture" not in plain
    assert "sunscreen" in plain and "skin_check" in plain
    medium = [item.key for item in build_plan((), {"redness": "medium"})]
    assert "azelaic_acid" in medium and "redness_consult" not in medium


def test_plan_never_recommends_a_procedure_outside_consult_questions():
    for item in CATALOG:
        if item.category == "professional":
            assert "ask" in item.detail.lower() or "doctor" in item.detail.lower()
        else:
            assert find_banned(item.action + " " + item.detail) == ()


@pytest.mark.parametrize(
    ("text", "category"),
    [
        ("honestly I hate my face and can't stand looking in the mirror", "distress"),
        ("sometimes I want to die", "self_harm"),
        ("I've been starving myself to slim my face", "disordered_eating"),
        ("I feel hopeless about how I look", "distress"),
    ],
)
def test_wellbeing_screening_flags_distress(text, category):
    result = screen_text(text)
    assert result.flagged and category in result.categories


@pytest.mark.parametrize(
    "text", [None, "", "better skincare routine and a haircut that suits me", "curious about my jaw"]
)
def test_wellbeing_screening_leaves_ordinary_goals_alone(text):
    assert not screen_text(text).flagged


def test_support_resources_are_complete():
    assert len(SUPPORT["resources"]) >= 3
    assert all(r["url"].startswith("https://") for r in SUPPORT["resources"])

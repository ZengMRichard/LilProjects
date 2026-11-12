"""Optional LLM pass over the report summary (spec section 4, step 7, and section 9).

The model only rewrites structured findings into prose. It never sees an image and cannot
introduce a metric: its output must pass the banned-phrase list and contain no number that is
not in the findings it was given. Any failure, refusal or error falls back to the template.

Off unless FACET_LLM_NARRATIVE=1 and the "llm" extra is installed.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from facet_templates.banned import check_text

log = logging.getLogger("facet.worker.narrative")

MAX_SUMMARY_CHARS = 1200

SYSTEM_PROMPT = """You write one short summary paragraph for a facial-proportions report that \
a member of the public will read about their own face.

You will receive a list of measured findings. Each has a name, a value, and either a typical \
range with the value's position against it, or a note that it was not compared with a range. \
Rewrite them into three to five plain sentences that tell the reader which proportions sit \
within the typical range and which are more distinctive.

People reading this are often anxious about their appearance, and a careless word can do real \
harm, so the tone matters as much as the facts:
- Describe; do not grade. Say where a value sits against its range. Do not call anything good, \
bad, attractive, a flaw, or something to fix or improve.
- A value outside a range is less common, not worse. Say so once.
- Reference ranges are population averages, not targets. Do not present them as ideals.
- Do not recommend or mention any procedure, product, treatment or exercise.
- Use only the numbers given to you, written exactly as given. Do not add, round or derive \
numbers.
- If asymmetry is mentioned, note that most measured asymmetry is normal.

Write in the second person, in plain prose with no headings, lists or markdown. Return only the \
paragraph."""


def _default_client() -> Any:
    import anthropic  # pyright: ignore[reportMissingImports]

    return anthropic.Anthropic()


def rewrite_summary(
    brief: str,
    template_text: str,
    *,
    enabled: bool,
    model: str,
    client_factory: Callable[[], Any] = _default_client,
) -> tuple[str, str]:
    """Return (summary text, source) where source is "llm" or "template"."""
    if not enabled:
        return template_text, "template"
    try:
        client = client_factory()
        response = client.beta.messages.create(
            model=model,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low"},
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"Findings:\n{brief}"}],
        )
    except ImportError:
        log.warning("LLM narrative is enabled but the 'llm' extra is not installed; using the template")
        return template_text, "template"
    except Exception as error:  # noqa: BLE001 - any API failure falls back to the template
        log.warning("LLM narrative failed (%s); using the template", type(error).__name__)
        return template_text, "template"

    if getattr(response, "stop_reason", None) != "end_turn":
        log.warning("LLM narrative stopped with %r; using the template", getattr(response, "stop_reason", None))
        return template_text, "template"
    text = " ".join(block.text.strip() for block in response.content if getattr(block, "type", None) == "text").strip()
    check = check_text(text, allowed_numbers_from=brief)
    if not text or len(text) > MAX_SUMMARY_CHARS or not check.ok:
        log.warning(
            "LLM narrative rejected by guardrails (banned=%s, unknown_numbers=%s); using the template",
            check.banned,
            check.unknown_numbers,
        )
        return template_text, "template"
    return text, "llm"

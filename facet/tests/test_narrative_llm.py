"""LLM guardrails (spec section 9): any failure falls back to the template text."""

from __future__ import annotations

from types import SimpleNamespace

from facet_templates.narrative import Finding, findings_brief
from facet_worker.narrative_llm import rewrite_summary

BRIEF = findings_brief([Finding("eyes.canthal_tilt", "deg", 4.2, "typical", 1.0, 9.0)], 0.972)
TEMPLATE = "template text"


class FakeClient:
    def __init__(self, text: str = "", stop_reason: str = "end_turn", error: Exception | None = None) -> None:
        self.calls: list[dict] = []
        self._text, self._stop, self._error = text, stop_reason, error
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        if self._error:
            raise self._error
        blocks = [SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=self._text)]
        return SimpleNamespace(stop_reason=self._stop, content=blocks)


def run(client: FakeClient, enabled: bool = True):
    return rewrite_summary(BRIEF, TEMPLATE, enabled=enabled, model="claude-opus-5-5", client_factory=lambda: client)


def test_disabled_never_calls_the_model():
    client = FakeClient("anything")
    assert run(client, enabled=False) == (TEMPLATE, "template")
    assert client.calls == []


def test_clean_rewrite_is_accepted():
    client = FakeClient("Your canthal tilt is +4.2°, which sits within the typical range of 1° to 9°.")
    text, source = run(client)
    assert source == "llm" and "+4.2°" in text
    call = client.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert "temperature" not in call, "current models reject sampling parameters"
    assert call["messages"][0]["content"].endswith(BRIEF)
    assert "image" not in str(call["messages"]).lower()


def test_banned_phrase_falls_back():
    assert run(FakeClient("Your canthal tilt is +4.2°, which is attractive.")) == (TEMPLATE, "template")


def test_invented_number_falls_back():
    assert run(FakeClient("Your canthal tilt is +4.2°, in the top 15 percent.")) == (TEMPLATE, "template")


def test_refusal_or_truncation_falls_back():
    assert run(FakeClient("fine text +4.2°", stop_reason="refusal")) == (TEMPLATE, "template")
    assert run(FakeClient("fine text +4.2°", stop_reason="max_tokens")) == (TEMPLATE, "template")


def test_api_error_and_empty_output_fall_back():
    assert run(FakeClient(error=RuntimeError("boom"))) == (TEMPLATE, "template")
    assert run(FakeClient("")) == (TEMPLATE, "template")
    assert run(FakeClient("x" * 5000)) == (TEMPLATE, "template")

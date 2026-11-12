"""PDF rendering falls back cleanly when no browser is available."""

from __future__ import annotations

import stat

import pytest

from facet_worker.pdf import PdfUnavailable, find_chrome, render_pdf
from tests.conftest import onboard, synthetic_scan


def fake_chrome(tmp_path, body: str):
    script = tmp_path / "chrome"
    script.write_text(f"#!/bin/sh\n{body}\n")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return str(script)


WRITE_PDF = """for a in "$@"; do case "$a" in --print-to-pdf=*) out="${a#--print-to-pdf=}";; esac; done
printf '%%PDF-1.7\\n' > "$out"; head -c 4000 /dev/zero >> "$out"; """


def test_missing_browser_is_reported():
    assert find_chrome("/no/such/chrome") is None
    with pytest.raises(PdfUnavailable, match="No Chrome"):
        render_pdf("http://localhost/x", "/no/such/chrome")


def test_pdf_is_read_when_the_browser_exits(tmp_path):
    data = render_pdf("http://localhost/x", fake_chrome(tmp_path, WRITE_PDF), timeout_seconds=10)
    assert data.startswith(b"%PDF") and len(data) > 4000


def test_pdf_is_read_even_if_the_browser_lingers(tmp_path):
    data = render_pdf("http://localhost/x", fake_chrome(tmp_path, WRITE_PDF + "sleep 60"), timeout_seconds=10)
    assert data.startswith(b"%PDF")


def test_browser_that_writes_nothing_times_out(tmp_path):
    with pytest.raises(PdfUnavailable, match="did not produce"):
        render_pdf("http://localhost/x", fake_chrome(tmp_path, "sleep 60"), timeout_seconds=1.5)


def test_pdf_endpoint_reports_unavailable_and_then_caches(client, app, settings, tmp_path, monkeypatch):
    onboard(client)
    scan = synthetic_scan(client)
    client.post("/v1/billing/checkout", json={"report_id": scan["report_id"]})
    url = f"/v1/reports/{scan['report_id']}/pdf"

    monkeypatch.setattr(
        "facet_api.routes.reports.render_pdf", lambda *_: (_ for _ in ()).throw(PdfUnavailable("No Chrome."))
    )
    unavailable = client.get(url)
    assert unavailable.status_code == 503 and "Print" in unavailable.json()["detail"]

    calls = []

    def render(target, _chrome):
        calls.append(target)
        return b"%PDF-1.7 fake"

    monkeypatch.setattr("facet_api.routes.reports.render_pdf", render)
    signed = client.get(url).json()
    assert f"/report/{scan['report_id']}/print?render_token=" in calls[0]
    pdf = client.get(signed["url"])
    assert pdf.content == b"%PDF-1.7 fake" and pdf.headers["content-type"] == "application/pdf"
    client.get(url)
    assert len(calls) == 1, "the rendered PDF is cached"

    # The render token in that URL opens exactly one report, without a session.
    token = calls[0].split("render_token=")[1]
    from fastapi.testclient import TestClient

    anonymous = TestClient(app)
    assert anonymous.get(f"/v1/reports/{scan['report_id']}?render_token={token}").status_code == 200
    other = synthetic_scan(client)
    assert anonymous.get(f"/v1/reports/{other['report_id']}?render_token={token}").status_code == 404

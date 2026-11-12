"""Step 5: PDF render. Headless Chromium prints the same React report the user sees
("one design, two outputs", spec section 5). Needs a Chrome or Chromium binary."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import time
from pathlib import Path

CANDIDATES = (
    "chrome-headless-shell",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
)
MIN_PDF_BYTES = 1000


class PdfUnavailable(RuntimeError):
    pass


def find_chrome(configured: str | None) -> str | None:
    if configured:
        return shutil.which(configured) or (configured if Path(configured).exists() else None)
    for candidate in CANDIDATES:
        found = shutil.which(candidate) or (candidate if Path(candidate).exists() else None)
        if found:
            return found
    return None


def render_pdf(url: str, chrome_path: str | None, timeout_seconds: float = 45.0) -> bytes:
    chrome = find_chrome(chrome_path)
    if not chrome:
        raise PdfUnavailable("No Chrome or Chromium binary was found. Set FACET_CHROME_PATH.")
    with tempfile.TemporaryDirectory(prefix="facet-pdf-") as tmp:
        out = Path(tmp) / "report.pdf"
        command = [
            chrome,
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-pdf-header-footer",
            "--virtual-time-budget=8000",
            f"--user-data-dir={Path(tmp) / 'profile'}",
            f"--print-to-pdf={out}",
            url,
        ]
        try:
            process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError as error:
            raise PdfUnavailable(f"Chrome could not be started ({type(error).__name__}).") from error
        # Some Chrome builds write the PDF and then linger, so wait for the file rather than the
        # process: done when Chrome exits, or when the file has stopped growing.
        deadline = time.monotonic() + timeout_seconds
        last_size, stable_since = -1, 0.0
        try:
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    break
                size = out.stat().st_size if out.exists() else -1
                if size >= MIN_PDF_BYTES and size == last_size:
                    if time.monotonic() - stable_since >= 1.0:
                        break
                else:
                    last_size, stable_since = size, time.monotonic()
                time.sleep(0.1)
        finally:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)
        if not out.exists() or out.stat().st_size < MIN_PDF_BYTES:
            raise PdfUnavailable("Chrome did not produce a PDF in time.")
        data = out.read_bytes()
        if not data.startswith(b"%PDF"):
            raise PdfUnavailable("Chrome produced an unreadable PDF.")
        return data

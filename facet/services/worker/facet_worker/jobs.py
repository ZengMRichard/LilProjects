"""Local stand-in for the SQS job queue: one job per submitted scan, retries, then a
dead-letter state (scan.status = "failed" with the error recorded)."""

from __future__ import annotations

import logging
import queue
import threading
import time
from collections.abc import Callable

from sqlalchemy.orm import Session, sessionmaker

from facet_api.config import Settings
from facet_api.storage import Storage
from facet_worker.pipeline import MAX_ATTEMPTS, process_scan

log = logging.getLogger("facet.worker.jobs")


class LocalQueue:
    def __init__(self, sessions: sessionmaker[Session], storage: Storage, settings: Settings) -> None:
        self._sessions = sessions
        self._storage = storage
        self._settings = settings
        self._jobs: queue.Queue[str | None] = queue.Queue()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._settings.worker_inline or self._thread is not None:
            return
        self._thread = threading.Thread(target=self._loop, name="facet-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._thread is not None:
            self._jobs.put(None)
            self._thread.join(timeout=5)
            self._thread = None

    def enqueue(self, scan_id: str) -> None:
        if self._settings.worker_inline:
            self._run(scan_id)
        else:
            self._jobs.put(scan_id)

    def _run(self, scan_id: str, sleep: Callable[[float], None] = time.sleep) -> None:
        for attempt in range(1, MAX_ATTEMPTS + 1):
            with self._sessions() as db:
                try:
                    process_scan(db, scan_id, self._storage, self._settings)
                    return
                except Exception:  # noqa: BLE001 - recorded on the scan by process_scan
                    if attempt == MAX_ATTEMPTS:
                        log.error("scan %s moved to the dead-letter state after %s attempts", scan_id, attempt)
                        return
            if not self._settings.worker_inline:
                sleep(0.5 * attempt)

    def _loop(self) -> None:
        while True:
            scan_id = self._jobs.get()
            if scan_id is None:
                return
            self._run(scan_id)

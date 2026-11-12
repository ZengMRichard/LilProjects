"""Facet worker: turns a submitted scan into a report.

Pipeline (spec section 5): 1. quality and tamper check, 2. landmarks, 3. metrics library,
4. narrative with guardrails, 5. PDF render. In this build step 2 arrives with the scan (the
browser runs the landmark model) and step 5 runs on demand.
"""

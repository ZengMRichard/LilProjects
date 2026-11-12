"""Facet metrics library: deterministic geometry on top of learned landmarks.

Every function here is pure: the same landmarks and the same library version always give the
same number. Nothing in this package reads an image or calls a model.
"""

from facet_metrics.engine import (
    MetricValue,
    Unavailable,
    ViewLandmarks,
    compute_report_metrics,
)
from facet_metrics.geometry import Pose, estimate_pose
from facet_metrics.registry import METRICS, UNAVAILABLE, MetricSpec

METRICS_LIB_VERSION = "0.1.0"

__all__ = [
    "METRICS",
    "METRICS_LIB_VERSION",
    "UNAVAILABLE",
    "MetricSpec",
    "MetricValue",
    "Pose",
    "Unavailable",
    "ViewLandmarks",
    "compute_report_metrics",
    "estimate_pose",
]

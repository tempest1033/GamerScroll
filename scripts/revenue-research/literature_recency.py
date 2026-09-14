"""Explicit research activation of the shared recency-stability rule.

The service default enables it only for downloads. Explicit activation keeps
the frozen revenue experiment reproducible without duplicating the rule.
"""
from __future__ import annotations

import service_readiness as replay
from service_model import paired_cluster_scale as cluster_scale

SHARED_SELECT = replay.select_candidate


def select(options: list[dict], predictions: dict, labels: list[dict],
           metric: str, before: str, current_coverage: dict | None = None):
    return SHARED_SELECT(options, predictions, labels, metric, before, current_coverage,
                         recency_stability=True)

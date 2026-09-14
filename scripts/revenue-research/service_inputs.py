"""Read preserved source evidence without modifying the working history tree."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import history_fit as fit
from coverage_share import ROOT

CONFIG = 'data/rank-models/service-observation-sources.json'


def source_config() -> dict:
    config = json.loads((ROOT / CONFIG).read_text(encoding='utf-8'))
    if config.get('schema_version') != 1:
        raise ValueError('Unsupported service observation manifest')
    return config


def verify_preserved(config: dict, relative: str) -> Path:
    path = (ROOT / relative).resolve()
    path.relative_to(ROOT.resolve())
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != config['sha256'].get(relative):
        raise ValueError(f'Preserved observation hash mismatch: {relative}')
    return path


def load_service_payloads(as_of: str) -> tuple[dict, dict]:
    payloads = fit.load_payloads(fit.FIRST_IDENTIFIED_DAY, as_of)
    paths = {day: f'history/{day}.json' for day in payloads}
    config = source_config()
    for day, relative in config['history_files'].items():
        if day > as_of or day in payloads:
            continue
        path = verify_preserved(config, relative)
        if path.name != f'{day}.json':
            raise ValueError('Preserved history filename/date mismatch')
        payload = fit.best_rank_payload(day, path.parent)
        if payload is None:
            raise ValueError(f'Preserved history has no observed rank payload: {relative}')
        payloads[day] = payload
        paths[day] = relative
    return dict(sorted(payloads.items())), paths

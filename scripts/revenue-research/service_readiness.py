"""Reproducible service rehearsal. No site publication, Git or remote mutation.

Exit 0: the requested rehearsal completed (inspect release_ready separately).
Exit 1: execution/integrity failure. Exit 2 with --require-ready: quality blocked.
Candidate errors are cached once per month; nested selection reuses predictions,
not fits. Future outcomes cannot choose a past fold's candidate or interval.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import time
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import coverage_share as coverage
import history_fit as fit
from service_inputs import CONFIG, load_service_payloads
from service_model import (POLICY, SCOPE, assess, canonical, digest, error_summary,
                           fit_model, interval, monthly_labels, next_month, paired_cluster_scale,
                           predict_one, reserved_game, residual, training_rows,
                           unique_targets, write_atomic)

ROOT = coverage.ROOT
REPORTS = {
    'consumer_spend': 'reports/rank-models/history-fit-v38-2026-09-13.json',
    'downloads': 'reports/rank-models/history-fit-downloads-v13-2026-09-13.json',
}
MARKETS = {
    'consumer_spend': 'data/rank-models/global-chart-2026-v0.3.json',
    'downloads': 'data/rank-models/global-downloads-2026-v0.1.json',
}
MODEL_CODE = ['scripts/revenue-research/history_fit.py', 'scripts/revenue-research/history_panel.py',
              'scripts/revenue-research/score_day.py', 'scripts/revenue-research/coverage_share.py',
              'scripts/revenue-research/service_model.py', 'scripts/revenue-research/service_readiness.py',
              'scripts/revenue-research/service_inputs.py', 'scripts/revenue-research/september_day_check.py']


def inference_input_paths(metric: str) -> list[str]:
    """The complete service inference dependency contract, shared by write/read."""
    return MODEL_CODE + [MARKETS[metric], 'docs/research/anchors/identities.json']


def hashes(paths: list[str]) -> dict:
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in sorted(set(paths))}


def configure(metric: str) -> None:
    fit.METRIC.update(fit.DOWNLOAD_METRIC if metric == 'downloads' else {
        'name': 'consumer_spend', 'primary': 'grossing', 'secondary': 'free', 'currency': 'USD',
        'market_table': MARKETS['consumer_spend']})
    coverage.use_market_table(MARKETS[metric])


def audit_identity() -> dict:
    data = json.loads((ROOT / 'docs/research/anchors/identities.json').read_text(encoding='utf-8'))
    owners = {}
    duplicates = []
    for name, entry in data['games'].items():
        for store in ('ios', 'aos'):
            for app in entry[store]:
                key = f'{store}:{app}'
                if key in owners and owners[key] != name:
                    duplicates.append({'app': key, 'families': [owners[key], name]})
                owners[key] = name
    if duplicates:
        raise ValueError(f'Ambiguous identity ownership: {duplicates}')
    return {'families': len(data['games']), 'app_ids': len(owners), 'conflicting_app_ids': duplicates}


def complete_payloads(payloads: dict, weights: dict,
                      kinds: tuple[str, ...] = ('grossing', 'free')) -> tuple[dict, dict]:
    """Missing charts are missing observations, never zeros or list-position ranks."""
    expected = {f'{store}_{country.lower()}_{kind}' for (country, store), value in weights.items()
                if country in coverage.FIVE_MARKETS and value > 0 for kind in kinds}
    kept, bad = {}, {}
    for day, payload in payloads.items():
        missing = expected - set(payload['charts'])
        fallback = expected & set(payload.get('snapshot_fallback_charts', []))
        invalid = {key for key in expected & set(payload['charts'])
                   if payload['charts'][key].get('dropped', 0)}
        if missing or fallback or invalid:
            bad[day] = {'missing': sorted(missing), 'snapshot_substitutions': sorted(fallback),
                        'invalid_rank_charts': sorted(invalid)}
        else:
            kept[day] = payload
    return kept, {'expected_chart_keys': sorted(expected), 'input_days': len(payloads),
                  'complete_days': len(kept), 'rejected_days': bad}


def usable_index(index: dict, as_of: str) -> tuple[dict, dict]:
    good, quality = {}, {}
    for month, entry in index.items():
        fraction = entry['observed_days'] / entry['calendar_days']
        ready = fit.month_days(month)[-1] < as_of and fraction >= POLICY['min_observed_fraction']
        quality[month] = {'observed_days': entry['observed_days'], 'calendar_days': entry['calendar_days'],
                          'fraction': fraction, 'usable': ready}
        if ready:
            good[month] = entry
    return good, quality


def candidates(metric: str, seed: dict) -> list[dict]:
    """Bounded candidates, not a Cartesian curve/feature mega-grid."""
    points = [seed['chosen']['params']]
    plain = {'alpha_ios': 1.2, 'alpha_aos': 0.6 if metric == 'consumer_spend' else 0.8,
             'censored': 0.0, 'country_multipliers': {'CN': 3.0 if metric == 'consumer_spend' else 1.0},
             'knee': 20.0, 'alpha_tail_ios': 1.3, 'alpha_tail_aos': 1.3}
    if digest(plain) != digest(points[0]):
        points.append(plain)
    geography = ['share_CN', 'share_JP', 'share_KR', 'share_TW']
    sets = (['log_index', 'free_ratio', 'volatility', 'ios_share'],
            ['log_index', 'volatility', 'ios_share'] + geography,
            ['log_index', 'free_ratio', 'volatility', 'ios_share'] + geography)
    if metric == 'downloads':
        sets = (['log_index', 'free_ratio'],
                ['log_index', 'free_ratio', 'active_fraction'] + geography,
                ['log_index', 'free_ratio', 'volatility', 'active_fraction'] + geography)
    result = []
    for point in points:
        for features in sets:
            for lam in (0.25, 1.0):
                for half_life in (3.0, math.inf):
                    item = {'params': point, 'features': features, 'lambda': lam,
                            'feature_lambda': 1.0 if metric == 'consumer_spend' else 0.03,
                            'half_life': half_life}
                    result.append({**item, 'id': digest(item)[:16]})
    if metric == 'downloads':
        # Preserve warmup order and let only prior outcomes select this feature.
        within = []
        for original in list(result):
            item = {k: v for k, v in original.items() if k != 'id'}
            item['features'] = item['features'] + ['log_index_within']
            within.append({**item, 'id': digest(item)[:16]})
        result.extend(within)
        for original in within:
            item = {k: v for k, v in original.items() if k != 'id'}
            item['huber_delta'] = math.log(1.5)
            result.append({**item, 'id': digest(item)[:16]})
        # Separate high-leverage launch movement from mature-game response.
        # All games use the same penalty; only prior outcomes select the option.
        for original in list(result):
            if 'log_index_within' not in original['features']:
                continue
            item = {k: v for k, v in original.items() if k != 'id'}
            item['random_slope_lambda'] = 0.25
            result.append({**item, 'id': digest(item)[:16]})
    return result


def index_key(option: dict) -> str:
    return digest({'params': option['params'], 'secondary_required': 'free_ratio' in option['features']})


def prepare_indices(options: list[dict], payloads: dict, as_of: str) -> tuple[dict, dict, dict]:
    """Decode/flatten each required observation scope once; aggregate each curve once."""
    scopes, indices, qualities, audits = {}, {}, {}, {}
    for option in options:
        secondary = 'free_ratio' in option['features']
        if secondary not in scopes:
            kinds = (fit.METRIC['primary'], fit.METRIC['secondary']) if secondary else (fit.METRIC['primary'],)
            complete, audit = complete_payloads(payloads, coverage.market_weights(), kinds)
            if not complete:
                raise ValueError('No complete five-market observations')
            tables, names = fit.rank_tables(complete)
            scopes[secondary] = complete, tables, names
            audits[str(secondary)] = audit
        identity = index_key(option)
        if identity not in indices:
            complete, tables, names = scopes[secondary]
            index = fit.monthly_index_fast(complete, tables, names, option['params'])
            indices[identity], qualities[identity] = usable_index(index, as_of)
    return indices, qualities, audits


def key(row: dict) -> tuple:
    return row['family'], row['month'], row['class']


def candidate_errors(predictions: dict, labels: list[dict], metric: str,
                     before: str, reserve: bool = True) -> list[dict]:
    out = []
    for label in unique_targets(labels, metric):
        if label['month'] >= before or reserve and reserved_game(label['family']):
            continue
        prediction = predictions.get(key(label))
        if prediction:
            row = residual(prediction, label)
            if row:
                out.append(row)
    return out


def select_candidate(options: list[dict], predictions: dict, labels: list[dict],
                     metric: str, before: str, current_coverage: dict | None = None,
                     recency_stability: bool | None = None) -> tuple[dict, dict]:
    """Past-only selection; downloads retain full history when decay has no clear advantage.

    Explicit False preserves the original minimum-error research control.
    The paired game/month scale is a stability heuristic, not a confidence interval.
    """
    errors = {item['id']: candidate_errors(predictions[item['id']], labels, metric, before) for item in options}
    # Compare on identical family-periods. Candidates cannot win by dropping hard cases.
    common = set.intersection(*({key(r) for r in rows} for rows in errors.values()))
    if len(common) < 10 or len({k[1] for k in common}) < 2:
        # Availability is known without looking at outcome amounts. Do not
        # discard usable primary-only months merely to keep an optional feature.
        chosen = max(options, key=lambda item: ((current_coverage or {}).get(item['id'], 0),
                                                len(errors[item['id']])))
        return chosen, {'mode': 'coverage_first_warmup', 'common_rows': len(common),
                        'predictable_catalog': (current_coverage or {}).get(chosen['id'])}
    scores = {name: statistics.fmean(abs(r['log_error']) for r in rows if key(r) in common)
              for name, rows in errors.items()}
    chosen = min(options, key=lambda item: (scores[item['id']], item['id']))
    native = {'mode': 'past_only_inner_selection', 'common_rows': len(common),
              'mae_log': scores[chosen['id']]}
    enabled = metric == 'downloads' if recency_stability is None else recency_stability
    if not enabled or chosen['half_life'] == math.inf:
        return chosen, native
    family = digest({name: value for name, value in chosen.items() if name not in ('id', 'half_life')})
    siblings = [
        item for item in options if item['half_life'] == math.inf and
        digest({name: value for name, value in item.items() if name not in ('id', 'half_life')}) == family]
    if len(siblings) != 1:
        raise ValueError('Exactly one matching full-history sibling is required')
    sibling = siblings[0]
    paired_rows = {item['id']: {key(row): row for row in errors[item['id']]}
                   for item in (chosen, sibling)}
    shared = sorted(paired_rows[chosen['id']].keys() & paired_rows[sibling['id']].keys())
    pairs = [(row_key, abs(paired_rows[sibling['id']][row_key]['log_error']) -
                       abs(paired_rows[chosen['id']][row_key]['log_error'])) for row_key in shared]
    family_scale, month_scale = paired_cluster_scale(pairs, 0), paired_cluster_scale(pairs, 1)
    if family_scale is None or month_scale is None:
        return chosen, native
    difference = statistics.fmean(value for _, value in pairs)
    scale = max(family_scale, month_scale)
    prefer_full = difference <= scale
    return (sibling if prefer_full else chosen), {
        'mode': 'past_only_recency_stability',
        'native_candidate': chosen['id'], 'native_selection': native,
        'full_history_candidate': sibling['id'], 'common_rows': len(shared),
        'common_games': len({row_key[0] for row_key in shared}),
        'common_months': len({row_key[1] for row_key in shared}),
        'paired_full_history_loss_increase': difference,
        'family_cluster_scale': family_scale, 'month_cluster_scale': month_scale,
        'comparison_scale': scale, 'prefer_full_history': prefer_full}


def evaluate_metric(metric: str, raw: list[dict], sources: dict, payloads: dict,
                    names: list[str], as_of: str) -> tuple[dict, dict, dict]:
    started = time.perf_counter()
    configure(metric)
    seed = json.loads((ROOT / REPORTS[metric]).read_text(encoding='utf-8'))
    options = candidates(metric, seed)
    indices, qualities, chart_audits = prepare_indices(options, payloads, as_of)
    option_index_keys = {item['id']: index_key(item) for item in options}
    truth, label_audit = monthly_labels(raw, sources, set(names), metric, as_of)
    months = sorted({r['month'] for r in truth})
    predictions = {item['id']: {} for item in options}
    folds = {}
    catalog_coverage = {}
    fits = 0
    for month in months:
        cutoff = next_month(month) + '-01'
        vintage, _ = monthly_labels(raw, sources, set(names), metric, min(cutoff, as_of))
        folds[month] = vintage
        catalog_coverage[month] = {}
        targets = [r for r in unique_targets(truth, metric) if r['month'] == month]
        # Hyperparameters share observations and labels within a curve/scope.
        # fit_model is read-only on these rows; never reuse across vintage cutoffs.
        training_by_index = {}
        for option in options:
            identity = option_index_keys[option['id']]
            index = indices[identity]
            if identity not in training_by_index:
                training_by_index[identity] = training_rows(vintage, index, names, month, as_of=cutoff)
            rows = training_by_index[identity]
            model = fit_model(rows, option)
            fits += model is not None
            klass = 'gross' if metric == 'consumer_spend' else 'downloads'
            supported = model is not None and model['class_counts'].get(klass, 0) >= fit.MIN_CLASS_LABELS
            catalog_coverage[month][option['id']] = (
                len(index.get(month, {}).get('mean_daily', {})) if supported else 0)
            for label in targets:
                predictions[option['id']][key(label)] = predict_one(
                    label['family'], month, label['class'], index, names, model)
    selected_predictions, outer_rows, selections = {}, [], []
    for month in months:
        chosen, selection = select_candidate(options, predictions, folds[month], metric, month,
                                              catalog_coverage[month])
        selections.append({'month': month, 'candidate': chosen['id'], **selection})
        # Re-resolve previous outcomes at this cutoff; later article revisions
        # cannot enter an earlier calibration interval.
        past = candidate_errors(selected_predictions, folds[month], metric, month)
        for label in unique_targets(truth, metric):
            if label['month'] != month:
                continue
            prediction = predictions[chosen['id']][key(label)]
            selected_predictions[key(label)] = prediction
            measured = residual(prediction, label)
            row = interval(prediction, past, metric)
            if measured:
                row.update({k: measured[k] for k in ('actual', 'available_on', 'source_id', 'error_pct', 'log_error')})
            outer_rows.append({**row, 'reserved_family': reserved_game(label['family'])})
    target_month = as_of[:7]
    chosen, selection = select_candidate(options, predictions, truth, metric, target_month)
    final_index = indices[option_index_keys[chosen['id']]]
    training = training_rows(truth, final_index, names, target_month, reserve=False, as_of=as_of)
    final_model = fit_model(training, chosen)
    if final_model is None:
        raise ValueError(f'Insufficient final training for {metric}')
    final_model['first_observed_months'] = {
        name: min(entry['first_observed_month'][name] for entry in final_index.values()
                  if name in entry.get('first_observed_month', {}))
        for name in names if any(name in entry.get('first_observed_month', {}) for entry in final_index.values())}
    past = candidate_errors(selected_predictions, truth, metric, target_month)
    assessment = assess(outer_rows, metric)
    frozen = {'schema_version': 1, 'production_enabled': False, 'metric': metric,
              'training_as_of': as_of, 'first_prediction_month': target_month,
              'scope': SCOPE[metric], 'policy': POLICY, 'candidate': chosen,
              'model': final_model, 'calibration': past, 'families': names,
              'training_family_months': len({(r['family'], r['month']) for r in training}),
              'assessment': assessment,
              'inference_input_hashes': hashes(inference_input_paths(metric))}
    # Complete, historical month preview: never label it a prospective prediction.
    preview_month = max(final_index)
    klass = 'gross' if metric == 'consumer_spend' else 'downloads'
    preview = [interval(predict_one(name, preview_month, klass, final_index, names, final_model), past, metric)
               for name in names]
    assessment = assess(outer_rows, metric, catalog_rows=preview)
    frozen['assessment'] = assessment
    report = {'metric': metric, 'scope': SCOPE[metric], 'assessment': assessment,
              'reserved_family_error': error_summary([r for r in outer_rows
                                                      if r['reserved_family'] and 'error_pct' in r]),
              'label_audit': label_audit, 'chart_audit_by_secondary_requirement': chart_audits,
              'month_quality': qualities[option_index_keys[chosen['id']]],
              'candidate_count': len(options), 'curve_aggregations': len(indices), 'fit_calls': fits + 1,
              'selection': selections, 'final_selection': selection, 'chosen': chosen,
              'validation_rows': outer_rows, 'seconds': time.perf_counter() - started}
    return report, frozen, {'metric': metric, 'month': preview_month, 'rows': preview}


def validate_frozen(bundle: dict) -> None:
    if bundle.get('schema_version') != 1 or bundle.get('production_enabled') is not False:
        raise ValueError('Unsupported or production-enabled frozen artifact')
    if bundle['policy'] != POLICY:
        raise ValueError('Frozen policy differs; do not silently change prospective gates')
    if set(bundle['inference_input_hashes']) != set(inference_input_paths(bundle['metric'])):
        raise ValueError('Frozen inference dependency manifest is incomplete or incompatible')
    actual = hashes(list(bundle['inference_input_hashes']))
    if actual != bundle['inference_input_hashes']:
        raise ValueError('Frozen inference inputs changed; preserve the original environment')


def target_outcome_known(raw: list[dict], names: set[str], metric: str, month: str,
                         *, sources: dict | None = None, published_by: str | None = None) -> bool:
    """Any target evidence invalidates novelty; later revisions cannot reset it.

    Creation rejects all target evidence already in the ledger. Evaluation
    checks all publication vintages, including pending/net/reprinted amounts.
    An unknown publication date cannot establish prediction-before-outcome.
    """
    for row in raw:
        if not (row.get('metric') == metric and row.get('geography') == 'WW'
                and sorted(row.get('stores') or []) == ['app_store', 'google_play']
                and (row.get('period') or {}).get('kind') == 'month'
                and fit.period_key(row['period']) == month
                and fit.family_for(row, names) in names):
            continue
        if published_by is None:
            return True
        published = (sources or {}).get(row.get('source_id'), {}).get('published_on')
        try:
            published = date.fromisoformat(published).isoformat()
        except (ValueError, TypeError):
            return True
        if published <= published_by:
            return True
    return False


def predict_frozen(path: Path, month: str, as_of: str, payloads: dict, raw: list[dict], sources: dict) -> dict:
    bundle = json.loads(path.read_text(encoding='utf-8'))
    validate_frozen(bundle)
    if month < bundle['first_prediction_month'] or fit.month_days(month)[-1] >= as_of:
        raise ValueError('Prospective predictions require a completed, post-freeze target month')
    if target_outcome_known(raw, set(bundle['families']), bundle['metric'], month):
        raise ValueError('Target outcomes already known; this cannot be a prospective prediction')
    configure(bundle['metric'])
    selected = {day: value for day, value in payloads.items() if day[:7] == month}
    kinds = ((fit.METRIC['primary'], fit.METRIC['secondary'])
             if 'free_ratio' in bundle['candidate']['features'] else (fit.METRIC['primary'],))
    complete, audit = complete_payloads(selected, coverage.market_weights(), kinds)
    if not complete:
        raise ValueError('No complete target-month charts')
    tables, names = fit.rank_tables(complete)
    index, quality = usable_index(
        fit.monthly_index_fast(complete, tables, names, bundle['candidate']['params']), as_of)
    if month not in index:
        raise ValueError('Target-month chart completeness gate failed')
    klass = 'gross' if bundle['metric'] == 'consumer_spend' else 'downloads'
    rows = [interval(predict_one(name, month, klass, index, names, bundle['model']),
                     bundle['calibration'], bundle['metric']) for name in bundle['families']]
    return {'schema_version': 1, 'production_enabled': False, 'kind': 'prospective_prediction',
            'created_at': datetime.now(timezone.utc).isoformat(), 'as_of': as_of,
            'metric': bundle['metric'], 'month': month, 'scope': bundle['scope'], 'policy': POLICY,
            'frozen_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'rows': rows, 'chart_audit': audit, 'month_quality': quality}


def evaluate_predictions(prediction: dict, raw: list[dict], sources: dict, as_of: str) -> dict:
    if prediction.get('kind') != 'prospective_prediction' or prediction.get('policy') != POLICY:
        raise ValueError('Not a compatible timestamped prospective prediction')
    created = datetime.fromisoformat(prediction['created_at'])
    if created.tzinfo is None:
        raise ValueError('Prediction timestamp must include its timezone')
    names = {r['family'] for r in prediction['rows']}
    # A later selected revision must not hide an earlier available amount.
    # Publication time is only a date, so same-day evidence also blocks.
    publication_boundary = max(prediction['as_of'], created.date().isoformat())
    if target_outcome_known(raw, names, prediction['metric'], prediction['month'],
                            sources=sources, published_by=publication_boundary):
        raise ValueError('Outcome publication does not demonstrably follow prediction')
    truth, audit = monthly_labels(raw, sources, names, prediction['metric'], as_of)
    truth = {key(r): r for r in unique_targets(truth, prediction['metric'])
             if r['month'] == prediction['month']}
    rows = []
    for row in prediction['rows']:
        label = truth.get(key(row))
        if not label:
            continue
        actual = label['amount_usd_m'] * 1e6
        measured = {**row, 'actual': actual}
        if 'estimate' in row:
            measured.update(log_error=math.log(row['estimate'] / actual),
                            error_pct=100 * abs(row['estimate'] / actual - 1))
        rows.append(measured)
    return {'schema_version': 1, 'production_enabled': False, 'kind': 'prospective_evaluation',
            'as_of': as_of, 'metric': prediction['metric'], 'month': prediction['month'],
            'prediction_sha256': digest(prediction),
            'assessment': assess(rows, prediction['metric'], prospective=True, catalog_rows=prediction['rows']),
            'label_audit': audit, 'matched_outcomes': len(rows),
            'pending_families': sorted(names - {r['family'] for r in rows}),
            'catalog_rows': prediction['rows'], 'rows': rows}


def publish_rehearsal(output: Path, report: dict, preview: dict) -> None:
    """Commit a complete immutable generation; a partial update cannot replace it."""
    generation = f'service-runs/{digest(report)[:24]}'
    directory = output.parent / generation
    write_atomic(directory / 'service-readiness.json', report, immutable=True)
    write_atomic(directory / 'service-preview.json', preview, immutable=True)
    # Human-facing aliases are not the transaction boundary. Consumers follow
    # service-current.json, which changes only after all required writes succeed.
    write_atomic(output, report)
    write_atomic(output.with_name('service-preview.json'), preview)
    write_atomic(output.with_name('service-health.json'), {
        'ok': True, 'as_of': report['as_of'], 'release_ready': False,
        'alerts': [f'{m["metric"]}:{gate}' for m in report['metrics']
                   for gate, passed in m['assessment']['gates'].items() if not passed]
                  + (['rank_inputs_stale_over_3_days'] if report['rank_age_days'] > 3 else []),
        'last_successful_generation': generation})
    write_atomic(output.with_name('service-current.json'), {
        'schema_version': 1, 'generation': generation, 'readiness_sha256': digest(report)})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--as-of', default=datetime.now(timezone(timedelta(hours=9))).date().isoformat())
    parser.add_argument('--output', default='reports/rank-models/service-readiness.json')
    parser.add_argument('--predict-frozen', default='')
    parser.add_argument('--month', default='')
    parser.add_argument('--evaluate', nargs='+', default=[])
    parser.add_argument('--require-ready', action='store_true')
    args = parser.parse_args()
    if args.predict_frozen and args.evaluate:
        parser.error('--predict-frozen and --evaluate are mutually exclusive')
    datetime.strptime(args.as_of, '%Y-%m-%d')
    output = ROOT / args.output
    try:
        raw = fit.ledger_rows()
        sources = json.loads((ROOT / 'docs/research/anchors/sources.json').read_text(encoding='utf-8'))
        if args.evaluate:
            evaluations = []
            for name in args.evaluate:
                prediction = json.loads((ROOT / name).read_text(encoding='utf-8'))
                evaluations.append(evaluate_predictions(prediction, raw, sources, args.as_of))
            if len({r['metric'] for r in evaluations}) != 1:
                raise ValueError('Evaluate one metric at a time; never mix currency and installs')
            rows = [row for result in evaluations for row in result['rows']]
            if len({key(row) for row in rows}) != len(rows):
                raise ValueError('Duplicate family-month outcomes across predictions')
            metric = evaluations[0]['metric']
            catalog_rows = [row for result in evaluations for row in result['catalog_rows']]
            if len({key(row) for row in catalog_rows}) != len(catalog_rows):
                raise ValueError('Duplicate family-months in the prediction catalog')
            report = {'schema_version': 1, 'production_enabled': False,
                      'kind': 'prospective_evaluation', 'metric': metric, 'as_of': args.as_of,
                      'assessment': assess(rows, metric, prospective=True, catalog_rows=catalog_rows),
                      'prediction_evaluations': evaluations}
            write_atomic(output, report)
            ready = report['assessment']['release_ready']
        else:
            identity = audit_identity()
            payloads, history_paths = load_service_payloads(args.as_of)
            if args.predict_frozen:
                if not args.month:
                    raise ValueError('--predict-frozen requires --month')
                report = predict_frozen(ROOT / args.predict_frozen, args.month, args.as_of, payloads, raw, sources)
                write_atomic(output, report, immutable=True)
                ready = False
            else:
                _, names = fit.identity_families()
                reports, previews, bundles = [], [], []
                created = datetime.now(timezone.utc).isoformat()
                source_hashes = hashes([
                    'docs/research/anchors/anchors.jsonl', 'docs/research/anchors/sources.json',
                    CONFIG, *REPORTS.values()] + list(history_paths.values()))
                for metric in ('consumer_spend', 'downloads'):
                    result, frozen, preview = evaluate_metric(metric, raw, sources, payloads, names, args.as_of)
                    frozen['created_at'] = created
                    frozen['first_prediction_month'] = max(frozen['first_prediction_month'], created[:7])
                    frozen['source_hashes'] = source_hashes
                    bundles.append((metric, frozen))
                    reports.append(result)
                    previews.append(preview)
                # Write after both metrics finish; partial failed computations
                # never replace the last successful readiness or preview.
                frozen_paths = {}
                for metric, frozen in bundles:
                    name = f'reports/rank-models/service-frozen/{metric}-{digest(frozen)[:20]}.json'
                    write_atomic(ROOT / name, frozen, immutable=True)
                    frozen_paths[metric] = name
                report = {'schema_version': 1, 'production_enabled': False, 'execution_ok': True,
                          'release_ready': False, 'as_of': args.as_of, 'created_at': created,
                          'policy': POLICY, 'identity_audit': identity, 'metrics': reports,
                          'latest_rank_day': max(payloads),
                          'rank_age_days': (datetime.fromisoformat(args.as_of) -
                                            datetime.fromisoformat(max(payloads))).days,
                          'frozen_models': frozen_paths,
                          'limitations': [
                              'Targets are published AppMagic estimates, not observed publisher revenue or installs.',
                              'Historical curves, identity mappings and fixed market weights were already inspected.',
                              'No future coverage snapshot or same-month market-total feature enters this service fit.',
                              'Historical source publication dates are reconstructed; collection did not occur at those dates.',
                              'Fresh prospective validation and commercial data-use permission remain release prerequisites.',
                              'No country-level, daily or new-launch accuracy claim.',
                          ]}
                preview = {
                    'schema_version': 1, 'production_enabled': False, 'kind': 'in_sample_internal_preview',
                    'created_at': created, 'as_of': args.as_of, 'metrics': previews,
                    'readiness_sha256': digest(report), 'release_ready': False}
                publish_rehearsal(output, report, preview)
                ready = False
        print(json.dumps({'output': str(output), 'execution_ok': True, 'release_ready': ready}))
        if args.require_ready and not ready:
            raise SystemExit(2)
    except Exception as error:
        write_atomic(output.with_name('service-health.json'), {
            'ok': False, 'as_of': args.as_of, 'release_ready': False,
            'error_type': type(error).__name__, 'error': str(error),
            'last_good_generation_preserved': True})
        raise


if __name__ == '__main__':
    main()

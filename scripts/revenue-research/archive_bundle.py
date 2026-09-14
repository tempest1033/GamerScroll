"""Bundle a month of chart archives into one verifiable file.

The five-market CSV archive is the project's longest rank history and it is
gitignored, so it exists on one machine only. This packs a finished month into a
single compressed bundle with a per-file SHA-256 manifest, so it can be copied
somewhere durable and checked later. Originals are never modified or deleted.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

from coverage_share import ROOT

SOURCE = 'snapshots/rankings'
TARGET = 'reports/archive-bundles'


def describe_path(path: Path) -> str:
    """Project-relative when it lives here, absolute otherwise, so manifests stay readable."""
    try:
        return str(path.relative_to(ROOT)).replace('\\', '/')
    except ValueError:
        return str(path)


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            sha.update(block)
    return sha.hexdigest()


def month_files(source: Path, month: str) -> list[Path]:
    return sorted(path for path in source.glob(f'{month}-*') if path.is_file())


def build(source: Path, target: Path, month: str) -> dict:
    files = month_files(source, month)
    if not files:
        raise SystemExit(f'No archive files for {month} in {source}')
    target.mkdir(parents=True, exist_ok=True)
    bundle = target / f'{month}.zip'
    manifest = {'schema_version': 1, 'month': month, 'source': describe_path(source),
                'files': [], 'bytes_raw': 0}
    with zipfile.ZipFile(bundle, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            archive.write(path, arcname=path.name)
            size = path.stat().st_size
            manifest['files'].append({'name': path.name, 'bytes': size, 'sha256': digest(path)})
            manifest['bytes_raw'] += size
    manifest['bundle'] = describe_path(bundle)
    manifest['bytes_bundle'] = bundle.stat().st_size
    manifest['file_count'] = len(files)
    return manifest


def verify(bundle: Path, manifest: dict) -> dict:
    """Read every member back out of the bundle and re-hash it."""
    mismatched = []
    with zipfile.ZipFile(bundle) as archive:
        names = set(archive.namelist())
        for row in manifest['files']:
            if row['name'] not in names:
                mismatched.append({'name': row['name'], 'problem': 'missing from bundle'})
                continue
            sha = hashlib.sha256()
            with archive.open(row['name']) as handle:
                for block in iter(lambda: handle.read(1 << 20), b''):
                    sha.update(block)
            if sha.hexdigest() != row['sha256']:
                mismatched.append({'name': row['name'], 'problem': 'hash differs'})
    return {'checked': len(manifest['files']), 'mismatched': mismatched}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--months', default='2026-08,2026-09')
    parser.add_argument('--source', default=SOURCE)
    parser.add_argument('--target', default=TARGET)
    args = parser.parse_args()
    source, target = ROOT / args.source, ROOT / args.target
    bundles = []
    for month in args.months.split(','):
        manifest = build(source, target, month)
        result = verify(target / f'{month}.zip', manifest)
        manifest['verification'] = result
        if result['mismatched']:
            raise SystemExit(f'Bundle verification failed for {month}: {result["mismatched"][:3]}')
        path = target / f'{month}.manifest.json'
        path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
        bundles.append({'month': month, 'bundle': manifest['bundle'],
                        'manifest': describe_path(path),
                        'files': manifest['file_count'], 'bytes_raw': manifest['bytes_raw'],
                        'bytes_bundle': manifest['bytes_bundle'],
                        'compression': round(manifest['bytes_bundle'] / manifest['bytes_raw'], 3),
                        'verified_files': result['checked']})
    print(json.dumps({'bundles': bundles,
                      'note': 'Originals untouched; copy these bundles off this machine to make the '
                              'history durable.'}, indent=2))


if __name__ == '__main__':
    main()

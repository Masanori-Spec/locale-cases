#!/usr/bin/env python3
"""Build a deterministic source archive plus per-file SHA-256 manifest."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root.parent / 'locale-cases-output'
out.mkdir(parents=True, exist_ok=True)
exclude = {'.git', 'node_modules', 'dist', 'test-results', 'browser-artifacts', '__pycache__', 'out'}
files = sorted(p for p in root.rglob('*') if p.is_file() and not any(x in exclude for x in p.relative_to(root).parts) and p.name != 'benchmark-ci.json' and not p.name.endswith('.log'))
manifest = {'project': 'Locale Cases', 'format': 1, 'files': [{'path': p.relative_to(root).as_posix(), 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
manifest_path = out / 'source-manifest.json'
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
archive = out / 'locale-cases.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in files:
        info = zipfile.ZipInfo('locale-cases/' + p.relative_to(root).as_posix(), (2020, 1, 1, 0, 0, 0))
        info.external_attr = 0o644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, p.read_bytes())
with zipfile.ZipFile(archive) as z:
    for row in manifest['files']:
        assert hashlib.sha256(z.read('locale-cases/' + row['path'])).hexdigest() == row['sha256']
print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'files': len(files), 'manifest': str(manifest_path)}, indent=2))

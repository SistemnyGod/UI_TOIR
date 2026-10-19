"""Reconstruct the deployed manifest's sources before applying a PPE-only overlay.

Run from the repository root. Unknown historical hashes remain explicit; compare
the baseline bundle with the running web assets before deploying the overlay.
Never reads environment files, changes Git state, or approves business data.
"""
import hashlib
import io
import json
import pathlib
import subprocess
import zipfile

root = pathlib.Path.cwd().resolve()
output = root / "output/ppe-recovery-20261004"
destination = output / "release-source"
if destination.exists():
    raise SystemExit("Snapshot already exists; do not overwrite a reviewed snapshot.")
manifest = json.loads((root / "artifacts/release-2026-09-30/build-manifest.json").read_text(encoding="utf-8-sig"))
archive = subprocess.run(["git", "archive", "--format=zip", manifest["commit"]], check=True, capture_output=True).stdout
with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
    bundle.extractall(destination)
selected, unknown = [], []
for source in manifest["sourceFiles"]:
    name = source["path"].replace("\\", "/")
    if not name.startswith(("apps/api/", "apps/web/", "libs/")):
        continue
    current = root / name
    sha = lambda data: hashlib.sha256(data).hexdigest()
    raw = current.read_bytes() if current.is_file() else None
    choice = "deployed-current"
    if raw is None or sha(raw) != source["sha256"]:
        head = subprocess.run(["git", "show", f'{manifest["commit"]}:{name}'], capture_output=True)
        if head.returncode:
            raise SystemExit(f"Cannot recover deployed source: {name}")
        lf = head.stdout.replace(b"\r\n", b"\n")
        variants = [head.stdout, lf, lf.replace(b"\n", b"\r\n")]
        variants += [data[3:] if data.startswith(b"\xef\xbb\xbf") else b"\xef\xbb\xbf" + data for data in variants[:]]
        raw = next((data for data in variants if sha(data) == source["sha256"]), None)
        choice = "deployed-head"
        if raw is None:
            unknown.append(name)
            choice, raw = "candidate-head-needs-runtime-verification", head.stdout
    target = destination / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
    selected.append(dict(path=name, origin=choice, sha256=sha(raw), expected=source["sha256"]))
(output / "release-baseline-selection.json").write_text(json.dumps(dict(commit=manifest["commit"], selected=selected, unresolved=unknown), indent=2), encoding="utf-8")
print(f"Snapshot: {destination}; verified {len(selected) - len(unknown)}, runtime verification required: {unknown}")

"""Build the Chrome Web Store ZIP using only runtime files (Python 3 stdlib)."""

import hashlib
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
version = manifest["version"]
if not re.fullmatch(r"\d+\.\d+\.\d+(?:\.\d+)?", version):
    raise ValueError("Invalid manifest version")
if version != package["version"]:
    raise ValueError("Manifest and package versions must match")

privacy_policy = root / "PRIVACY.md"
if not privacy_policy.is_file():
    raise FileNotFoundError("Missing Store privacy policy: PRIVACY.md")

files = [root / "manifest.json", root / "LICENSE", privacy_policy]
for directory in ("src", "_locales", "assets/icons"):
    files.extend(path for path in (root / directory).rglob("*") if path.is_file())
for path in files:
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError(f"Unexpected package path: {path}")
    if path.name.startswith(".") or path.suffix in {".pem", ".log", ".zip"}:
        raise ValueError(f"Unexpected runtime file: {path}")

entries = {path.relative_to(root).as_posix(): path for path in files}
required = [
    manifest["chrome_url_overrides"]["newtab"],
    manifest["action"]["default_popup"],
    *manifest["icons"].values(),
    *manifest["action"]["default_icon"].values(),
]
required.append(f'_locales/{manifest["default_locale"]}/messages.json')
for entry in required:
    if entry not in entries:
        raise ValueError(f"Missing manifest resource: {entry}")

output = root / "dist"
output.mkdir(exist_ok=True)
archive = output / f"newdesktab-{version}.zip"
with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as bundle:
    for name, path in sorted(entries.items()):
        bundle.write(path, name)
with ZipFile(archive) as bundle:
    if bundle.testzip() is not None or set(bundle.namelist()) != set(entries):
        raise ValueError("ZIP verification failed")
    for name, path in entries.items():
        if bundle.read(name) != path.read_bytes():
            raise ValueError(f"ZIP content mismatch: {name}")

digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(".zip.sha256").write_text(f"{digest}  {archive.name}\n", encoding="ascii")
print(f"Created {archive} ({archive.stat().st_size:,} bytes; {len(entries)} files)")
print(f"SHA256 {digest}")

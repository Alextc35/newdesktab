"""Build verified Store/developer runtime ZIPs using only Python 3 stdlib."""

import argparse
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parent.parent
RUNTIME_DIRECTORIES = ("src", "_locales", "assets/icons")


def canonical_manifest(manifest, target):
    """Only the Store artifact drops the public development identity key."""
    packaged = dict(manifest)
    if target == "store":
        packaged.pop("key", None)
    return (json.dumps(packaged, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def runtime_entries(root, manifest):
    privacy_policy = root / "PRIVACY.md"
    if not privacy_policy.is_file():
        raise FileNotFoundError("Missing Store privacy policy: PRIVACY.md")
    files = [root / "manifest.json", root / "LICENSE", privacy_policy]
    for directory in RUNTIME_DIRECTORIES:
        files.extend(path for path in (root / directory).rglob("*") if path.is_file())
    for path in files:
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise ValueError(f"Unexpected package path: {path}")
        if path.name.startswith(".") or path.suffix.lower() in {
            ".pem", ".key", ".p12", ".pfx", ".log", ".zip"
        }:
            raise ValueError(f"Unexpected runtime file: {path}")

    entries = {path.relative_to(root).as_posix(): path for path in files}
    required = [
        manifest["chrome_url_overrides"]["newtab"],
        manifest["action"]["default_popup"],
        *manifest["icons"].values(),
        *manifest["action"]["default_icon"].values(),
        f'_locales/{manifest["default_locale"]}/messages.json',
    ]
    for entry in required:
        if entry not in entries:
            raise ValueError(f"Missing manifest resource: {entry}")
    return entries


def build_packages(root=ROOT, target="store", output=None):
    """Build requested targets without modifying the source manifest or runtime."""
    if target not in {"store", "dev", "all"}:
        raise ValueError(f"Unknown package target: {target}")
    root = Path(root).resolve()
    source_manifest = (root / "manifest.json").read_bytes()
    manifest = json.loads(source_manifest.decode("utf-8"))
    package = json.loads((root / "package.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:\.\d+)?", version):
        raise ValueError("Invalid manifest version")
    if version != package["version"]:
        raise ValueError("Manifest and package versions must match")

    entries = runtime_entries(root, manifest)
    destination = Path(output) if output is not None else root / "dist"
    destination.mkdir(parents=True, exist_ok=True)
    archives = []
    for variant in (("store", "dev") if target == "all" else (target,)):
        suffix = "-dev" if variant == "dev" else ""
        archive = destination / f"newdesktab-{version}{suffix}.zip"
        temporary = archive.with_suffix(".zip.tmp")
        packaged_manifest = canonical_manifest(manifest, variant)
        try:
            with ZipFile(temporary, "w", compression=ZIP_DEFLATED, compresslevel=9) as bundle:
                for name, path in sorted(entries.items()):
                    if name == "manifest.json":
                        info = ZipInfo.from_file(path, name)
                        bundle.writestr(info, packaged_manifest, compress_type=ZIP_DEFLATED,
                                        compresslevel=9)
                    else:
                        bundle.write(path, name)
            with ZipFile(temporary) as bundle:
                if bundle.testzip() is not None or set(bundle.namelist()) != set(entries):
                    raise ValueError(f"{variant} ZIP verification failed")
                for name, path in entries.items():
                    expected = packaged_manifest if name == "manifest.json" else path.read_bytes()
                    if bundle.read(name) != expected:
                        raise ValueError(f"{variant} ZIP content mismatch: {name}")
            if (root / "manifest.json").read_bytes() != source_manifest:
                raise ValueError("Source manifest changed while packaging")
            temporary.replace(archive)
        finally:
            temporary.unlink(missing_ok=True)

        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        archive.with_suffix(".zip.sha256").write_text(
            f"{digest}  {archive.name}\n", encoding="ascii"
        )
        archives.append(archive)
        print(f"Created {archive} ({archive.stat().st_size:,} bytes; {len(entries)} files; {variant})")
        print(f"SHA256 {digest}")
    return archives


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target", choices=("store", "dev", "all"), default="store",
        help="store: omit manifest key; dev: preserve source key; all: build both (default: store)",
    )
    args = parser.parse_args()
    build_packages(target=args.target)


if __name__ == "__main__":
    main()

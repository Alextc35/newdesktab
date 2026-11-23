"""Regression checks for the public Store and stable-ID developer artifacts."""

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile


ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("package_extension", ROOT / "scripts/package-extension.py")
PACKAGER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGER)


class ExtensionPackagingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="newdesktab-package-test-")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.output = Path(cls.temporary.name)
        cls.source_bytes = (ROOT / "manifest.json").read_bytes()
        cls.manifest = json.loads(cls.source_bytes)
        cls.archives = PACKAGER.build_packages(ROOT, target="all", output=cls.output)

    def test_store_omits_key_and_developer_preserves_source_identity(self):
        store, developer = self.archives
        self.assertEqual(store.name, f'newdesktab-{self.manifest["version"]}.zip')
        self.assertEqual(developer.name, f'newdesktab-{self.manifest["version"]}-dev.zip')
        self.assertIn("key", self.manifest, "The developer fixture must have a stable public key")
        for archive, target in ((store, "store"), (developer, "dev")):
            with self.subTest(target=target), ZipFile(archive) as bundle:
                data = bundle.read("manifest.json")
                packaged = json.loads(data)
                expected = dict(self.manifest)
                if target == "store":
                    expected.pop("key")
                    self.assertNotIn("key", packaged)
                else:
                    self.assertEqual(packaged["key"], self.manifest["key"])
                self.assertEqual(packaged, expected)
                self.assertEqual(data, (json.dumps(expected, ensure_ascii=False, indent=2) + "\n").encode())
        self.assertEqual((ROOT / "manifest.json").read_bytes(), self.source_bytes)

    def test_both_archives_have_identical_runtime_only_files_and_valid_checksums(self):
        expected = {"manifest.json", "LICENSE", "PRIVACY.md"}
        for directory in ("src", "_locales", "assets/icons"):
            expected.update(path.relative_to(ROOT).as_posix()
                            for path in (ROOT / directory).rglob("*") if path.is_file())
        for archive in self.archives:
            with self.subTest(archive=archive.name), ZipFile(archive) as bundle:
                self.assertIsNone(bundle.testzip())
                self.assertEqual(set(bundle.namelist()), expected)
                self.assertEqual(len(bundle.namelist()), len(expected))
                for name in expected - {"manifest.json"}:
                    self.assertEqual(bundle.read(name), (ROOT / name).read_bytes(), name)
                self.assertFalse(any(name.startswith(("promo-video/", "tests/", "docs/", "node_modules/"))
                                     or Path(name).suffix.lower() in {".pem", ".key", ".p12", ".pfx"}
                                     for name in bundle.namelist()))
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            self.assertEqual(archive.with_suffix(".zip.sha256").read_text(encoding="ascii"),
                             f"{digest}  {archive.name}\n")
        self.assertEqual((ROOT / "manifest.json").read_bytes(), self.source_bytes)


if __name__ == "__main__":
    unittest.main()

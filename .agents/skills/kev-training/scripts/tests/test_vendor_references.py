"""Relocated upstream packages stay complete and usable without Modal or network."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import training_plan as planner


class VendorReferenceTests(unittest.TestCase):
    def test_complete_packages_and_licenses_match_fixed_manifests(self):
        identities = planner.verify_vendor()
        self.assertEqual(set(identities), {"kev-finetune", "kev-deploy"})
        for name, root in planner.VENDOR_ROOTS.items():
            with self.subTest(package=name):
                manifest = json.loads((root / "UPSTREAM.json").read_text())
                expected = {item["path"] for item in manifest["upstream_files"]}
                expected.update(manifest["local_additions"])
                actual = {str(path.relative_to(root)) for path in root.rglob("*")
                          if path.is_file() and "__pycache__" not in path.parts}
                self.assertEqual(actual, expected)
                self.assertEqual(len(manifest["upstream_files"]),
                                 manifest["verification"]["original_file_count"])
                license_info = manifest["license"]
                self.assertEqual(hashlib.sha256((root / license_info["local_path"]).read_bytes()).hexdigest(),
                                 license_info["sha256"])

    def test_vendor_byte_change_still_blocks_training_preparation(self):
        with tempfile.TemporaryDirectory() as temporary:
            copied = {}
            for name, root in planner.VENDOR_ROOTS.items():
                copied[name] = Path(temporary) / name
                shutil.copytree(root, copied[name], ignore=shutil.ignore_patterns("__pycache__"))
            altered = copied["kev-finetune"] / "README.md"
            altered.write_bytes(altered.read_bytes() + b"\nsynthetic tampering\n")
            with patch.object(planner, "VENDOR_ROOTS", copied):
                with self.assertRaisesRegex(ValueError, "vendor_file_changed: kev-finetune/README.md"):
                    planner.verify_vendor()

    def test_official_local_helpers_resolve_sibling_imports_from_another_cwd(self):
        # --help exits during argument parsing; no data generation or remote app
        # import occurs. In particular, never import kev_modal.py/kev_serve.py.
        scripts = planner.VENDOR_ROOTS["kev-finetune"] / "scripts"
        with tempfile.TemporaryDirectory() as temporary:
            for filename in ("convert_data.py", "generate_data.py", "extract_workload.py",
                             "plan_size.py", "split_data.py"):
                with self.subTest(script=filename):
                    result = subprocess.run([sys.executable, str(scripts / filename), "--help"],
                                            cwd=temporary, capture_output=True, text=True, timeout=15)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIn("usage:", result.stdout.lower())
            self.assertEqual(list(Path(temporary).iterdir()), [])


if __name__ == "__main__":
    unittest.main()

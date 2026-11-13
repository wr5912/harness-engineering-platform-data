import json
import sys
import tempfile
import unittest
from pathlib import Path


MCP_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MCP_ROOT))
import validate_catalog  # noqa: E402


class CurrentCatalogTest(unittest.TestCase):
    def test_catalog_has_one_status_per_composition_directory(self):
        manifest = validate_catalog.build_manifest()
        self.assertTrue(manifest["valid"], manifest["errors"])
        self.assertEqual(manifest["registered_count"], 11)
        self.assertEqual(manifest["published_count"], 10)
        self.assertEqual(manifest["draft_count"], 1)
        self.assertEqual(manifest["unregistered_count"], 1)

        entries = {item["id"]: item for item in manifest["compositions"]}
        self.assertEqual(entries["inspection-status"]["status"], "unregistered")
        self.assertEqual(entries["xx-device-policy"]["status"], "draft")
        self.assertTrue(entries["inspection-baseline"]["closure_digest"].startswith("sha256:"))
        self.assertRegex(entries["inspection-baseline"]["closure_digest"], r"^sha256:[0-9a-f]{64}$")

    def test_manifest_write_matches_generated_content(self):
        expected = validate_catalog.build_manifest()
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "current-manifest.json"
            output.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n")
            actual = json.loads(output.read_text())
        self.assertEqual(actual, expected)


if __name__ == "__main__":
    unittest.main()

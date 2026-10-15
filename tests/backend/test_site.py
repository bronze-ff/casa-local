"""O modelo público site.example.json precisa ser válido e não conter dados de uma casa real."""
import json
from pathlib import Path
import tempfile
import unittest

from backend.site import known_devices, load_site, validate_site

EXAMPLE = Path(__file__).resolve().parents[2] / "site.example.json"


class SiteTests(unittest.TestCase):
    def test_example_is_valid_and_fictitious(self):
        site = load_site(EXAMPLE)
        self.assertEqual(set(known_devices(site).values()), {"quarto-luz", "banheiro-luz", "central-ir"})
        for item in (*site["lights"].values(), site["irHub"]):
            self.assertTrue(item["providerId"].startswith("ID_"))
            self.assertTrue(item["ip"].startswith("192.168.0."))

    def test_missing_file_explains_how_to_create(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError) as error:
                load_site(Path(directory) / "site.json")
        self.assertIn("site.example.json", str(error.exception))

    def test_rejects_public_ip_and_missing_remote(self):
        site = json.loads(EXAMPLE.read_text(encoding="utf-8"))
        site["irHub"]["ip"] = "8.8.8.8"
        with self.assertRaises(ValueError):
            validate_site(site)
        site = json.loads(EXAMPLE.read_text(encoding="utf-8"))
        del site["irRemotes"]["tv-quarto"]
        with self.assertRaises(ValueError):
            validate_site(site)


if __name__ == "__main__":
    unittest.main()

import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("generate-content-metadata.py")
spec = importlib.util.spec_from_file_location("metadata_generator", SCRIPT)
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


def make_zip(entries):
    target = io.BytesIO()
    with zipfile.ZipFile(target, "w") as archive:
        for name, payload in entries.items():
            archive.writestr(name, payload)
    return target.getvalue()


class Response(io.BytesIO):
    def geturl(self):
        return "https://release-assets.githubusercontent.com/package.zip"

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class MetadataTests(unittest.TestCase):
    def package(self):
        return {
            "id": "test-car",
            "name": "Test car",
            "type": "car",
            "version": "1.0.0",
            "required": False,
            "download": "https://github.com/AdriaVesseur/EC3/releases/download/test/test.zip",
            "description": "test",
            "changelog": ["test"],
        }

    def test_derives_install_folder_and_checksums_from_full_zip_paths(self):
        payload = b"car contents"
        contents = make_zip({
            "content/cars/test_car/data.acd": payload,
            "content/cars/test_car/ui/ui_car.json": b"{}",
        })
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(generator.urllib.request, "urlopen", return_value=Response(contents)):
                generator.generate(self.package(), Path(tmp))
            result = json.loads((Path(tmp) / "test-car-1.0.0.json").read_text())
        self.assertEqual(result["installPath"], "content/cars/test_car")
        self.assertEqual(result["size"], len(contents))
        self.assertEqual(result["sha256"], hashlib.sha256(contents).hexdigest())
        self.assertEqual(result["files"][0]["path"], "data.acd")
        self.assertEqual(result["files"][0]["archivePath"], "content/cars/test_car/data.acd")
        self.assertEqual(result["files"][0]["sha256"], hashlib.sha256(payload).hexdigest())

    def test_rejects_zip_slip_paths(self):
        contents = make_zip({"content/cars/test_car/../../evil.txt": b"bad"})
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(generator.urllib.request, "urlopen", return_value=Response(contents)):
                with self.assertRaisesRegex(ValueError, "Unsafe ZIP path"):
                    generator.generate(self.package(), Path(tmp))


if __name__ == "__main__":
    unittest.main()

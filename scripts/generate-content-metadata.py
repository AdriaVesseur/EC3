import hashlib
import json
import os
import re
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse


MAX_ARCHIVE = 2 * 1024**3
MAX_EXPANDED = 20 * 1024**3
MAX_FILES = 100_000
TYPE_ROOT = {
    "car": "content/cars",
    "track": "content/tracks",
    "app": "apps/python",
    "config": "extension/config",
}


def safe_path(value):
    path = PurePosixPath(value)
    if (
        not value
        or "\\" in value
        or path.is_absolute()
        or any(part in ("", ".", "..") for part in value.split("/"))
        or any(re.search(r'[<>:"|?*\x00-\x1f]', part) for part in path.parts)
        or any(part.endswith((".", " ")) for part in path.parts)
        or any(re.match(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", part, re.I) for part in path.parts)
    ):
        raise ValueError(f"Unsafe ZIP path: {value}")
    return "/".join(path.parts)


def digest_stream(stream):
    digest = hashlib.sha256()
    size = 0
    while chunk := stream.read(1024 * 1024):
        size += len(chunk)
        digest.update(chunk)
    return size, digest.hexdigest()


def generate(item, output_dir):
    if "REPLACE-ME" in item["download"]:
        print(f"Skipping placeholder {item['id']} (replace its release URL first)")
        return
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,63}", item["id"]):
        raise ValueError(f"Invalid package ID: {item['id']}")
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?", item["version"]):
        raise ValueError(f"Invalid version for {item['id']}")
    url = item["download"]
    repository = os.environ.get("GITHUB_REPOSITORY", "AdriaVesseur/EC3")
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.netloc != "github.com"
        or not parsed.path.startswith(f"/{repository}/releases/download/")
        or parsed.username
        or parsed.password
    ):
        raise ValueError(f"Untrusted release URL for {item['id']}")

    output = output_dir / f"{item['id']}-{item['version']}.json"
    if output.exists():
        print(f"Metadata already exists: {output}")
        return

    request = urllib.request.Request(url, headers={"User-Agent": "EC3-content-indexer/1.0"})
    archive_digest = hashlib.sha256()
    archive_size = 0
    fd, archive_name = tempfile.mkstemp()
    archive_path = Path(archive_name)
    with os.fdopen(fd, "wb") as archive:
        with urllib.request.urlopen(request, timeout=60) as response:
            final_host = urlparse(response.geturl()).hostname
            if final_host not in (
                "github.com",
                "release-assets.githubusercontent.com",
                "objects.githubusercontent.com",
            ):
                raise ValueError(f"Unexpected release download host: {final_host}")
            while chunk := response.read(1024 * 1024):
                archive_size += len(chunk)
                if archive_size > MAX_ARCHIVE:
                    raise ValueError(f"ZIP exceeds 2 GiB: {item['id']}")
                archive_digest.update(chunk)
                archive.write(chunk)
        archive.flush()
        if archive_size == 0:
            raise ValueError(f"Empty ZIP: {item['id']}")

    try:
        with zipfile.ZipFile(archive_path) as zf:
            entries = []
            names = set()
            expanded = 0
            for info in zf.infolist():
                if info.is_dir():
                    safe_path(info.filename.rstrip("/"))
                    continue
                name = safe_path(info.filename)
                if name.casefold() in names:
                    raise ValueError(f"Duplicate ZIP path: {name}")
                names.add(name.casefold())
                mode = info.external_attr >> 16
                if mode and (mode & 0o170000) not in (0, 0o100000):
                    raise ValueError(f"Link or special file is not allowed: {name}")
                expanded += info.file_size
                if len(entries) >= MAX_FILES or expanded > MAX_EXPANDED:
                    raise ValueError(f"ZIP has too many or too-large files: {item['id']}")
                entries.append((name, info))
            if not entries:
                raise ValueError(f"ZIP has no files: {item['id']}")

            expected_root = TYPE_ROOT[item["type"]]
            prefix = expected_root + "/"
            content_entries = [(name, info) for name, info in entries if name.startswith(prefix)]
            loose_entries = [(name, info) for name, info in entries if not name.startswith(prefix)]
            if not content_entries:
                raise ValueError(f"ZIP files must include paths under {prefix}<folder>/")
            allowed_docs = {"readme.txt", "readme.md", "license.txt", "license.md", "changelog.txt"}
            if any("/" in name or name.casefold() not in allowed_docs for name, _ in loose_entries):
                raise ValueError(f"Files outside {prefix}<folder>/ must be root-level README/license/changelog files")
            roots = {"/".join(name.split("/")[:3]) for name, _ in content_entries}
            if len(roots) != 1:
                raise ValueError("All ZIP files must belong to one car/track/app/config folder")
            install_path = roots.pop()
            files = []
            for name, info in entries:
                if name.startswith(install_path + "/"):
                    relative = name[len(install_path) + 1 :]
                elif ("/" not in name and name.casefold() in allowed_docs):
                    relative = name
                else:
                    raise ValueError(f"File is outside the package folder: {name}")
                if not relative:
                    raise ValueError(f"Invalid package file path: {name}")
                with zf.open(info) as stream:
                    size, sha = digest_stream(stream)
                if size != info.file_size:
                    raise ValueError(f"ZIP size mismatch: {name}")
                files.append({"path": relative, "archivePath": name, "size": size, "sha256": sha})
    finally:
        archive_path.unlink(missing_ok=True)

    metadata = {
        "id": item["id"],
        "version": item["version"],
        "installPath": install_path,
        "size": archive_size,
        "sha256": archive_digest.hexdigest(),
        "files": files,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {output} ({archive_size} bytes, {len(files)} files)")


def main():
    manifest_path = Path(sys.argv[1] if len(sys.argv) > 1 else "content-repository/manifest.json")
    output_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "content-repository/generated")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for item in manifest["content"]:
        generate(item, output_dir)


if __name__ == "__main__":
    main()

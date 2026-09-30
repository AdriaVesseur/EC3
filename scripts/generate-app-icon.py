"""Convert the existing transparent EC3 logo to a multi-resolution Windows icon.

Run from any directory with Python and Pillow: python scripts/generate-app-icon.py
"""

from pathlib import Path

from PIL import Image


root = Path(__file__).resolve().parent.parent
source = root / "public" / "images" / "logo-dark.png"
destination = root / "helper" / "Assets" / "ec3.ico"
sizes = (16, 20, 24, 32, 40, 48, 64, 128, 256)

with Image.open(source) as logo:
    logo = logo.convert("RGBA")
    alpha_bounds = logo.getchannel("A").getextrema()
    if alpha_bounds[0] != 0 or alpha_bounds[1] != 255:
        raise ValueError("The source must preserve the transparent EC3 logo.")
    scale = max(sizes) / max(logo.size)
    resized = logo.resize(
        (round(logo.width * scale), round(logo.height * scale)),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (max(sizes), max(sizes)), (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((canvas.width - resized.width) // 2, (canvas.height - resized.height) // 2),
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, format="ICO", sizes=[(size, size) for size in sizes])
    (root / "public" / "ec3.ico").write_bytes(destination.read_bytes())

print(f"Created {destination.relative_to(root)} from {source.relative_to(root)}.")
print("Icon sizes: " + ", ".join(f"{size}x{size}" for size in sizes))

#!/usr/bin/env python3
"""Regenera el manifiesto: python3 scripts/generate_game_manifest.py.

Solo se incluyen JPG válidos de las cuatro carpetas admitidas. Los retratos se
recortan a un cuadrado tomando la parte superior, sin cambiar la resolución.
Se publican archivos con nombres ASCII para servir también los originales cuyos
nombres no son UTF-8, sin modificar los archivos descargados.
"""

import json
import hashlib
import os
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError as exc:
    raise SystemExit("Falta Pillow: instala la dependencia con 'python3 -m pip install Pillow'.") from exc


ROOT = Path(__file__).resolve().parent.parent
PHOTO_ROOT = ROOT / "scrapping" / "fotos_congreso"
OUTPUT = ROOT / "game" / "photos.json"
PUBLISHED = ROOT / "game" / "photos"
LABELS = {"PP": "PP", "PSOE": "PSOE", "VOX": "Vox", "SUMAR": "Sumar"}
SOF = set(range(0xC0, 0xD0)) - {0xC4, 0xC8, 0xCC}


def valid_jpeg(path):
    """Comprueba marcadores, segmentos, dimensiones y fin de imagen JPEG."""
    try:
        data = path.read_bytes()
    except OSError:
        return False
    if not data.startswith(b"\xff\xd8"):
        return False
    pos = 2
    frame = scan = False
    in_scan = False
    while pos < len(data):
        if in_scan:
            marker_start = data.find(b"\xff", pos)
        else:
            if data[pos] != 0xFF:
                return False
            marker_start = pos
        if marker_start < 0:
            return False
        pos = marker_start + 1
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        if pos >= len(data):
            return False
        marker = data[pos]
        pos += 1
        if in_scan and (marker == 0 or 0xD0 <= marker <= 0xD7):
            continue
        in_scan = False
        if marker == 0xD9:
            return frame and scan
        if marker in (0, 0xD8) or 0xD0 <= marker <= 0xD7:
            return False
        if marker == 0x01:
            continue
        if pos + 2 > len(data):
            return False
        length = int.from_bytes(data[pos:pos + 2], "big")
        if length < 2 or pos + length > len(data):
            return False
        segment = data[pos + 2:pos + length]
        if marker in SOF:
            if len(segment) < 6 or not int.from_bytes(segment[1:3], "big") or not int.from_bytes(segment[3:5], "big"):
                return False
            if len(segment) != 6 + 3 * segment[5] or not segment[5]:
                return False
            frame = True
        elif marker == 0xDA:
            if not frame or len(segment) < 4 or not segment[0] or len(segment) != 4 + 2 * segment[0]:
                return False
            scan = True
            in_scan = True
        pos += length
    return False


def main():
    photos = []
    counts = {}
    root_resolved = PHOTO_ROOT.resolve(strict=True)
    for folder, label in LABELS.items():
        directory = PHOTO_ROOT / folder
        if directory.is_symlink() or not directory.is_dir() or not directory.resolve().is_relative_to(root_resolved):
            raise SystemExit(f"Carpeta no válida: {directory}")
        count = 0
        for path in directory.iterdir():
            if path.suffix.lower() != ".jpg" or path.is_symlink() or not path.is_file():
                continue
            if not path.resolve().is_relative_to(root_resolved) or not valid_jpeg(path):
                print(f"Excluida (ruta o JPEG inválido): {os.fsencode(path)!r}")
                continue
            # El nombre depende de la ruta original, no del orden de lectura.
            name = hashlib.sha256(os.fsencode(path.relative_to(PHOTO_ROOT))).hexdigest() + ".jpg"
            destination = PUBLISHED / folder / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            try:
                with Image.open(path) as original:
                    portrait = ImageOps.exif_transpose(original)
                    portrait.load()
                    width, height = portrait.size
                    if width < 80 or height < 80:
                        raise ValueError("imagen demasiado pequeña")
                    side = min(width, height)
                    left = (width - side) // 2
                    # Los retratos del Congreso sitúan la cabeza en la mitad superior.
                    top = 0 if height > width else (height - side) // 2
                    portrait = portrait.crop((left, top, left + side, top + side)).convert("RGB")
                    portrait.save(destination, "JPEG", quality=95, subsampling=0)
            except (OSError, ValueError) as exc:
                print(f"Excluida (no se pudo procesar): {os.fsencode(path)!r}: {exc}")
                continue
            src = destination.relative_to(ROOT).as_posix()
            photos.append({"src": src, "label": label})
            count += 1
        counts[label] = count
        if not count:
            raise SystemExit(f"No hay fotos válidas para {label}; no se ha generado el manifiesto.")
    photos.sort(key=lambda photo: photo["src"])
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"version": 1, "photos": photos}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for label, count in counts.items():
        print(f"{label}: {count}")
    print(f"Total: {len(photos)}; manifiesto: {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

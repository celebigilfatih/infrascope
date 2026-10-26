"""Read an uncompressed draw.io file into reviewable topology evidence; never write a DB."""
import argparse
import hashlib
import html
import json
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path


class Label(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, value):
        self.parts.append(value + " ")

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "div", "p"):
            self.parts.append("\n")


def label(value):
    parser = Label()
    parser.feed(html.unescape(value or ""))
    return [re.sub(r"\s+", " ", line).strip() for line in "".join(parser.parts).splitlines() if line.strip()]


def read(path):
    if path.stat().st_size > 256 * 1024 * 1024:
        raise ValueError("Drawing exceeds the 256 MiB review limit")
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    with path.open("rb") as stream:
        if b"<!DOCTYPE" in stream.read(16384).upper():
            raise ValueError("DTD declarations are not supported")
    root = ET.parse(path).getroot()
    pages = []
    for page in root.findall("diagram"):
        if page.find("mxGraphModel") is None:
            raise ValueError("Export uncompressed draw.io XML before importing")
        cells = []
        for element in page.iter("mxCell"):
            attrs = element.attrib
            geometry = element.find("mxGeometry")
            style = attrs.get("style", "")
            cells.append({
                **{key: attrs.get(key) for key in ("id", "parent", "source", "target", "vertex", "edge")},
                "lines": label(attrs.get("value", "")),
                "image": bool(re.search(r"(?:^|;)image=", style)),
                "style": re.sub(r"image=[^;]+", "image=[omitted]", style),
                "geometry": dict(geometry.attrib) if geometry is not None else {},
                "points": [dict(p.attrib) for p in geometry.iter("mxPoint")] if geometry is not None else [],
            })
        pages.append({"id": page.get("id"), "name": page.get("name"), "cells": cells})
    return {"fileName": path.name, "sha256": digest, "pages": pages}


def rect(cell):
    g = cell["geometry"]
    return [float(g.get(key, 0)) for key in ("x", "y", "width", "height")]


def pair_candidates(page):
    """Propose image/label pairs. Every proposal and its ambiguity remains in the output."""
    images = [cell for cell in page["cells"] if cell["image"] and cell["parent"] == "1"]
    candidates = []
    for cell in page["cells"]:
        text = " ".join(cell["lines"])
        if cell["parent"] != "1" or not text or text.startswith("%3C"):
            continue
        if re.search(r"\d+\.\d+\.\d+\.\d+/\d+", text):
            continue  # Network blocks/cloud labels are not individual devices.
        if not (re.search(r"\bIP\s*:", text, re.I) or re.search(r"Merkez-Switch|FORTIGATE|SW_[12] \(|PowerSTORE|VPLEX|UNITY|Tanımsız SW", text, re.I)):
            continue
        x, y, w, h = rect(cell)
        choices = []
        for image in images:
            ix, iy, iw, ih = rect(image)
            horizontal = abs((x + w / 2) - (ix + iw / 2))
            gap = max(y - (iy + ih), iy - (y + h), 0)
            if horizontal <= max(w, iw) / 2 and gap <= 110:
                score = horizontal + gap * 3 + abs((y + h / 2) - (iy + ih / 2)) * .35
                choices.append({"imageId": image["id"], "score": round(score, 3)})
        choices.sort(key=lambda item: (item["score"], item["imageId"]))
        candidates.append({"labelId": cell["id"], "lines": cell["lines"], "candidates": choices[:3]})
    return candidates


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("drawing", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    evidence = read(args.drawing)
    for page in evidence["pages"]:
        page["candidates"] = pair_candidates(page)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"sha256": evidence["sha256"], "pages": [{"name": p["name"], "cells": len(p["cells"]), "candidateLabels": len(p["candidates"])} for p in evidence["pages"]]}))

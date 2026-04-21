from __future__ import annotations

import json
import re
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import xlrd


SIZE_TOKENS = {
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "XXL",
    "XXXL",
    "3/4 ans",
    "5/6 ans",
}


@dataclass
class Header:
    size: str
    color: str


# Table de correspondance pour les couleurs
COLOR_MAP = {
    "NOI": "Noir",
    "BLU": "Bleu",
    "GRI": "Gris",
    "ROU": "Rouge",
    "BEIG": "Beige",
    "BLA": "Blanc",
    "BLANC": "Blanc",
    "BORD": "Bordeaux",
    "OCE": "Océan",
}

def normalize_text(value: object) -> str:
    text = str(value or "").replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip(" ,")
    parts = text.split()
    if parts and all(len(part) == 1 and part.isalpha() and part.isupper() for part in parts):
        text = text.replace(" ", "")
    return text

def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")

def looks_like_size_row(values: list[str]) -> bool:
    return sum(value in SIZE_TOKENS for value in values) >= 2

def has_numeric_cells(values: Iterable[object]) -> bool:
    for value in values:
        if value in ("", None):
            continue
        try:
            float(value)
        except (TypeError, ValueError):
            continue
        return True
    return False

def parse_float(value: object) -> float | None:
    if value in ("", None):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

def normalize_color(value: str) -> str:
    value = value.strip().upper()
    return COLOR_MAP.get(value, value.title())

def build_headers(sheet: xlrd.sheet.Sheet, size_row_idx: int, color_row_idx: int) -> dict[int, Header]:
    headers: dict[int, Header] = {}
    current_size = ""

    for col in range(1, sheet.ncols):
        size = normalize_text(sheet.cell_value(size_row_idx, col))
        color = normalize_text(sheet.cell_value(color_row_idx, col))

        if size:
            current_size = size

        if current_size and color:
            headers[col] = Header(size=current_size, color=normalize_color(color))

    return headers

def parse_product_name(row: list[str], previous_label: str | None) -> tuple[str | None, str | None]:
    first = row[0]
    second = row[1] if len(row) > 1 else ""

    if second and second not in SIZE_TOKENS:
        if first == "TOTAL":
            return second, previous_label
        if first and first.replace(" ", "").isalpha() and len(first) <= 12:
            return second, first.title()
        return second, previous_label

    if first and first not in SIZE_TOKENS:
        return first, previous_label

    return None, previous_label

def parse_sheet(sheet: xlrd.sheet.Sheet) -> list[dict[str, object]]:
    products: list[dict[str, object]] = []
    previous_label: str | None = None
    row = 0

    while row < sheet.nrows:
        current_row = [normalize_text(sheet.cell_value(row, col)) for col in range(sheet.ncols)]

        if current_row[0] and not looks_like_size_row(current_row):
            previous_label = (
                current_row[0].title()
                if current_row[0].replace(" ", "").isalpha() and current_row[0].isupper()
                else current_row[0]
            )

        name, category = parse_product_name(current_row, previous_label)
        next_row = (
            [normalize_text(sheet.cell_value(row + 1, col)) for col in range(sheet.ncols)]
            if row + 1 < sheet.nrows
            else []
        )

        if not name:
            row += 1
            continue

        size_row_idx = None
        if looks_like_size_row(current_row):
            size_row_idx = row
        elif next_row and looks_like_size_row(next_row):
            size_row_idx = row + 1

        if size_row_idx is None or size_row_idx + 1 >= sheet.nrows:
            row += 1
            continue

        headers = build_headers(sheet, size_row_idx, size_row_idx + 1)
        if not headers:
            row += 1
            continue

        variants: list[dict[str, object]] = []
        detail_map: dict[int, str] = {}
        cursor = size_row_idx + 2

        while cursor < sheet.nrows:
            cursor_values = [sheet.cell_value(cursor, col) for col in range(sheet.ncols)]
            normalized = [normalize_text(value) for value in cursor_values]

            maybe_name, _ = parse_product_name(normalized, previous_label)
            if cursor > size_row_idx + 2 and maybe_name and not has_numeric_cells(cursor_values):
                break

            if looks_like_size_row(normalized):
                break

            if has_numeric_cells(cursor_values):
                line_label = normalize_text(cursor_values[0]) or None
                for col, header in headers.items():
                    quantity = parse_float(cursor_values[col])
                    if quantity is None:
                        continue
                    variants.append(
                        {
                            "id": f"{slugify(name)}-{slugify(header.size)}-{slugify(header.color)}-{cursor + 1}-{col + 1}",
                            "size": header.size,
                            "color": header.color,
                            "detail": detail_map.get(col),
                            "quantity": int(quantity),
                            "threshold": 2,
                            "lineLabel": line_label,
                        }
                    )
            elif any(normalized[col] for col in headers):
                detail_map = {col: normalized[col] for col in headers if normalized[col]}

            cursor += 1

        if variants:
            products.append(
                {
                    "id": slugify(f"{category or 'stock'}-{name}"),
                    "name": name,
                    "category": category or "Stock",
                    "collection": previous_label if previous_label and previous_label != category else None,
                    "sourceSheet": sheet.name,
                    "variants": variants,
                }
            )

        row = max(cursor, row + 1)

    deduped: list[dict[str, object]] = []
    seen: set[str] = set()
    for product in products:
        product_id = str(product["id"])
        if product_id in seen:
            continue
        seen.add(product_id)
        deduped.append(product)
    return deduped


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: import_stock_xls.py <input.xls> <output.json>")
        return 1

    source = Path(sys.argv[1])
    target = Path(sys.argv[2])

    workbook = xlrd.open_workbook(source.as_posix())
    products: list[dict[str, object]] = []
    for sheet in workbook.sheets():
        products.extend(parse_sheet(sheet))

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "source": source.name,
        "products": products,
    }

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(products)} products to {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

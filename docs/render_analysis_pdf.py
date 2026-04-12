from pathlib import Path
import re
import zlib


BASE_DIR = Path(__file__).resolve().parent
SOURCE = BASE_DIR / "DORMITORY_SYSTEM_MODULE_ANALYSIS.md"
OUTPUT = BASE_DIR / "DORMITORY_SYSTEM_MODULE_ANALYSIS.pdf"

PAGE_WIDTH = 595
PAGE_HEIGHT = 842
LEFT_MARGIN = 50
TOP_MARGIN = 60
BOTTOM_MARGIN = 50
BODY_FONT_SIZE = 10
HEADING_FONT_SIZE = 14
SECTION_FONT_SIZE = 12
LINE_HEIGHT = 14
MAX_CHARS = 95


def escape_pdf_text(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )


def normalize_line(raw: str) -> tuple[str, str]:
    if raw.startswith("# "):
        return "title", raw[2:].strip()
    if raw.startswith("## "):
        return "section", raw[3:].strip()
    if raw.startswith("### "):
        return "subsection", raw[4:].strip()
    if re.match(r"^\d+\.\s", raw):
        return "section", raw.strip()
    if raw.startswith("- "):
        return "bullet", raw[2:].strip()
    return "body", raw.rstrip()


def wrap_text(text: str, width: int) -> list[str]:
    if not text:
        return [""]

    words = text.split()
    lines = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if len(candidate) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def build_layout(lines: list[str]) -> list[tuple[str, str]]:
    laid_out = []
    for raw in lines:
        kind, text = normalize_line(raw.rstrip("\n"))
        if kind in {"title", "section", "subsection"}:
            laid_out.append((kind, text))
            laid_out.append(("spacer", ""))
            continue
        if kind == "body" and text == "":
            laid_out.append(("spacer", ""))
            continue
        if kind == "bullet":
            wrapped = wrap_text(text, MAX_CHARS - 4)
            for index, entry in enumerate(wrapped):
                prefix = "- " if index == 0 else "  "
                laid_out.append(("body", f"{prefix}{entry}"))
            continue
        wrapped = wrap_text(text, MAX_CHARS)
        for entry in wrapped:
            laid_out.append(("body", entry))
    return laid_out


def paginate(items: list[tuple[str, str]]) -> list[list[tuple[str, str]]]:
    pages = []
    current_page = []
    y = PAGE_HEIGHT - TOP_MARGIN

    def item_height(kind: str) -> int:
        if kind == "title":
            return 22
        if kind == "section":
            return 18
        if kind == "subsection":
            return 16
        if kind == "spacer":
            return 8
        return LINE_HEIGHT

    for kind, text in items:
        needed = item_height(kind)
        if y - needed < BOTTOM_MARGIN:
            pages.append(current_page)
            current_page = []
            y = PAGE_HEIGHT - TOP_MARGIN
        current_page.append((kind, text))
        y -= needed

    if current_page:
        pages.append(current_page)
    return pages


def render_page_stream(page_items: list[tuple[str, str]]) -> bytes:
    commands = ["BT", f"/F1 {BODY_FONT_SIZE} Tf"]
    y = PAGE_HEIGHT - TOP_MARGIN

    for kind, text in page_items:
        if kind == "spacer":
            y -= 8
            continue

        if kind == "title":
            font = "F2"
            size = HEADING_FONT_SIZE
            y -= 2
        elif kind == "section":
            font = "F2"
            size = SECTION_FONT_SIZE
        elif kind == "subsection":
            font = "F2"
            size = BODY_FONT_SIZE + 1
        else:
            font = "F1"
            size = BODY_FONT_SIZE

        commands.append(f"/{font} {size} Tf")
        commands.append(f"1 0 0 1 {LEFT_MARGIN} {y} Tm")
        commands.append(f"({escape_pdf_text(text)}) Tj")

        if kind == "title":
            y -= 20
        elif kind == "section":
            y -= 18
        elif kind == "subsection":
            y -= 16
        else:
            y -= LINE_HEIGHT

    commands.append("ET")
    return "\n".join(commands).encode("latin-1", errors="replace")


def build_pdf(pages: list[list[tuple[str, str]]]) -> bytes:
    objects = []

    def add_object(data: bytes) -> int:
        objects.append(data)
        return len(objects)

    font_regular = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    font_bold = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

    page_ids = []
    content_ids = []
    pages_id_placeholder = None

    for page_items in pages:
        stream = render_page_stream(page_items)
        compressed = zlib.compress(stream)
        content_id = add_object(
            b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(compressed)
            + compressed
            + b"\nendstream"
        )
        content_ids.append(content_id)
        page_ids.append(None)

    pages_id_placeholder = add_object(b"")

    for index, content_id in enumerate(content_ids):
        page_obj = (
            f"<< /Type /Page /Parent {pages_id_placeholder} 0 R "
            f"/MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Resources << /Font << /F1 {font_regular} 0 R /F2 {font_bold} 0 R >> >> "
            f"/Contents {content_id} 0 R >>"
        ).encode("latin-1")
        page_ids[index] = add_object(page_obj)

    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[pages_id_placeholder - 1] = (
        f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>"
    ).encode("latin-1")

    catalog_id = add_object(f"<< /Type /Catalog /Pages {pages_id_placeholder} 0 R >>".encode("latin-1"))

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]

    for index, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("latin-1"))
        output.extend(obj)
        output.extend(b"\nendobj\n")

    xref_start = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    output.extend(b"0000000000 65535 f \n")

    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))

    output.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF\n"
        ).encode("latin-1")
    )
    return bytes(output)


def main() -> None:
    text = SOURCE.read_text(encoding="utf-8")
    layout = build_layout(text.splitlines())
    pages = paginate(layout)
    OUTPUT.write_bytes(build_pdf(pages))
    print(f"Created: {OUTPUT}")


if __name__ == "__main__":
    main()

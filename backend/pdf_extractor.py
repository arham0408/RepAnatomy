from typing import Dict, Any, List
import pymupdf as fitz

class PDFExtractionError(Exception):
    pass

def extract_text_from_pdf(pdf_bytes: bytes, max_pages: int = 50) -> Dict[str, Any]:
    """
    Extracts structured text page-by-page from a PDF using PyMuPDF.
    Preserves page numbers, reading order, decimal points, measurements, and negation.
    Detects scanned or image-only documents.
    """
    if not pdf_bytes or len(pdf_bytes) < 10:
        raise PDFExtractionError("The provided file is empty or too small to be a valid PDF.")

    if len(pdf_bytes) > 15 * 1024 * 1024:
        raise PDFExtractionError("PDF file exceeds the 15 MB processing limit.")

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise PDFExtractionError(f"Could not open or parse PDF document: {str(e)}")

    if doc.is_encrypted:
        raise PDFExtractionError("The uploaded PDF is encrypted or password-protected. Please provide an unencrypted report.")

    page_count = len(doc)
    if page_count == 0:
        doc.close()
        raise PDFExtractionError("The PDF document contains no pages.")

    pages_to_read = min(page_count, max_pages)
    pages_text: List[Dict[str, Any]] = []
    full_text_parts: List[str] = []
    total_text_length = 0

    for page_idx in range(pages_to_read):
        page = doc.load_page(page_idx)
        page_num = page_idx + 1
        # Extract text using blocks to preserve natural reading order
        blocks = page.get_text("blocks")
        # Sort blocks vertically, then horizontally
        blocks.sort(key=lambda b: (b[1], b[0]))

        page_str = ""
        for b in blocks:
            text_block = b[4].strip()
            if text_block:
                page_str += text_block + "\n"

        pages_text.append({
            "page": page_num,
            "text": page_str.strip(),
            "character_count": len(page_str.strip())
        })
        full_text_parts.append(page_str.strip())
        total_text_length += len(page_str.strip())

    doc.close()

    full_text = "\n\n".join(full_text_parts).strip()
    is_scanned = total_text_length < 50

    return {
        "full_text": full_text,
        "page_count": page_count,
        "pages": pages_text,
        "is_scanned": is_scanned,
        "needs_ocr": is_scanned,
        "truncated": page_count > max_pages,
    }

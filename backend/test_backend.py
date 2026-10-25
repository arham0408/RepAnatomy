import sys
import os
import pymupdf as fitz

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    print("Health check passed:", data)

def test_analyze_text():
    sample_text = """
ULTRASOUND ABDOMEN:
GALLBLADDER: Single 12 mm calculus noted in the gallbladder with posterior acoustic shadowing (cholelithiasis).
LIVER: Mild diffuse increase in echogenicity consistent with grade I hepatic steatosis (fatty liver).
KIDNEYS: Left and right kidneys are normal. No renal calculus or hydronephrosis.
"""
    res = client.post(
        "/api/reports/analyze",
        data={"text": sample_text, "language": "en"}
    )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert len(data["findings"]) >= 2
    # The same gallbladder finding may be labeled with any valid clinical term
    # ("gallbladder", "gallstones", or the clinical "cholelithiasis"), so match
    # across both term and condition rather than one brittle substring.
    labels = [
        (f.get("term", "") + " " + (f.get("condition") or "")).lower()
        for f in data["findings"]
    ]
    assert any(
        ("gall" in t) or ("cholelith" in t) for t in labels
    ), f"Gallbladder/cholelithiasis finding must be present; got labels: {labels}"
    print(f"Analyze text passed: {len(data['findings'])} findings extracted.")

def test_analyze_pdf_upload():
    # Create an in-memory PDF using PyMuPDF
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 100), "ULTRASOUND REPORT:\nGallbladder contains a 14 mm mobile calculus (cholelithiasis).\nNormal liver and kidneys.")
    pdf_bytes = doc.tobytes()
    doc.close()

    res = client.post(
        "/api/reports/analyze",
        files={"file": ("ultrasound_test.pdf", pdf_bytes, "application/pdf")},
        data={"language": "en"}
    )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert len(data["findings"]) >= 1
    print(f"PDF upload analysis passed: {len(data['findings'])} findings.")

def test_chat():
    res = client.post(
        "/api/chat",
        json={
            "question": "Can you show me the gallbladder and explain what gallstones are?",
            "report_context": "Gallbladder contains a 12 mm calculus.",
            "language": "en",
            "history": []
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert "gallbladder" in [t.lower() for t in data["mentioned_terms"]]
    assert data["navigation_intent"] is True
    print("Chat endpoint passed. Answer length:", len(data["answer"]))

if __name__ == "__main__":
    test_health()
    test_analyze_text()
    test_analyze_pdf_upload()
    test_chat()
    print("All backend tests completed successfully!")

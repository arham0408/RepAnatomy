import sys
import os
import time
import logging
from typing import Optional
from dotenv import load_dotenv

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

backend_env = os.path.join(backend_dir, ".env")
if os.path.exists(backend_env):
    load_dotenv(backend_env)
load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    from backend.models import (
        ReportAnalyzeResponse,
        MedicalFindingModel,
        AnatomicalMentionModel,
        ChatRequest,
        ChatResponse,
        HealthResponse,
    )
    from backend.pdf_extractor import extract_text_from_pdf, PDFExtractionError
    from backend.provider import MedicalAIProvider
except ImportError:
    from models import (
        ReportAnalyzeResponse,
        MedicalFindingModel,
        AnatomicalMentionModel,
        ChatRequest,
        ChatResponse,
        HealthResponse,
    )
    from pdf_extractor import extract_text_from_pdf, PDFExtractionError
    from provider import MedicalAIProvider

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sehatsetu.server")

app = FastAPI(
    title="SehatSetu Medical Report Explorer API",
    version="1.0.0",
    description="Backend API for medical report extraction and 3D anatomy mapping",
)

# Configure CORS
origins = [
    "http://localhost:3016",
    "http://127.0.0.1:3016",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Development safe
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

provider = MedicalAIProvider()

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        provider="groq" if provider.is_configured() else "deterministic_local",
        model=provider.model,
        groq_api_key_configured=provider.is_configured(),
        version="1.0.0",
    )

@app.post("/api/reports/analyze")
async def analyze_report(
    request: Request,
    file: Optional[UploadFile] = File(None),
    text: Optional[str] = Form(None),
    language: str = Form("en"),
):
    start_time = time.time()
    filename = "report.txt"
    report_text = ""
    page_count = 1

    # Check if request was sent as JSON instead of multipart
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            report_text = body.get("text", "")
            language = body.get("language", "en")
            filename = body.get("filename", "report.txt")
        except Exception:
            pass

    if file:
        filename = file.filename or "uploaded_report.pdf"
        file_bytes = await file.read()
        if len(file_bytes) == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        if not filename.lower().endswith(".pdf"):
            # Plain text file or similar
            try:
                report_text = file_bytes.decode("utf-8", errors="ignore")
            except Exception:
                raise HTTPException(status_code=400, detail="Only PDF or plain-text medical reports are supported.")
        else:
            try:
                extraction = extract_text_from_pdf(file_bytes)
                report_text = extraction["full_text"]
                page_count = extraction["page_count"]
                if extraction["is_scanned"]:
                    logger.warning("Scanned or image-only PDF uploaded: %s", filename)
            except PDFExtractionError as e:
                raise HTTPException(status_code=400, detail=str(e))
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Unexpected error processing PDF: {str(e)}")

    elif text and text.strip():
        report_text = text.strip()
    elif not report_text:
        raise HTTPException(status_code=400, detail="Please provide either a PDF file or clinical report text.")

    if len(report_text.strip()) < 10:
        raise HTTPException(
            status_code=400,
            detail="The extracted text contains insufficient readable medical information. If this is a scanned document, please paste the report text directly.",
        )

    # Call AI provider
    try:
        raw_result = await provider.extract_findings(report_text, language=language)
    except Exception as e:
        logger.error("AI provider error during extraction: %s", str(e))
        raw_result = provider._extract_findings_deterministic(report_text, language=language)

    findings_list = []
    for f in raw_result.get("findings", []):
        mentions = []
        for m in f.get("anatomical_mentions", []):
            mentions.append(
                AnatomicalMentionModel(
                    term=m.get("term", ""),
                    laterality=m.get("laterality", "unspecified"),
                    catalogue_mapping_status=m.get("catalogue_mapping_status", "verified"),
                    suggested_target=m.get("suggested_target"),
                )
            )

        findings_list.append(
            MedicalFindingModel(
                finding_id=f.get("finding_id", f"f-{len(findings_list)+1}"),
                term=f.get("term", ""),
                report_phrase=f.get("report_phrase", ""),
                condition=f.get("condition"),
                observation=f.get("observation", f.get("report_phrase", "")),
                anatomical_location=f.get("anatomical_location"),
                laterality=f.get("laterality", "unspecified"),
                negation=f.get("negation", "present"),
                certainty=f.get("certainty", "confirmed"),
                temporal_context=f.get("temporal_context", "current"),
                measurement=f.get("measurement"),
                source=f.get("source", {"page": 1, "evidence_text": f.get("report_phrase", "")}),
                explanation=f.get("explanation", ""),
                anatomical_mentions=mentions,
                warnings=f.get("warnings", []),
            )
        )

    duration = time.time() - start_time
    logger.info("Successfully analyzed report '%s' (%d findings) in %.2fs", filename, len(findings_list), duration)

    return ReportAnalyzeResponse(
        report_id=f"rep-{int(time.time()*1000)}",
        filename=filename,
        extracted_text=report_text,
        page_count=page_count,
        summary=raw_result.get("summary", f"Extracted {len(findings_list)} clinical observations from report."),
        findings=findings_list,
        unmapped_terms=raw_result.get("unmapped_terms", []),
        disclaimer="Educational Disclaimer: This visualization is for anatomical understanding and terminology reference only. It is not an autonomous diagnostic report. Consult your doctor.",
        created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        provider="groq" if provider.is_configured() else "deterministic_local",
        model=provider.model,
    )

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    history_dicts = [{"sender": m.sender, "text": m.text} for m in request.history]
    return await provider.answer_chat(
        question=request.question,
        report_context=request.report_context or "",
        language=request.language or "en",
        history=history_dicts,
        selected_organ=request.selected_organ,
        current_finding=request.current_finding,
        context_type=request.context_type,
        response_language=request.response_language,
        preferred_language=request.preferred_language,
        finding_term=request.finding_term,
        finding_evidence=request.finding_evidence,
        finding_condition=request.finding_condition,
        finding_certainty=request.finding_certainty,
        finding_measurement=request.finding_measurement,
        finding_page=request.finding_page,
        verified_structure_ids=request.verified_structure_ids,
        structure_id=request.structure_id,
        structure_name=request.structure_name,
        structure_aliases=request.structure_aliases,
        structure_description=request.structure_description,
    )

from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field

class AnatomicalMentionModel(BaseModel):
    term: str
    laterality: Literal["left", "right", "bilateral", "unspecified"] = "unspecified"
    catalogue_mapping_status: Literal["verified", "condition_associated", "unresolved"] = "unresolved"
    suggested_target: Optional[str] = None

class MedicalFindingModel(BaseModel):
    finding_id: str
    term: str
    report_phrase: str
    condition: Optional[str] = None
    observation: str
    anatomical_location: Optional[str] = None
    laterality: Literal["left", "right", "bilateral", "unspecified"] = "unspecified"
    negation: Literal["present", "absent", "ruled_out"] = "present"
    certainty: Literal["confirmed", "suspected", "possible", "indeterminate", "not_stated"] = "confirmed"
    temporal_context: Literal["current", "historical", "comparison"] = "current"
    measurement: Optional[Dict[str, Any]] = None
    source: Dict[str, Any] = Field(default_factory=lambda: {"page": 1, "evidence_text": ""})
    explanation: str
    anatomical_mentions: List[AnatomicalMentionModel] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

class ReportAnalyzeResponse(BaseModel):
    report_id: str
    filename: str
    extracted_text: str
    page_count: int
    summary: str
    findings: List[MedicalFindingModel]
    unmapped_terms: List[str] = Field(default_factory=list)
    disclaimer: str
    created_at: str
    provider: str
    model: str

class ChatMessageItem(BaseModel):
    sender: Literal["user", "assistant", "system"]
    text: str

class ChatRequest(BaseModel):
    question: str
    report_context: Optional[str] = ""
    language: str = "en"
    history: List[ChatMessageItem] = Field(default_factory=list)
    selected_organ: Optional[str] = None
    current_finding: Optional[str] = None
    session_id: Optional[str] = None
    # Scoped-chat contract (contextType: report | finding | structure | location)
    context_type: Optional[str] = None
    preferred_language: Optional[str] = None
    response_language: Optional[str] = None
    finding_id: Optional[str] = None
    finding_term: Optional[str] = None
    finding_evidence: Optional[str] = None
    finding_condition: Optional[str] = None
    finding_certainty: Optional[str] = None
    finding_measurement: Optional[str] = None
    finding_page: Optional[int] = None
    verified_structure_ids: Optional[List[str]] = None
    structure_id: Optional[str] = None
    structure_name: Optional[str] = None
    structure_aliases: Optional[List[str]] = None
    structure_description: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    mentioned_terms: List[str] = Field(default_factory=list)
    navigation_intent: bool = False
    warnings: List[str] = Field(default_factory=list)
    response_language: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    provider: str
    model: str
    groq_api_key_configured: bool
    version: str

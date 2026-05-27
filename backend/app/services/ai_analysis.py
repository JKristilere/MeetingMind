"""
AI analysis service — extracts structured intelligence from meeting transcripts.

Providers (set via LLM_PROVIDER env var):
  groq        — FREE, Llama 3.3-70B via Groq API. Best for free deployment.
  ollama      — Local Ollama. Docker/VPS only.
  anthropic   — Claude Sonnet. Highest quality. ~$0.02/meeting.
  openai      — GPT-4o. Paid.
  azure_openai— Azure OpenAI. Paid.

The prompt is tuned for African business context:
  - Nigerian English idioms and expressions
  - Pidgin code-switching
  - Local business norms (consensus-building, respect hierarchy)
"""
import json
from dataclasses import dataclass, field

from app.config import settings


SYSTEM_PROMPT = """You are MeetingMind, an AI assistant specialised in analysing business meetings for African SMBs — particularly Nigerian companies.

You understand:
- Nigerian business English, Pidgin phrases, and code-switching between English and Yoruba/Igbo/Hausa
- Nigerian business culture: relationship-building, seniority respect, consensus decisions
- Common African SMB contexts: trading, fintech, logistics, fashion, food, agriculture, tech

When analysing transcripts, extract structured data accurately. Return ONLY valid JSON."""


ANALYSIS_PROMPT = """Analyse this meeting transcript and extract the following as JSON.

Transcript:
{transcript}

Return a JSON object with these exact keys:
{{
  "summary": "2-4 sentence executive summary of the meeting",
  "key_decisions": [
    {{"decision": "what was decided", "context": "why", "decided_by": "name or role if mentioned"}}
  ],
  "action_items": [
    {{
      "title": "clear action description",
      "assignee": "name of person responsible (or null)",
      "due_date": "ISO 8601 date string or null",
      "priority": "high|medium|low",
      "description": "additional context"
    }}
  ],
  "topics_discussed": ["topic 1", "topic 2"],
  "next_steps": ["step 1", "step 2"],
  "sentiment": "positive|neutral|negative|mixed",
  "meeting_effectiveness_score": 7.5,
  "participants_mentioned": ["name1", "name2"],
  "follow_up_date": "ISO 8601 date string or null"
}}

meeting_effectiveness_score is 1-10 based on: clear agenda, decisions made, action items assigned, time management.
Be accurate to what was said. Do not invent action items not mentioned."""


@dataclass
class AnalysisResult:
    summary: str
    key_decisions: list[dict] = field(default_factory=list)
    action_items: list[dict] = field(default_factory=list)
    topics_discussed: list[str] = field(default_factory=list)
    next_steps: list[str] = field(default_factory=list)
    sentiment: str = "neutral"
    meeting_effectiveness_score: float = 5.0
    participants_mentioned: list[str] = field(default_factory=list)
    follow_up_date: str | None = None


class GroqAnalysisService:
    """
    Groq API — free tier with Llama 3.3-70B.
    Extremely fast inference (tokens/sec much faster than OpenAI).
    Sign up free at console.groq.com — no credit card needed.
    """

    def analyse(self, transcript: str) -> AnalysisResult:
        from groq import Groq
        client = Groq(api_key=settings.groq_api_key)
        response = client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": ANALYSIS_PROMPT.format(transcript=transcript[:12000])},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
        )
        return _parse_response(response.choices[0].message.content)


class AnthropicAnalysisService:
    def analyse(self, transcript: str) -> AnalysisResult:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": ANALYSIS_PROMPT.format(transcript=transcript[:12000])}],
        )
        return _parse_response(response.content[0].text)


class OpenAIAnalysisService:
    def analyse(self, transcript: str) -> AnalysisResult:
        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": ANALYSIS_PROMPT.format(transcript=transcript[:12000])},
            ],
            response_format={"type": "json_object"},
        )
        return _parse_response(response.choices[0].message.content)


class OllamaAnalysisService:
    def analyse(self, transcript: str) -> AnalysisResult:
        import ollama
        client = ollama.Client(host=settings.ollama_base_url)
        response = client.chat(
            model=settings.ollama_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": ANALYSIS_PROMPT.format(transcript=transcript[:8000])},
            ],
            format="json",
        )
        return _parse_response(response["message"]["content"])


class AzureOpenAIAnalysisService:
    def analyse(self, transcript: str) -> AnalysisResult:
        from openai import AzureOpenAI
        client = AzureOpenAI(
            api_key=settings.azure_openai_key,
            azure_endpoint=settings.azure_openai_endpoint,
            api_version="2024-10-21",
        )
        response = client.chat.completions.create(
            model=settings.azure_openai_deployment,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": ANALYSIS_PROMPT.format(transcript=transcript[:12000])},
            ],
            response_format={"type": "json_object"},
        )
        return _parse_response(response.choices[0].message.content)


def _parse_response(raw: str) -> AnalysisResult:
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        data = json.loads(raw[start:end])
        return AnalysisResult(
            summary=data.get("summary", ""),
            key_decisions=data.get("key_decisions", []),
            action_items=data.get("action_items", []),
            topics_discussed=data.get("topics_discussed", []),
            next_steps=data.get("next_steps", []),
            sentiment=data.get("sentiment", "neutral"),
            meeting_effectiveness_score=float(data.get("meeting_effectiveness_score", 5.0)),
            participants_mentioned=data.get("participants_mentioned", []),
            follow_up_date=data.get("follow_up_date"),
        )
    except (json.JSONDecodeError, ValueError, KeyError):
        return AnalysisResult(summary="Analysis failed — could not parse AI response.")


def get_analysis_service():
    providers = {
        "groq": GroqAnalysisService,
        "anthropic": AnthropicAnalysisService,
        "openai": OpenAIAnalysisService,
        "azure_openai": AzureOpenAIAnalysisService,
        "ollama": OllamaAnalysisService,
    }
    cls = providers.get(settings.llm_provider, OllamaAnalysisService)
    return cls()

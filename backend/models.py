from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field

trans_langs = Literal[
    "bn-IN",  # Bengali
    "en-IN",  # English
    "gu-IN",  # Gujarati
    "hi-IN",  # Hindi
    "kn-IN",  # Kannada
    "ml-IN",  # Malayalam
    "mr-IN",  # Marathi
    "od-IN",  # Odia
    "pa-IN",  # Punjabi
    "ta-IN",  # Tamil
    "te-IN",  # Telugu
    # Newly added
    "as-IN",  # Assamese
    "brx-IN",  # Bodo
    "doi-IN",  # Dogri
    "kok-IN",  # Konkani
    "ks-IN",  # Kashmiri
    "mai-IN",  # Maithili
    "mni-IN",  # Manipuri (Meiteilon)
    "ne-IN",  # Nepali
    "sa-IN",  # Sanskrit
    "sat-IN",  # Santali
    "sd-IN",  # Sindhi
    "ur-IN",  # Urdu
]


class DetectionRequest(BaseModel):
    input: str


class TextToSpeechRequest(BaseModel):
    text: str
    speaker: Literal[
        "abhilash", "anushka", "arya", "hitesh", "karun", "manisha", "vidya"
    ] = "anushka"
    pace: Annotated[float, Field(strict=True, ge=0.3, le=3)] = 1.0


class TranslationRequest(BaseModel):
    input: str
    source_language_code: str = "auto"
    target_language_code: trans_langs
    speaker_gender: Literal["Male", "Female"] | None = "Male"


class ChatContext(BaseModel):
    text: str | None = None
    image_urls: list[str] | None = None


class ChatRequest(BaseModel):
    message: str
    context: ChatContext | None = None
    model: str = "sarvam-m"
    temperature: float = 0.5
    top_p: float = 1.0
    max_tokens: int = 1000


class SummarizeRequest(BaseModel):
    content: str  # Raw input text to summarize
    mode: Literal["normal", "concise", "explanatory", "formal"] = "normal"
    temperature: float = 0.5
    max_tokens: int = 1000

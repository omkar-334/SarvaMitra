from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from client import sarvam_post
from models import (
    ChatRequest,
    DetectionRequest,
    SummarizeRequest,
    TextToSpeechRequest,
    TranslationRequest,
)
from prompts import PROMPT_TEMPLATES

load_dotenv()

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
if not SARVAM_API_KEY:
    raise RuntimeError("SARVAM_API_KEY is not set in the environment")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or restrict to your extension origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------
# TEXT TO SPEECH
# -----------------------------
@app.post("/tts")
async def text_to_speech(req: TextToSpeechRequest):
    return await sarvam_post(
        "https://api.sarvam.ai/text-to-speech",
        req.model_dump(),
        key_type="subscription",
    )


# -----------------------------
# TRANSLATION
# -----------------------------
@app.post("/translate")
async def translate(req: TranslationRequest) -> dict:
    return await sarvam_post(
        "https://api.sarvam.ai/translate",
        req.model_dump(),
        key_type="subscription",
    )


# -----------------------------
# CHAT COMPLETION
# -----------------------------
@app.post("/chat")
async def chat(req: ChatRequest) -> dict:
    payload = req.model_dump(exclude={"message"})
    payload["messages"] = [{"role": "user", "content": req.message}]

    return await sarvam_post(
        "https://api.sarvam.ai/v1/chat/completions",
        payload,
        key_type="bearer",
    )


# -----------------------------
# SUMMARIZE WITH MODE
# -----------------------------
@app.post("/summarize")
async def summarize(req: SummarizeRequest) -> dict:
    mode_prompt = PROMPT_TEMPLATES.get(req.mode.lower(), PROMPT_TEMPLATES["normal"])
    full_prompt = f"{mode_prompt}\n\n{req.content}"

    return await chat(ChatRequest(message=full_prompt))


@app.post("/detect")
async def detect_language(request: DetectionRequest):
    payload = {"input": request.input}
    response = await sarvam_post(
        "https://api.sarvam.ai/text-lid", payload, key_type="subscription"
    )
    return response

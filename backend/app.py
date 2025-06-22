from __future__ import annotations

import asyncio
import os
from typing import Annotated, Literal

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from client import post
from models import (
    ChatRequest,
    DetectionRequest,
    SummarizeRequest,
    TextToSpeechRequest,
    TranslationRequest,
)
from utils import (
    PROMPT_TEMPLATES,
    extract_ocr,
    load_ocr_store,
    parse_context,
    save_ocr_store,
)

load_dotenv()

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
IMAGE_JSON_PATH = "images.json"

if not SARVAM_API_KEY or not MISTRAL_API_KEY:
    raise RuntimeError("API KEYs are not set in the environment")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or restrict to your extension origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# health check endpoint
@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok"}


@app.post("/detect")
async def detect_language(request: DetectionRequest) -> dict:
    payload = {"input": request.input}
    response = await post(
        "https://api.sarvam.ai/text-lid", payload, key_type="subscription"
    )
    return response


# -----------------------------
# TEXT TO SPEECH
# -----------------------------
@app.post("/tts")
async def text_to_speech(req: TextToSpeechRequest) -> dict:
    req_dict = req.model_dump()
    detect_obj = await detect_language(DetectionRequest(input=req_dict["text"]))
    req_dict["target_language_code"] = detect_obj["language_code"]
    return await post(
        "https://api.sarvam.ai/text-to-speech",
        req_dict,
        key_type="subscription",
    )


# -----------------------------
# TRANSLATION
# -----------------------------
@app.post("/translate")
async def translate(req: TranslationRequest) -> dict:
    # req_dict = req.model_dump()
    # detect_obj = await detect_language(DetectionRequest(input=req_dict["input"]))
    # req_dict["source_language_code"] = detect_obj["language_code"]
    return await post(
        "https://api.sarvam.ai/translate",
        req.model_dump(),
        key_type="subscription",
    )


# -----------------------------
# CHAT COMPLETION
# -----------------------------
@app.post("/chat")
async def chat(req: ChatRequest) -> dict:
    user_prompt = ""
    if req.context:
        user_prompt += parse_context(req.context) + "\n\n"

    user_prompt += req.message
    print(user_prompt)
    payload = req.model_dump(exclude={"message"})
    payload["messages"] = [{"role": "user", "content": user_prompt}]

    return await post(
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


# -----------------------------
# SPEECH TO TEXT
# -----------------------------
@app.post("/stt")
async def speech_to_text(
    file: Annotated[UploadFile, File()],
    model: Annotated[str, Form()] = "saarika:v2.5",
    language_code: Literal[
        "unknown",
        "hi-IN",
        "bn-IN",
        "kn-IN",
        "ml-IN",
        "mr-IN",
        "od-IN",
        "pa-IN",
        "ta-IN",
        "te-IN",
        "en-IN",
    ] = "unknown",
) -> dict:
    form_data = {"model": model, "language_code": language_code}
    files = {"file": (file.filename, await file.read(), file.content_type)}

    return await post(
        "https://api.sarvam.ai/speech-to-text",
        files=files,
        form_data=form_data,
        key_type="subscription",
    )


# -------------------------
# Endpoint
# -------------------------
@app.post("/image_ocr")
async def image_ocr(image_url: str) -> str:
    payload = {
        "model": "mistral-ocr-latest",
        "document": {"type": "image_url", "image_url": image_url},
    }

    # Use the shared post function
    ocr_result = await post(
        "https://api.mistral.ai/v1/ocr", payload=payload, key_type="bearer"
    )
    ocr_result = extract_ocr(ocr_result)
    return ocr_result


@app.post("/image_vlm")
async def image_vlm(image_url: str) -> str:
    payload = {
        "model": "pixtral-12b-latest",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Describe the image in detail. "
                            "Include people, objects, scene, and any relevant context."
                        ),
                    },
                    {"type": "image_url", "image_url": image_url},
                ],
            }
        ],
        "max_tokens": 300,
    }

    result = await post(
        "https://api.mistral.ai/v1/chat/completions", payload=payload, key_type="bearer"
    )
    return result["response"]


@app.post("/image")
async def analyze_image(image_url: str, store: dict = None) -> dict:
    if not store:
        store = load_ocr_store()
    if image_url in store:
        return store[image_url]

    vlm_result = await image_vlm(image_url)
    result = {"vlm": vlm_result}
    print(result)
    store[image_url] = result
    return result


async def background_image_batch(urls: list[str], max_concurrent: int = 5) -> None:
    sem = asyncio.Semaphore(max_concurrent)
    store = load_ocr_store()

    async def sem_task(url: str) -> None:
        async with sem:
            await analyze_image(url, store)

    await asyncio.gather(*(sem_task(url) for url in urls))
    save_ocr_store(store)


def run_async_batch(urls: list[str]) -> None:
    asyncio.run(background_image_batch(urls))


@app.post("/batch/image")
async def batch_image_analyze(
    urls: list[str], background_tasks: BackgroundTasks
) -> dict:
    # Queue this for background execution after returning response
    background_tasks.add_task(run_async_batch, urls)
    return {"status": "running"}

from __future__ import annotations

import json
import os

from models import ChatContext

IMAGE_JSON_PATH = "images.json"

PROMPT_TEMPLATES = {
    "normal": """Please provide a balanced summary of the following text. Include the main points and key supporting details while maintaining the original tone and context.""",
    "concise": """Create a brief, focused summary of the following text. Extract only the most essential points and core message. Keep it tight and direct.""",
    "explanatory": "Summarize the following text while adding context and clarification where needed. Explain any complex concepts, define technical terms, and provide background information that would help someone unfamiliar with the topic understand the content fully. Include examples or analogies if they help clarify the main points.",
    "formal": "Provide a structured, professional summary of the following text. Use formal language, organize information hierarchically with clear topic divisions, and maintain an objective, academic tone. Present the information in a way suitable for business reports, academic papers, or official documentation",
}


def extract(api_response: dict) -> dict:
    try:
        content = api_response["choices"][0]["message"]["content"]
        return {"response": content}  # noqa: TRY300
    except (KeyError, IndexError) as e:
        return {"response": f"Error parsing response: {e!s}"}


def load_ocr_store() -> dict[str, dict]:
    if os.path.exists(IMAGE_JSON_PATH):
        with open(IMAGE_JSON_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_ocr_store(data: dict[str, dict]) -> None:
    with open(IMAGE_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def extract_ocr(ocr_response: dict) -> str:
    pages = ocr_response.get("pages", [])
    markdown_parts = [page.get("markdown", "") for page in pages]
    return "\n\n".join(markdown_parts)


def parse_context(context: ChatContext) -> str:
    """
    Combines user-selected text with image descriptions from cache.
    """
    image_store = load_ocr_store()
    parts = []

    # Add text if available
    if context.text:
        parts.append(f"[User-selected Text]:\n{context.text}")

    # Add VLM descriptions if available
    if context.image_urls:
        descriptions = []
        for url in context.image_urls:
            entry = image_store.get(url, {})
            vlm_description = entry.get("vlm")
            if vlm_description:
                descriptions.append(f"- {vlm_description}")
        if descriptions:
            parts.append("[Image Descriptions]:\n" + "\n".join(descriptions))

    return "\n\n".join(parts).strip()

import os

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

# Load environment variables FIRST
load_dotenv()

# Then get the API key
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")

# Add validation to ensure the key is loaded
if not SARVAM_API_KEY:
    raise RuntimeError("SARVAM_API_KEY is not set in the environment variables")


def extract(api_response: dict) -> dict:
    try:
        content = api_response["choices"][0]["message"]["content"]
        return {"response": content}  # noqa: TRY300
    except (KeyError, IndexError) as e:
        return {"response": f"Error parsing response: {e!s}"}


async def post(
    url: str,
    payload: dict = None,
    key_type: str = "bearer",
    files: dict = None,
    form_data: dict = None,
) -> dict:
    headers = {}
    api_key = SARVAM_API_KEY if "sarvam" in url else MISTRAL_API_KEY

    if files:
        headers["api-subscription-key"] = api_key
    elif key_type == "bearer":
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
    else:
        headers = {
            "api-subscription-key": api_key,
            "Content-Type": "application/json",
        }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                url,
                headers=headers,
                json=payload if not files else None,
                data=form_data,
                files=files,
            )
            response.raise_for_status()
            if "chat" in url:
                # For chat completions, we need to extract the assistant's message
                return extract(response.json())
            return response.json()

    except httpx.HTTPStatusError as e:
        raise HTTPException(  # noqa: B904
            status_code=e.response.status_code,
            detail=f"Sarvam API error: {e.response.text}",
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Request error: {e!s}")  # noqa: B904
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e!s}")  # noqa: B904

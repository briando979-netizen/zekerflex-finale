"""LLM-abstractie: Ollama lokaal, of een API wanneer een sleutel gezet is.

`complete()` geeft platte tekst terug.
`complete_json()` dwingt een JSON-object af (met reparatie-pogingen).
"""
from __future__ import annotations

import json
import os
import re
import urllib.request

from .config import CAPS

_TIMEOUT = int(os.environ.get("STUDIO_LLM_TIMEOUT", "600"))


def _post(url: str, payload: dict, headers: dict | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def complete(system: str, user: str, *, json_mode: bool = False, max_tokens: int = 1200, temperature: float = 0.7) -> str:
    backend = CAPS.llm_backend
    if backend == "anthropic":
        return _anthropic(system, user, max_tokens, temperature)
    if backend == "openai":
        return _openai(system, user, json_mode, max_tokens, temperature)
    return _ollama(system, user, json_mode, max_tokens, temperature)


def complete_json(system: str, user: str, *, max_tokens: int = 1600, temperature: float = 0.5) -> dict:
    raw = complete(system + "\n\nAntwoord UITSLUITEND met één geldig JSON-object, zonder codeblok.",
                   user, json_mode=True, max_tokens=max_tokens, temperature=temperature)
    return _parse_json(raw)


# ---- backends ---------------------------------------------------------------
def _ollama(system: str, user: str, json_mode: bool, max_tokens: int, temperature: float) -> str:
    url = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/") + "/api/chat"
    payload = {
        "model": CAPS.llm_model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    if json_mode:
        payload["format"] = "json"
    return _post(url, payload)["message"]["content"]


def _openai(system: str, user: str, json_mode: bool, max_tokens: int, temperature: float) -> str:
    base = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    key = os.environ["OPENAI_API_KEY"]
    payload = {
        "model": CAPS.llm_model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    out = _post(base + "/chat/completions", payload, {"Authorization": f"Bearer {key}"})
    return out["choices"][0]["message"]["content"]


def _anthropic(system: str, user: str, max_tokens: int, temperature: float) -> str:
    key = os.environ["ANTHROPIC_API_KEY"]
    payload = {
        "model": CAPS.llm_model,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    out = _post("https://api.anthropic.com/v1/messages", payload,
                {"x-api-key": key, "anthropic-version": "2023-06-01"})
    return "".join(b.get("text", "") for b in out["content"])


# ---- json-reparatie --------------------------------------------------------
def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I | re.M).strip()
    try:
        return json.loads(raw)
    except Exception:
        pass
    m = re.search(r"\{.*\}", raw, flags=re.S)
    if m:
        chunk = m.group(0)
        for fix in (chunk, re.sub(r",\s*([}\]])", r"\1", chunk)):
            try:
                return json.loads(fix)
            except Exception:
                continue
    raise ValueError(f"LLM gaf geen geldige JSON terug:\n{raw[:500]}")

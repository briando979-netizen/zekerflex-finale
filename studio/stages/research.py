"""Stage 2 — kort onderzoek naar het onderwerp (LLM-kennis, geen web)."""
from __future__ import annotations

from ..llm import complete
from ..models import Brief

_SYS = """Je bent researcher voor een videoproductie. Vat het onderwerp bondig samen:
- 4 tot 6 kernfeiten of ideeën die het verhaal dragen
- 1 verrassend detail
- de emotionele kern (waarom raakt dit de kijker?)
Schrijf in het Nederlands, korte bullets, geen inleiding. Verzin geen exacte cijfers die je niet zeker weet."""


def run(brief: Brief) -> str:
    return complete(
        _SYS,
        f"Onderwerp: {brief.subject}\nDoelgroep: {brief.audience}\nToon: {brief.mood}, stijl {brief.style}.",
        max_tokens=500, temperature=0.6,
    ).strip()

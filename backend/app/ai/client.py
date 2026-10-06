"""AI abstraction layer.

The AI ASSISTS only: it recommends, ranks, and explains. It can never mutate
the database, approve bookings, bypass RLS/authorization, or override the
deterministic engines. Every AI output is validated; any failure (timeout,
bad JSON, missing key, rate limit) falls back to deterministic behavior and
the application keeps working.
"""
from __future__ import annotations
import json
import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import get_settings
from app.utils.http import http_client

log = logging.getLogger(__name__)


@dataclass
class AIRecommendation:
    title: str
    description: str
    category: str = ""
    estimated_cost: float | None = None
    score: float = 0.0


@dataclass
class AIRankedOption:
    option_id: str
    rank: int
    reason: str


class AIClient:
    """Provider-agnostic client. Configure via AI_PROVIDER / AI_API_KEY."""

    def __init__(self):
        s = get_settings()
        self.provider = (s.ai_provider or "none").lower()
        self.api_key = s.ai_api_key
        self.model = s.ai_model
        self.base_url = s.ai_base_url.rstrip("/")
        self.timeout = s.ai_timeout_seconds

    @property
    def enabled(self) -> bool:
        return self.provider != "none" and bool(self.api_key)

    # ------------------------------------------------------------------ #
    def _chat(self, system: str, user: str, *, json_mode: bool = True) -> dict | list | None:
        """Call an OpenAI-compatible chat endpoint. Returns parsed JSON or None."""
        if not self.enabled:
            return None
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        # Anthropic uses a different header; keep the OpenAI-compatible path primary.
        if self.provider == "anthropic":
            headers = {"x-api-key": self.api_key, "Content-Type": "application/json",
                       "anthropic-version": "2023-06-01"}
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.4,
        }
        if json_mode and self.provider != "anthropic":
            payload["response_format"] = {"type": "json_object"}
        try:
            with http_client(timeout=self.timeout) as client:
                resp = client.post(f"{self.base_url}/chat/completions",
                                   headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
            text = data["choices"][0]["message"]["content"]
            parsed = json.loads(text)
            return parsed
        except (httpx.HTTPError, KeyError, IndexError, json.JSONDecodeError, ValueError) as exc:
            log.warning("AI provider call failed (%s); using fallback", exc)
            return None

    # ------------------------------------------------------------------ #
    @staticmethod
    def _safe_recs(raw: Any, limit: int = 6) -> list[AIRecommendation]:
        recs: list[AIRecommendation] = []
        items = raw.get("recommendations") if isinstance(raw, dict) else None
        if not isinstance(items, list):
            return recs
        for r in items[:limit]:
            if not isinstance(r, dict) or not r.get("title"):
                continue
            try:
                recs.append(AIRecommendation(
                    title=str(r["title"])[:200],
                    description=str(r.get("description", ""))[:1000],
                    category=str(r.get("category", ""))[:80],
                    estimated_cost=float(r["estimated_cost"]) if r.get("estimated_cost") is not None else None,
                    score=min(1.0, max(0.0, float(r.get("score", 0.5)))),
                ))
            except (TypeError, ValueError):
                continue
        return recs

    def recommend_experiences(self, *, destination: str, interests: list[str],
                              travel_style: str | None, budget: float | None,
                              duration_days: int) -> list[AIRecommendation]:
        """AI-suggested experiences, validated. Falls back to interest templates."""
        raw = self._chat(
            system=("You are a travel expert. Return ONLY JSON: "
                    '{"recommendations":[{"title":str,"description":str,"category":str,'
                    '"estimated_cost":number|null,"score":number 0..1}]}'),
            user=(f"Destination: {destination}. Duration: {duration_days} days. "
                  f"Interests: {', '.join(interests) or 'general'}. "
                  f"Travel style: {travel_style or 'balanced'}. "
                  f"Budget: {budget or 'flexible'}. Suggest 6 diverse experiences."),
        )
        recs = self._safe_recs(raw)
        if recs:
            return recs
        # Deterministic fallback — clearly not AI, always safe.
        templates = {
            "history": ("Heritage walking tour", "Guided walk through the old quarter with a local historian."),
            "food": ("Local food crawl", "Taste signature dishes across 4-5 beloved local spots."),
            "museums": ("Museum morning", "Skip-the-line visit to the top museum with an audio guide."),
            "photography": ("Golden-hour photo walk", "Sunset shoot at the most photogenic viewpoints."),
            "adventure": ("Day adventure", "A half-day outdoor adventure with certified guides."),
            "culture": ("Cultural performance", "Evening of traditional music and dance."),
            "nature": ("Nature excursion", "Guided trip to the best nearby natural spot."),
            "shopping": ("Market & craft tour", "Local markets and artisan workshops."),
        }
        out = []
        for key in (interests or ["culture"])[:6]:
            t, d = templates.get(key.lower(), ("City highlights tour", "The essential sights with a local guide."))
            out.append(AIRecommendation(title=t, description=d, category=key, score=0.5))
        return out

    def generate_itinerary(self, *, destination: str, start_date: str, duration_days: int,
                           interests: list[str], travel_style: str | None,
                           budget: float | None) -> list[dict]:
        """Suggest day-by-day itinerary skeletons. Caller validates times/costs."""
        raw = self._chat(
            system=("You are a travel planner. Return ONLY JSON: "
                    '{"days":[{"day":int,"items":[{"time":"HH:MM","title":str,"type":str,'
                    '"duration_minutes":int,"estimated_cost":number}]}]} '
                    "Types: ACTIVITY, RESTAURANT, TRANSFER, HOTEL, EVENT, OTHER."),
            user=(f"Plan {duration_days} days in {destination} starting {start_date}. "
                  f"Interests: {', '.join(interests) or 'general'}. "
                  f"Style: {travel_style or 'balanced'}. Budget: {budget or 'flexible'}."),
        )
        if isinstance(raw, dict) and isinstance(raw.get("days"), list):
            days = []
            for d in raw["days"][: max(duration_days, 1)]:
                if not isinstance(d, dict):
                    continue
                items = [i for i in d.get("items", []) if isinstance(i, dict) and i.get("title")]
                days.append({"day": d.get("day"), "items": items[:8]})
            if days:
                return days
        # Fallback: simple deterministic skeleton.
        return [{"day": i + 1, "items": [
            {"time": "09:00", "title": f"Day {i + 1} sightseeing", "type": "ACTIVITY",
             "duration_minutes": 240, "estimated_cost": 2000},
            {"time": "13:00", "title": "Lunch — local cuisine", "type": "RESTAURANT",
             "duration_minutes": 90, "estimated_cost": 800},
            {"time": "17:00", "title": "Evening at leisure", "type": "OTHER",
             "duration_minutes": 120, "estimated_cost": 0},
        ]} for i in range(duration_days)]

    def rank_recovery_options(self, options: list[dict]) -> list[AIRankedOption]:
        """Rank PRE-VALIDATED feasible options. Never invents new ones."""
        if not options:
            return []
        raw = self._chat(
            system=("You rank travel recovery options. Return ONLY JSON: "
                    '{"ranking":[{"option_id":str,"rank":int,"reason":str}]}. '
                    "Rank 1 = best. Consider cost, time saved, and experience impact."),
            user=f"Options: {json.dumps(options)[:4000]}",
        )
        ranked: list[AIRankedOption] = []
        if isinstance(raw, dict) and isinstance(raw.get("ranking"), list):
            valid_ids = {o["id"] for o in options if "id" in o}
            for r in raw["ranking"]:
                if isinstance(r, dict) and r.get("option_id") in valid_ids:
                    ranked.append(AIRankedOption(
                        option_id=str(r["option_id"]),
                        rank=int(r.get("rank", 99)),
                        reason=str(r.get("reason", ""))[:500]))
            if ranked:
                return sorted(ranked, key=lambda x: x.rank)
        # Fallback: prefer lowest cost delta, then lowest experience impact.
        impact_rank = {"low": 0, "medium": 1, "high": 2}
        ordered = sorted(options,
                         key=lambda o: (float(o.get("estimated_cost_delta", 0)),
                                        impact_rank.get(str(o.get("experience_impact", "low")), 1)))
        return [AIRankedOption(option_id=str(o["id"]), rank=i + 1,
                               reason="Deterministic ranking: lowest cost and impact first.")
                for i, o in enumerate(ordered) if "id" in o]

    def explain_recovery_option(self, option: dict, disruption: dict) -> str:
        raw = self._chat(
            system="You explain travel plan changes simply. Return ONLY JSON: {\"explanation\": str}.",
            user=(f"Disruption: {json.dumps(disruption)[:1500]}. "
                  f"Recovery option: {json.dumps(option)[:1500]}. "
                  "Explain in 2-3 sentences what changes for the traveler."),
            json_mode=True,
        )
        if isinstance(raw, dict) and raw.get("explanation"):
            return str(raw["explanation"])[:1000]
        return (f"This option ({option.get('title', 'recovery')}) adjusts your itinerary "
                f"to work around the disruption with an estimated cost change of "
                f"{option.get('estimated_cost_delta', 0)}.")

    def answer_trip_question(self, question: str, trip_context: dict) -> str:
        raw = self._chat(
            system=("You are a helpful travel assistant. Answer concisely. "
                    "Return ONLY JSON: {\"answer\": str}."),
            user=f"Trip: {json.dumps(trip_context)[:2500]}. Question: {question[:500]}",
        )
        if isinstance(raw, dict) and raw.get("answer"):
            return str(raw["answer"])[:1500]
        return "I couldn't reach the AI service right now. Your trip details are still available below."

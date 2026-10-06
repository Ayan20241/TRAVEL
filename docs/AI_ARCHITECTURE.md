# TourFlow AI — AI Architecture

## 1. Position of AI in the system
AI is an **assisting layer**, never an authoritative one.

```
Deterministic Engine → Feasible Options → AI Ranking → User/Operator Decision
→ Backend Revalidation → Database Mutation
```

## 2. The abstraction (`backend/app/ai/client.py`)
`AIClient` exposes five functions:
- `recommend_experiences(destination, interests, travel_style, budget, duration)` → `list[AIRecommendation]`
- `generate_itinerary(...)` → day-by-day skeleton dicts
- `rank_recovery_options(options)` → `list[AIRankedOption]` over **pre-validated** options
- `explain_recovery_option(option, disruption)` → human-readable string
- `answer_trip_question(question, trip_context)` → string

Provider configuration: `AI_PROVIDER` (`none|openai|openrouter|anthropic`), `AI_API_KEY`,
`AI_MODEL`, `AI_BASE_URL`, `AI_TIMEOUT_SECONDS`. Any OpenAI-compatible endpoint works;
swapping providers is a config change, not a code change.

## 3. Output validation
- Responses requested as strict JSON (`response_format: json_object` where supported).
- `_safe_recs` field-validates every recommendation (types, lengths, score clamped 0–1);
  invalid entries are dropped, never passed through.
- `rank_recovery_options` only accepts ranks for option IDs it was given; unknown IDs
  are ignored — the AI cannot invent options.
- Itinerary skeletons are suggestions; persisting them goes through the normal
  item-creation validation.

## 4. Failure handling (AI failure must not break the app)
| Failure | Behavior |
|---|---|
| Missing API key / `AI_PROVIDER=none` | Deterministic fallback content |
| Timeout | Fallback |
| Provider HTTP error / rate limit | Fallback + warning log |
| Invalid JSON / schema | Fallback |
| Empty result | Fallback |

Fallbacks are clearly deterministic (interest templates, cost/impact ranking) — they
are never presented as AI output.

## 5. What AI cannot do (by construction)
- No DB access, no mutation methods on the client.
- Cannot approve bookings/transactions (no such function exists).
- Cannot bypass RLS/authorization (it never sees credentials; it receives only
  the data the authorized backend handler passes it).
- Cannot override constraints: ranking happens **after** `validate_candidate`;
  selection **revalidates** before mutation.

## 6. Frontend
`ai_enabled` is returned alongside AI endpoints so the UI can label content honestly
("AI suggestions" vs "Recommended for you" fallback).

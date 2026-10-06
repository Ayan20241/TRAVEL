"""Consistent API error envelope. Never leak stack traces to clients."""
from typing import Any
from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


def error_payload(code: str, message: str, details: dict[str, Any] | None = None, status_code: int = 400):
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details or {}}},
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Map plain HTTPExceptions into the envelope without leaking internals.
    code = {
        400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN",
        404: "NOT_FOUND", 409: "CONFLICT", 422: "VALIDATION_ERROR",
        429: "RATE_LIMITED",
    }.get(exc.status_code, "ERROR")
    return error_payload(code, str(exc.detail), status_code=exc.status_code)


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # exc.errors() can contain non-JSON-serializable values (e.g. ValueError
    # in ctx); sanitize so the handler itself never 500s.
    def _safe(o):
        if isinstance(o, (str, int, float, bool)) or o is None:
            return o
        if isinstance(o, dict):
            return {str(k): _safe(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [_safe(v) for v in o]
        return str(o)
    return error_payload("VALIDATION_ERROR", "Invalid request data",
                         {"fields": _safe(exc.errors())}, status_code=422)


async def unhandled_exception_handler(request: Request, exc: Exception):
    # Deliberately generic: internals go to logs, not to the client.
    return error_payload("INTERNAL_ERROR", "Something went wrong. Please try again.",
                         status_code=500)

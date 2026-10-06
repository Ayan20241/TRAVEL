"""Vercel serverless entrypoint for the TourFlow AI FastAPI backend.

Vercel's Python runtime serves the `app` ASGI callable defined here.
"""
from app.main import app  # noqa: F401  (Vercel looks for `app`)

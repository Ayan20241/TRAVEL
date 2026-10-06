"""TourFlow AI backend — FastAPI application entrypoint."""
import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.routers import trips, itinerary, disruptions, bookings, recommendations, catalog, users
from app.utils.errors import (
    http_exception_handler, validation_exception_handler, unhandled_exception_handler,
)

settings = get_settings()
logging.basicConfig(level=settings.log_level)

app = FastAPI(
    title="TourFlow AI",
    description="Personalized Dynamic Tour Planning & Tour Operations Platform (PS ID 7)",
    version="1.0.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": "tourflow-ai", "env": settings.backend_env}


@app.get("/api/v1/health", tags=["system"])
def health_v1():
    return {"status": "ok", "service": "tourflow-ai", "env": settings.backend_env}


app.include_router(trips.router)
app.include_router(itinerary.router)
app.include_router(disruptions.router)
app.include_router(bookings.router)
app.include_router(recommendations.router)
app.include_router(catalog.router)
app.include_router(catalog.hotel_router)
app.include_router(catalog.activity_router)
app.include_router(catalog.transport_router)
app.include_router(users.router)

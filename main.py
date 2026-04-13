from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from contextlib import asynccontextmanager
import os

from backend.database import engine, Base
from backend import models
from backend.routes import auth, products, orders
from backend.seed import seed_products, seed_admin


@asynccontextmanager
async def lifespan(app):
    # Create all tables and seed on startup
    try:
        Base.metadata.create_all(bind=engine)
        seed_admin()
        seed_products()
        print("[OK] Database initialized and seeded.")
    except Exception as e:
        print(f"[WARN] Database init error (will retry on first request): {e}")
    yield


app = FastAPI(title="Nexus Shop API", version="1.0.0", lifespan=lifespan)

# Allow frontend at same origin (and localhost dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://imrickyp1.github.io",
        "https://nexus-shop-api.onrender.com",
        "http://online-shop-nexus-app.com",
        "https://online-shop-nexus-app.com",
        "http://www.online-shop-nexus-app.com",
        "https://www.online-shop-nexus-app.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes - MUST come before static file routes
app.include_router(auth.router)
app.include_router(products.router)
app.include_router(orders.router)

# Serve specific static files
@app.get("/style.css")
async def get_css():
    return FileResponse("style.css", media_type="text/css")

@app.get("/app.js")
async def get_js():
    return FileResponse("app.js", media_type="application/javascript")

# Root route to serve index.html
@app.get("/")
async def read_root():
    return FileResponse("index.html")

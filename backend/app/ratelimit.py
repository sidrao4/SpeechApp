import time
from collections import defaultdict

from fastapi import HTTPException, Request

# in-memory sliding window, keyed by "<bucket>:<ip>". fine for a single
# instance on Render's free tier. with more than one instance each would
# keep its own counts, and you'd move this to Redis
_hits: dict[str, list[float]] = defaultdict(list)


def client_ip(request: Request) -> str:
    # Vercel's rewrite sets X-Forwarded-For to the real client IP, and
    # Render appends its own hop after it, so the first entry is the client
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(request: Request, bucket: str, max_requests: int, window_seconds: int, detail: str) -> None:
    key = f"{bucket}:{client_ip(request)}"
    now = time.time()
    recent = [t for t in _hits[key] if now - t < window_seconds]
    if len(recent) >= max_requests:
        raise HTTPException(status_code=429, detail=detail)
    recent.append(now)
    _hits[key] = recent

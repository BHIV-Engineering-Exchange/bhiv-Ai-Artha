import traceback
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import ValidationError

class ErrorBoundaryMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except ValidationError as e:
            return JSONResponse(
                status_code=422,
                content={"error": "Schema validation failed", "details": e.errors()}
            )
        except Exception as e:
            # Deterministic error boundary, zero unhandled 500 exceptions escaping
            return JSONResponse(
                status_code=400,
                content={
                    "error": "Internal Processing Error",
                    "type": type(e).__name__,
                    "message": str(e)
                }
            )

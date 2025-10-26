"""
API layer that receives browser data from the extension and returns appropriate
information to the extension
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from main import run_agent 
import uvicorn

app = FastAPI()

# Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class PromptRequest(BaseModel):
    prompt: str
    context: dict | None = None  # Always send open tabs


@app.get("/")
@app.head("/")
def root():
    """Return a lightweight health response for uptime checks."""
    return {"status": "Tabi's backend is live!"}

@app.post("/agent")
async def agent_route(req: PromptRequest):
    """Proxy the prompt and browser context to the FastAPI agent service."""
    print(req.prompt)
    print(req.context)
    try:
        result = await run_agent(req.prompt, (req.context["tabs"]), (req.context["bookmarks"]))
        print("Result in app: ", result)

        return JSONResponse(content={
            "output": result["output"],
            "action": result["action"]
        })
    except Exception as e:
        print("Agent error:", e)
        return JSONResponse(status_code=500, content={"error": str(e)})


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8010, reload=True)


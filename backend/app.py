"""
API layer that receives browser data from the extension and returns appropriate
information to the extension
"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from main import run_agent 
import uvicorn
from dotenv import load_dotenv
import os
import redis
from contextlib import asynccontextmanager
from datetime import datetime

# Load from local folder (or Hugging Face Hub if you pushed it there)

dotenv = load_dotenv()
REDIS_API_LINK = os.getenv("REDIS_API_LINK")
REDIS_API_PWD = os.getenv("REDIS_API_PWD")
RATE_LIMIT = 500000
IP_RATE_LIMIT = 250000 
GLOBAL_RATE_LIMIT = 1000000
WINDOW = 3600

"""
Basic redis connection.
"""

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.redis = redis.Redis(
        host=REDIS_API_LINK ,
        port=13530,
        username="default",
        password=REDIS_API_PWD,
        decode_responses=True,
    )
    print("Redis connected!")

    yield  # Application runs while paused here

    # Shutdown
    app.state.redis.close()
    print("Redis connection closed")


app = FastAPI(lifespan=lifespan)

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


@app.middleware("http")
async def rate_limit(req: Request, call_next):
    redis_client = req.app.state.redis

    try:
        body = await req.json()
        client_id = body.get("context", {}).get("client_id")
        client_ip = str(req.client.host)
    except Exception:
        client_id = None

    if not client_id:
        return JSONResponse(status_code=400, content={"error": "Missing client ID"})
    
    global_key = "rate_limit:global"
    key = f"rate_limit:{client_id}"
    ip_key = f"rate_limit:{client_ip}"
    curr_time = datetime.now().timestamp()
    uuid = redis_client.hgetall(key)
    ip = redis_client.hgetall(ip_key)
    glb = redis_client.hgetall(global_key)

    def set_redis(given_key, given_count):
        redis_client.hset(given_key, mapping={
        'timestamp': datetime.now().timestamp(),
        'count': given_count 
        })

        redis_client.expire(given_key, WINDOW)
    
    def check_limit(given_time, given_ts, given_count, given_key, limit):
        if given_time - given_ts < WINDOW:
            if (given_count + 1 > limit):
                raise HTTPException(status_code=429, detail="Rate limit exceeded. Please try again later.")
            
            else:
                set_redis(given_key, given_count + 1)
        
        else:
            set_redis(given_key, 1)
    
    curr_count = int(uuid.get("count", 0))
    prev_ts = float(uuid.get("timestamp", curr_time))

    curr_count_ip = int(ip.get("count", 0))
    prev_ts_ip = float(ip.get("timestamp", curr_time))

    curr_count_global = int(glb.get("count", 0))
    prev_ts_global = float(glb.get("timestamp", curr_time))

    if uuid:
        check_limit(curr_time, prev_ts, curr_count, key, RATE_LIMIT)
    
    else:
        set_redis(key, 1)

    if ip:
        check_limit(curr_time, prev_ts_ip, curr_count_ip, ip_key, IP_RATE_LIMIT)
    
    else:
       set_redis(ip_key, 1) 

    if glb:
        check_limit(curr_time, prev_ts_global, curr_count_global, global_key, GLOBAL_RATE_LIMIT)
    
    else:
        set_redis(global_key, 1)

    response = await call_next(req)
    return response


@app.get("/")
@app.head("/")
def root():
    return {"status": "Tabi's backend is live!"}

@app.post("/agent")
async def agent_route(req: PromptRequest):
    print(req.prompt)
    print(req.context)
    try:
        result = await run_agent(req.prompt, (req.context["tabs"]))
        print("Result in app: ", result)

        return JSONResponse(content={
            "output": result["output"],
            "action": result["action"]
        })
    except Exception as e:
        print("Agent error:", e)
        return JSONResponse(status_code=500, content={"error": str(e)})


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)


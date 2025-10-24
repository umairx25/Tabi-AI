"""
main.py
The main agent is called and returns structured output
based on the call
"""

from __future__ import annotations
from pydantic_ai import Agent
from dataclasses import asdict
from dotenv import load_dotenv
from schemas import Result
import os
from pymongo import MongoClient
from log import log_interaction

# ---------- ENV / CONFIG ----------
load_dotenv()
MODEL = "google-gla:gemini-2.5-flash"

# ---------- SYSTEM PROMPT ----------
SYSTEM_PROMPT = """You are a careful browser assistant.
- Never invent tabs.
- Only operate on the provided context.
- Prefer minimal, safe edits.
- Outputs MUST validate against the declared Pydantic schema.
Given tabs and user request, decide what to do AND return the result in one go. 
When a request is vague, default to Generate.
Also include how confident you are (from 0-1) on your intent matching.
"""


agent = Agent[None, Result](
    model=MODEL,
    system_prompt=SYSTEM_PROMPT,
    output_type= Result
)


async def run_agent(prompt: str, tabs: list[dict]):
    try:
        result = await agent.run(f"Tabs: {tabs}\nUser: {prompt}")
    
    except Exception as e:
        print("error: ", e)
    
    # result.data is a Pydantic model (one of the Result union types), convert it to a dict
    output = asdict(result)["output"]
    
    print(f"\n\nAgent output of type ({type(output)}):", output)
    print(f"With model dumps (of type {type(output.dict())})", output.dict())

    res = output.dict()

    log_interaction(prompt, res["action"], res["confidence"], res["output"], tabs)
    
    return res
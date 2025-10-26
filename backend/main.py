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

# ---------- ENV / CONFIG ----------
load_dotenv()
MODEL = "google-gla:gemini-2.5-flash"

# ---------- SYSTEM PROMPT ----------
SYSTEM_PROMPT = """You are a careful browser assistant.
- Never invent tabs.
- Only operate on the provided context.
- Prefer minimal, safe edits.
- Outputs MUST validate against the declared Pydantic schema.
- Remember: any bookmark directly under id 1, 2, or 3 are considered ungrouped.
- If you decide to generate, follow these rules (dont just append shit to google.com):
Rules:
            1. Generate 5-7 high-quality, diverse tabs that will help the user accomplish their task.
            2. Include 1-2 utility tabs such as tools or references (e.g., Google Maps, Docs).
            3. Return ONLY valid structured data that matches the TabGroup schema.
            4. Use accurate and descriptive tab titles and URLs.
Given tabs/bookmarks and user request, decide what to do AND return the result in one go. 
When a request is vague, default to Generate.
Also include how confident you are (from 0-1) on your intent matching.
"""


agent = Agent[None, Result](
    model=MODEL,
    system_prompt=SYSTEM_PROMPT,
    output_type= Result
)


async def run_agent(prompt: str, tabs: list[dict], bookmarks):
    """Run the Gemini-powered agent with the given prompt and tab context."""
    try:
        result = await agent.run(f"Tabs: {tabs}\nBookmarks:{bookmarks}\nUser: {prompt}")

    except Exception as e:
        print("error: ", e)
    
    # result.data is a Pydantic model (one of the Result union types), convert it to a dict
    output = asdict(result)["output"]
    
    print(f"\n\nAgent output of type ({type(output)}):", output)
    print(f"With model dumps (of type {type(output.dict())})", output.dict())

    res = output.dict()
    
    return res
""" 
Logs prompt information and intent to build a database for training
"""

import os
from pymongo import MongoClient
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import numpy as np
from typing import Any, Dict, List, Optional
import hashlib, urllib.parse, numpy as np

load_dotenv()
MONGO_PWD = os.getenv("MONGO_PWD")
MONGO_USERNAME = os.getenv("MONGO_USERNAME") 
MONGO_URL = f"mongodb+srv://uarham:{MONGO_PWD}@cluster0.3q8akww.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
DB_NAME = "Tabi"  
COLLECTION_NAME = "tab_data"  

client = MongoClient(MONGO_URL)
tabi_collection = client[DB_NAME][COLLECTION_NAME]
_embedder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

def log_interaction(prompt: str, intent: str,
                    confidence: float = None,
                    llm_output: dict | None = None,
                    metadata: list[dict] | None = None,
                    include_raw: bool = False):
    
    llm_output = llm_output or {}
    record = build_training_record(
        intent=intent,
        llm_output=llm_output,
        metadata=metadata,
        confidence=confidence,
        include_raw=include_raw # Not encrypted
    )
    # If you do NOT want to store the prompt, remove it here.
    record["prompt"] = prompt  

    result = tabi_collection.insert_one(record)
    return str(result.inserted_id)



def get_local_embedding(text: str):
    """Generate an embedding locally without API calls."""
    if not text.strip():
        return []
    vec = _embedder.encode(text, normalize_embeddings=True)
    return np.round(vec, 4).tolist()

def hash_domain(url: str) -> str:
    """Stable but non-reversible domain hash."""
    host = urllib.parse.urlparse(url).hostname or ""
    return hashlib.sha256((host).encode()).hexdigest()[:10]


# ---- generic pydantic/dict interop ----
def _to_dict(obj: Any) -> Dict[str, Any]:
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    return obj if isinstance(obj, dict) else {}

# ---- tab/group transformers (structure-preserving; no PII) ----
def _safe_tab(tab_like: Any, tab_index: int) -> Dict[str, Any]:
    t = _to_dict(tab_like)
    title = t.get("title", "")
    desc  = t.get("description", "")
    url   = t.get("url", "")
    return {
        "tab_index": tab_index,
        "domain_hash": hash_domain(url),
        "title_emb": get_local_embedding(f"{title} {desc}")
    }

def _safe_group(group_like: Any, group_index: int) -> Dict[str, Any]:
    g = _to_dict(group_like)
    gname = g.get("group_name", "")
    tabs  = g.get("tabs", []) or []
    return {
        "group_index": group_index,
        "group_hash": hashlib.sha256(gname.encode()).hexdigest()[:10],
        "group_emb": get_local_embedding(gname),
        "tabs": [_safe_tab(t, i) for i, t in enumerate(tabs)]
    }

# ---- transform OUTPUT (what the LLM returned) by intent ----
def _transform_output(intent: str, llm_output: Any) -> Dict[str, Any]:
    """Returns {'type', 'structure', 'groups'} for the LLM output, preserving hierarchy."""
    out = _to_dict(llm_output)
    payload = out.get("output", out)  # handle either {'action','output',...} or raw

    if intent == "search_tabs":
        # payload is a single Tab
        tab = payload
        groups = [{
            "group_index": 0,
            "group_hash": "search_result",
            "group_emb": [],
            "tabs": [_safe_tab(tab, 0)]
        }]
        structure = {"group_count": 1, "tabs_per_group": [1]}
        return {"type": "Tab", "structure": structure, "groups": groups}

    if intent == "close_tabs":
        # payload is TabList {tabs:[Tab,...]}
        tabs = _to_dict(payload).get("tabs", []) or []
        groups = [{
            "group_index": 0,
            "group_hash": "close_result",
            "group_emb": [],
            "tabs": [_safe_tab(t, i) for i, t in enumerate(tabs)]
        }]
        structure = {"group_count": 1, "tabs_per_group": [len(tabs)]}
        return {"type": "TabList", "structure": structure, "groups": groups}

    if intent == "organize_tabs":
        # payload is TabGroupList {tabs:[TabGroup,...]}
        tab_groups = _to_dict(payload).get("tabs", []) or []
        groups = [_safe_group(g, gi) for gi, g in enumerate(tab_groups)]
        structure = {
            "group_count": len(groups),
            "tabs_per_group": [len(g["tabs"]) for g in groups],
            "group_order": [g["group_hash"] for g in groups],
        }
        return {"type": "TabGroupList", "structure": structure, "groups": groups}

    if intent == "generate_tabs":
        # payload is TabGroup {group_name, tabs:[Tab,...]}
        g = payload
        groups = [_safe_group(g, 0)]
        structure = {"group_count": 1, "tabs_per_group": [len(groups[0]["tabs"])]}
        return {"type": "TabGroup", "structure": structure, "groups": groups}

    # fallback (keep shape minimal)
    return {"type": "unknown", "structure": {}, "groups": []}

# ---- transform METADATA (your user context) with SAME structure rules ----
def _transform_metadata(metadata: Optional[List[dict]]) -> Dict[str, Any]:
    metadata = metadata or []
    # expect a list of {group_name, tabs:[{title,url,description},...]}
    groups = [_safe_group(g, gi) for gi, g in enumerate(metadata)]
    structure = {
        "group_count": len(groups),
        "tabs_per_group": [len(g["tabs"]) for g in groups],
        "group_order": [g["group_hash"] for g in groups],
    }
    return {"structure": structure, "groups": groups}

# ---- one builder to produce exactly what goes to Mongo ----
def build_training_record(
    intent: str,
    llm_output: Any,
    metadata: Optional[List[dict]] = None,
    confidence: Optional[float] = None,
    include_raw: bool = False
) -> Dict[str, Any]:
    out_block  = _transform_output(intent, llm_output)
    meta_block = _transform_metadata(metadata)

    record = {
        "intent": intent,
        "confidence": confidence if confidence is not None
                       else _to_dict(llm_output).get("confidence"),
        "output": out_block,    # STRUCTURED, anonymized output
        "metadata": meta_block  # STRUCTURED, anonymized input context
    }
    if include_raw:
        record["raw_output"] = _to_dict(llm_output)  # optional: your exact LLM return
    return record
# Tabi AI – Chrome Copilot for Intent-Aware Tab Management

Tabi AI is a Chrome extension paired with a lightweight FastAPI backend that turns the browser into a privacy-respecting copilot. The extension keeps most intent detection and structured planning local via Chrome's built-in AI APIs and only falls back to the Gemini cloud backend for complex synthesis. This hybrid strategy supports the Google Chrome Built-in AI Challenge 2025 vision of fast, private, offline-friendly intelligence.

## Features at a Glance
- **Command palette overlay** launched from the toolbar icon or `Ctrl+Shift+K`/`⌘K`, rendered via an injected shadow DOM UI for consistent styling across pages.【F:extension/background.js†L16-L82】【F:extension/content.js†L12-L122】
- **Intent understanding on-device** using the Chrome Prompt API (`LanguageModel.create`) to categorize user requests and request schema-constrained JSON for actions such as search, clean-up, organization, or generation.【F:extension/content.js†L124-L208】【F:extension/popup.js†L14-L175】
- **Writer-style generation for new tab plans** where the same local model produces detailed tab suggestions (titles, URLs, descriptions) before optionally invoking the backend, keeping personal context on-device whenever possible.【F:extension/popup.js†L176-L317】
- **FastAPI agent fallback** that delegates harder reasoning to Gemini 2.5 Flash through `pydantic_ai`, ensuring results always match the expected schema while respecting intent confidence scores.【F:backend/app.py†L9-L44】【F:backend/main.py†L1-L49】
- **Action automation** including tab switching, closing, grouping, and opening generated research workspaces, plus bookmark and Chrome system page shortcuts surfaced in the command palette.【F:extension/popup.js†L318-L742】

Together these capabilities make Tabi a holistic browser copilot: it can find information you already opened, tidy distractions, organize projects, or spin up entirely new browsing journeys while protecting privacy through default-local processing.

## Architecture Overview
1. **Chrome Extension**
   - Injects an overlay (`content.js`) that relays user prompts to popup UI and bridges to Chrome AI APIs.
   - Background service worker (`background.js`) ensures the overlay is available on any page and handles tab switching via messaging.
   - Popup logic (`popup.js`) orchestrates AI calls, tab/bookmark retrieval, and browser actions.

2. **FastAPI Backend**
   - Minimal REST surface (`/agent`) proxies tab context and prompt to `pydantic_ai`'s Gemini agent defined in `main.py`.
   - Structured responses (search, close, organize, generate) are validated against `schemas.py` before returning to the extension.

Local-first execution means most prompts never leave the device; only when the local Prompt/Writer pipeline cannot fulfill the request does the popup fall back to the backend endpoint.

## Prerequisites
- **Python** 3.11+ (virtual environment recommended).
- **Chrome Canary/Dev** with built-in AI APIs enabled (Prompt + Writer) via the [Chrome Built-in AI Early Preview Program](https://developer.chrome.com/docs/ai/). You may need to enable feature flags such as `chrome://flags/#prompt-api-for-gemini-nano` and `chrome://flags/#writer-api`.
- **Gemini API access** for cloud fallback (Gemini Developer API key).

## Backend Setup
1. **Install dependencies**
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Configure environment variables**
   - Create `backend/.env` with your Gemini credentials:
     ```env
     GEMINI_API_KEY=your_api_key_here
     # Optionally expose additional configuration variables if required by pydantic_ai.
     ```
   - `main.py` loads the `.env` file on startup and targets the `google-gla:gemini-2.5-flash` model.【F:backend/main.py†L12-L31】

3. **Run the FastAPI server**
   ```bash
   uvicorn app:app --host 0.0.0.0 --port 8010 --reload
   ```
   The health endpoint (`GET /`) confirms the service is available, while `POST /agent` accepts the JSON payload emitted by the extension.【F:backend/app.py†L9-L44】

## Extension Setup
1. **Prepare Chrome**
   - Ensure Chrome Prompt API and Writer API are enabled (see prerequisites).
   - Sign in to the Early Preview Program and download the Gemini Nano runtime if prompted.

2. **Load the extension**
   - Open `chrome://extensions`.
   - Toggle **Developer mode**.
   - Choose **Load unpacked** and select `Tabi-AI/extension`.

3. **Grant permissions**
   - The manifest requests tabs, tab groups, bookmarks, windows, and scripting permissions, all of which are required for automation flows.【F:extension/manifest.json†L1-L49】

4. **Test the overlay**
   - Click the Tabi toolbar icon or use the keyboard shortcut to open the command palette.
   - Enter natural language prompts like “organize my research tabs” or “close distracting videos.”
   - Observe the local Prompt/Writer result in the UI; if more reasoning is needed, the extension will automatically call the backend.

## How Chrome Prompt & Writer APIs Are Used
- `content.js` keeps a persistent `LanguageModel` session that responds to two message types:
  - `GET_INTENT` to classify user input, returning a single label without server involvement (Prompt API use-case).【F:extension/content.js†L130-L186】
  - `PROCESS_WITH_SCHEMA` to request JSON that matches the backend schema, letting the local model “write” structured outputs (e.g., generate new research tab sets) analogous to Writer API behavior.【F:extension/content.js†L188-L220】【F:extension/popup.js†L176-L317】
- When the local Writer-style generation cannot satisfy the task, the popup forwards the same schema-enforced prompt to the FastAPI backend, which uses Gemini’s cloud model to complete the request.【F:extension/popup.js†L318-L368】【F:backend/main.py†L27-L49】

This layered approach lets Tabi deliver privacy-preserving, offline-ready assistance while still benefiting from Gemini’s full capabilities for heavy lifting.

## Development Tips
- Use `chrome://inspect/#service-workers` to debug `background.js` and `chrome://extensions` for content script logs.
- The popup logs intent detection and backend payloads to Chrome DevTools (`chrome-extension://` context) for troubleshooting.【F:extension/popup.js†L14-L376】
- Schemas shared between backend and frontend live in `backend/schemas.py`; keep them in sync when adding new agent actions.【F:backend/schemas.py†L1-L49】

## Roadmap Ideas
- Add natural language bookmarking and recap features via additional Writer prompts.
- Persist workspace presets to sync storage for multi-device usage.
- Expand offline fallbacks by caching frequent actions locally.

Tabi AI is designed to give the web “a brain boost and a creative spark,” aligning with Chrome’s built-in AI initiative by balancing local intelligence with selective cloud augmentation.

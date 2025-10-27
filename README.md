# Tabi – Your AI Browser Copilot

Tabi is an **AI-powered Chrome assistant** that understands natural language commands to help you manage your tabs, bookmarks, and browsing context intelligently.

It combines **on-device Chrome AI (Gemini Nano)** with a **cloud-based reasoning engine** to deliver fast, privacy-preserving, and context-aware browser automation.

---

## 🚀 What Tabi Does

Tabi lets you control your browser using natural language.

### Example Commands
- "Organize my research tabs into groups."
- "Close all distracting tabs."
- "Find the CNN article I opened earlier."
- "Bookmark these AI papers under 'Work'."
- "Set up tabs for planning a trip to Japan."

### ✨ Key Features

| Feature | Description |
|----------|-------------|
| 🔍 **Tab Search** | Finds open tabs matching your query by title or content. |
| 🗂️ **Tab Organization** | Groups tabs intelligently (e.g., "Put all my research tabs together"). |
| 🧹 **Tab Cleanup** | Closes redundant or unwanted tabs ("Close all YouTube tabs"). |
| 🪄 **Tab Generation** | Creates and opens new tabs based on your needs ("Set up tabs for learning Python"). |
| 🔖 **Bookmark Management** | Finds, removes, or organizes bookmarks based on natural language commands. |
| 💡 **Smart Autocomplete** | Predicts and suggests commands as you type. As you type, shows AI-generated suggestions alongside instant access to open tabs, bookmarks, and Chrome pages (settings, history, downloads). |

---

## 🧩 Tech Stack

### 🖥️ Chrome Extension (Frontend)
- **Manifest V3** extension with modern Chrome APIs
- Direct integration with **Chrome Built-in AI APIs** (Gemini Nano):
  - **Prompt API** – Powers intent classification, structured reasoning with schema constraints, and local execution of most actions (search, close, organize)
  - **Writer API** – Generates dynamic placeholder suggestions, contextual loading messages, and real-time autocomplete as you type
- **Fully local execution** for 70-80% of commands – search tabs, close tabs, organize tabs, and bookmark operations run entirely on-device
- Handles UI, context collection, and direct browser manipulation via Chrome APIs

### 🧠 Backend (Python / FastAPI)
- **FastAPI** server providing REST API for complex reasoning tasks
- **pydantic-ai Agent** powered by **Gemini 2.5 Flash** for structured inference
- **Pydantic schemas** enforce strict JSON structures for AI outputs:
  - Search, close, organize, and generate operations for tabs
  - Remove, search, and organize operations for bookmarks
- Validates and structures model outputs before returning to extension

### 🔄 Hybrid AI Architecture

Tabi uses an **intelligent routing system** that optimizes for speed, privacy, and accuracy:

**Local Processing (Chrome AI - Gemini Nano)**
- Handles **70-80% of queries** entirely on-device using the Prompt API
- Sub-100ms response time with zero network latency
- **Complete privacy** – prompts and context never leave your device
- Schema-constrained outputs ensure structured, reliable responses
- Actions handled locally:
  - **Tab search** – Find tabs by title or URL
  - **Tab closing** – Remove tabs matching patterns
  - **Tab organization** – Group tabs by domain or topic
  - **Bookmark operations** – Search, remove, and organize bookmarks
- Writer API enhances UX with:
  - Session-based placeholder suggestions ("Ask Tabi to...")
  - Real-time autocomplete predictions as you type
  - Contextual loading messages based on your query
- Instant fuzzy search surfaces open tabs, bookmarks, and Chrome pages (history, settings, downloads) as you type

**Cloud Fallback (Backend AI - Gemini 2.5 Flash)**
- Handles **20-30% of queries** requiring complex reasoning or generation
- Activates when local AI returns low confidence or for generation tasks
- Provides deep semantic understanding and creative content generation
- Primary use case: **Tab generation** – creating curated lists of new tabs based on topics or goals

**Confidence-Based Routing**
- Prompt API classifies intent and returns confidence score
- High-confidence queries (≥0.8) → Processed locally with Gemini Nano
- Low-confidence or generation queries → Routed to cloud backend
- Seamless fallback ensures optimal balance of speed and accuracy

---

## ⚙️ Setup & Installation

### 🔧 Requirements
- Chrome 127+ with Chrome AI support
- Python 3.10+
- Google Gemini API access for backend

---

### 🧱 1. Backend Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/<your-repo>/tabi.git
   cd tabi/backend
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate   # Mac/Linux
   venv\Scripts\activate      # Windows
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   ```bash
   # Create .env file
   echo "GOOGLE_API_KEY=your_gemini_api_key" > .env
   ```

5. Run the server:
   ```bash
   backend/python app.py
   ```

   Server will start at `http://127.0.0.1:8010`

---

### 🧭 2. Chrome Extension Setup

0. Follow the instructionson this page to turn on experimental features and instantiate the prompt and writer APIs: `https://developer.chrome.com/docs/ai/built-in-apis` **(ensure you have 20 GB of storage left on your computer)**
1. Open Chrome → `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right)
3. Click **Load unpacked**

4. Select the `extension/` folder from the repository

5. Pin Tabi to your toolbar
6. Click the icon or press `Cmd+K` (Mac) / `Ctrl+ Shift+ K` (Windows) to start

---

### ⚙️ 3. Configuration

Update backend URL in extension if needed:
```javascript
// In popup.js (if backend runs elsewhere)
const BACKEND_URL = "http://127.0.0.1:8010";
```

---

## 🧠 How It Works

### Request Flow

```
User Command
    ↓
[Chrome Extension]
    ↓
[Intent Classification - Chrome AI Prompt API]
    ├─ High confidence + simple → LOCAL PATH
    │   ↓
    │   [Chrome AI processes locally]
    │   [Direct Chrome API execution]
    │   [Sub-100ms response]
    │
    └─ Low confidence OR complex → CLOUD PATH
        ↓
        [Backend FastAPI]
        ↓
        [Gemini 2.5 Flash reasoning]
        ↓
        [Schema-validated response]
        ↓
        [Extension executes action]
```

### Processing Stages

1. **Input Enhancement** – Writer API generates session-specific placeholder text and provides real-time autocomplete suggestions
2. **Intent Classification** – Prompt API analyzes query and returns structured intent with confidence score
3. **Routing Decision** – System routes to local (Prompt API) or cloud (backend) based on confidence threshold (0.8)
4. **Context Collection** – Extension gathers relevant tabs and bookmarks from Chrome APIs
5. **Local Execution** – Prompt API processes query with schema constraints, returns structured actions (70-80% of queries)
6. **Cloud Execution** – Backend handles generation tasks and low-confidence queries (20-30% of queries)
7. **Action Execution** – Validated responses are executed directly via Chrome APIs (tabs, bookmarks, tab groups)
8. **Status Feedback** – Writer API generates contextual loading messages based on action type




---

## 💬 Example Commands

| Command | Tabi Does |
|--------|---------|
| "Find the tab with Google Docs open." | Searches and activates matching tab |
| "Close all YouTube and Reddit tabs." | Identifies and closes matching tabs |
| "Organize my tabs by topic." | Creates intelligent tab groups |
| "Create tabs for planning a trip to Japan." | Generates and opens relevant tabs |
| "Remove my old AI bookmarks." | Finds and removes matching bookmarks |
| "Put my programming bookmarks under 'Work'." | Organizes bookmarks into folders |

---

## 🔒 Privacy & Performance

### Privacy-First Design
- **Most operations are fully local** – Search, close, organize, and bookmark management (70-80% of queries) run entirely on-device using Chrome's Prompt API
- **Zero data transmission for local queries** – Your tabs, bookmarks, and commands never leave your device
- **Cloud routing only for generation** – Tab generation and low-confidence queries are the only operations requiring backend
- **Minimal permissions** – Only tabs, bookmarks, and tab groups access
- **No data retention** – Backend is stateless and doesn't store user data
- **Transparent routing** – Users can see when local vs cloud processing is used

### Performance Characteristics
- **Local processing**: <100ms average response time (Prompt API)
- **Cloud processing**: ~800ms for generation tasks (backend API)
- **Writer API enhancements**: Real-time suggestions with <200ms latency
- **Confidence threshold**: 0.8 (optimized for accuracy vs speed)
- **Intent classification**: ~20-50ms using Prompt API with schema constraints

---

## 🤝 Contributors

- **Umair Arham**
- **Ali Towaiji**

---

## 📜 License

MIT License © 2025

---

## 🚀 Future Roadmap
- Integration with more chrome features
- Voice command interface
- Tailor Tabi to react based on user's browsing patterns
- Multi-browser support (Firefox, Edge)

---

> "Your browser, finally intelligent."
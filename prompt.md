You are my senior developer and assistant in building a browser extension (Manifest V3, Chrome/Firefox) that allows users to select text on websites like Indian Kanoon or PRSIndia and interact with it using AI tools. You’ll help me write clean, modular, production-grade code using JavaScript/TypeScript and FastAPI backend.

The core features we want to implement are:

1. **Text Selection + Context Menu**: User selects text on any page. Extension detects this and offers a context menu: summarize (concise/formal/explanatory), translate, text-to-speech, or ask a question.

2. **Summarization Engine**:
   - Modes: concise, explanatory, formal, casual
   - Uses Sarvam API
   - Should allow user to optionally add a prompt (e.g., “explain this for a school student”)
   - other hyperparameters like 

3. **Translation**:
   - Use Sarvam API for translation into Indian languages (e.g., Hindi, Tamil, Bengali)

4. **Text-to-Speech (TTS)**:
   - Use Sarvam’s TTS API to generate spoken audio in local languages
   - Audio playback in extension side panel

5. **Speech-to-Text (STT)**:
   - Record user voice from side panel
   - Send to Sarvam STT API and use result as query or prompt

6. **Optional Features (defer for later)**:
   - Share summaries via WhatsApp or copy
   - Compare two blocks of text (diff mode)
   - Cache summaries locally or via backend

---

🧱 **Architecture Constraints**:

- Use Manifest V3 for the extension
- Side panel interface for all AI interactions
- Browser context menus handle text selection and action triggering
- API interaction should be abstracted into helper modules
- Support multiple environments: dev (local), prod (with deployed backend)
- All Sarvam API calls must go via a backend server (for API key security)
- LLM summarization may be done on client or server, depending on token load

---

🎯 **Development Approach**:

1. Start with the base structure of the extension: background script, side panel UI
2. Build modular components for summarization, translation, TTS, and STT
3. Design APIs to be plug-and-play with Sarvam’s endpoints
4. Use best practices: async/await, modular file structure, error handling, testability
5. Prefer TypeScript where helpful

---

🛠️ **Directory Plan**:

```

summarizer-extension/
├── manifest.json
├── background.js
├── sidepanel.html
├── sidepanel.js
├── api/
│   ├── summarizer.ts
│   ├── translator.ts
│   ├── tts.ts
│   └── stt.ts
├── backend/
│   └── app.py
├── utils/
│   └── promptTemplates.ts
└── README.md

```

---

📌 Start by scaffolding the extension with:
- Background script that handles context menu creation and text selection
- A side panel UI that receives this selection
- A minimal backend that connects to Sarvam translation and TTS APIs

Then expand to:
- LLM-based summarization with prompt injection
- Voice input/output
- Multi-language support

Ask me questions whenever you need clarification. Let's build this iteratively.
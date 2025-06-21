# AI Text Assistant Browser Extension

A browser extension that allows users to select text on any website and interact with it using AI tools - summarize, translate, text-to-speech, and chat functionality.

## Current Status

✅ **Completed**: Basic extension structure with side panel interface
✅ **Completed**: Browser context menu integration
🔄 **In Progress**: Backend API integration
⏳ **Planned**: Sarvam API integration, advanced features

## Installation & Testing

### Backend Setup
1. **Navigate to the backend directory**: `cd backend`
2. **Install dependencies**: `pip install -r requirements.txt`
3. **Set up environment variables**: Create a `.env` file with your Sarvam API key:
   ```
   SARVAM_API_KEY=your_api_key_here
   ```
4. **Start the FastAPI server**: `uvicorn app:app --reload --port 8000`
5. **Verify the server is running**: Visit `http://localhost:8000/docs` to see the API documentation

### Chrome/Edge
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select this folder
4. The extension should appear in your extensions list

### Firefox
1. Open Firefox and go to `about:debugging`
2. Click "This Firefox" tab
3. Click "Load Temporary Add-on" and select the `manifest.json` file

## How to Test

1. **Load the extension** using the steps above
2. **Navigate to any webpage** (e.g., a news article, Wikipedia page)
3. **Select some text** (at least 10 characters)
4. **Right-click on the selected text** to open the context menu
5. **Choose an action** from the context menu:
   - 📝 Summarize with Text Assistant
   - 💬 Chat with Text Assistant
   - 🔊 Read with Text Assistant
   - 🌐 Translate with Text Assistant
6. **The side panel will open** showing your selected text and the chosen action
7. **Interact with the AI tools** in the side panel interface

## File Structure

```
├── manifest.json              # Extension configuration
├── background.js              # Service worker (handles context menus)
├── sidepanel.html             # Side panel interface
├── sidepanel.js               # Side panel functionality
├── marked.min.js              # Markdown parser library
├── backend/                   # Backend API files
└── README.md                  # This file
```

## Features

- **Text Summarization**: Generate concise, formal, or explanatory summaries
- **AI Chat**: Ask questions about the selected text
- **Text-to-Speech**: Listen to the selected text with adjustable speed
- **Translation**: Translate text between multiple languages
- **Side Panel Interface**: Clean, organized interface for all AI interactions

## Next Steps

1. **Backend Integration**: Connect to Sarvam API via FastAPI backend
2. **API Modules**: Create modular API handlers for each feature
3. **Enhanced UI**: Add loading states, error handling, and better UX
4. **Voice Features**: Add voice input and advanced TTS options

## Development Notes

- Uses Manifest V3 for modern browser compatibility
- Browser context menus handle text selection and action triggering
- Background script manages extension state and context menus
- Side panel provides a comprehensive interface for AI interactions
- All API calls will go through a backend server for security

## Troubleshooting

- If the extension doesn't load, check the browser console for errors
- Make sure all files are in the correct locations as shown in the file structure
- For Chrome, you may need to refresh the extensions page after making changes
- The extension requires permissions for `sidePanel`, `storage`, and `contextMenus` 
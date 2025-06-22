# SarvaMitra - everyone's companion

You can navigate through Sarvamitra entirely without mouse or vision. 
The Shortcuts and keys will help you navigate and use tools.

## Navigation

1. Use `Tab` key to navigate around chunks.  
2. Use `space` or `enter` keys to select and unselect chunks.  

## Use the shortcuts below to use tools.

1. Ctrl+Shift+1 -> Turn microphone on/off (Voice Input and ASR with Sarvam saarika:v2.5) - This is entered into the prompt box.
2. Ctrl+Shift+2 -> Send (Sends the prompt along with the context to the Sarvam-M model)
3. Ctrl+Shift+3 -> Read Aloud (Text-to-speech with Sarvam  bulbul:v2)
4. Ctrl+Shift+4 -> Translate (Sarvam mayura:v1)
5. Copy - Click a message or focus textbox, then use this to copy content
6. Images: Click on images below to select them for context. Selected images will have blue borders.

## Challenges - 

1. chunking - non leaf nodes (parent nodes) - duplicate content
2. text-to-speech - entire text is not being converted to speech
3. chrome extension permissions - for microphone, custom key bindings
4. Image filtering and descriptions

## Installation & Testing

### Backend Setup
1. **Navigate to the backend directory**: `cd backend`
2. **Install dependencies**: `pip install -r requirements.txt`
3. **Set up environment variables**: Create a `.env` file with your API keys:
   ```
   SARVAM_API_KEY=
   MISTRAL_API_KEY=
   ```
4. **Start the FastAPI server**: `uvicorn app:app --reload --port 8000`
5. **Verify the server is running**: Visit `http://localhost:8000/docs` to see the API documentation

### Chrome/Edge
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select this folder
4. The extension should appear in your extensions list
// sidepanel.js - Multi-page Side Panel Logic

// Global state
let currentText = '';
let currentAction = 'summarize';
let currentAudio = null;
let isPlaying = false;
let isPaused = false;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    initializeNavigation();
    setupEventListeners();
    
    try {
        // Load the last message from storage
        const result = await chrome.storage.session.get(['lastMessage']);
        const message = result.lastMessage;
        
        if (message && message.text) {
            console.log('Loading message from storage:', message);
            displayMessage(message);
        } else {
            showNoSelection();
        }
    } catch (error) {
        console.error('Error loading message:', error);
        showError('Failed to load message');
    }
    
    // Listen for storage changes to update the panel in real-time
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'session' && changes.lastMessage) {
            const newMessage = changes.lastMessage.newValue;
            if (newMessage) {
                console.log('Storage changed, loading new message:', newMessage);
                displayMessage(newMessage);
            }
        }
    });
    
    // Listen for direct messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Received direct message:', message);
        
        if (message.action === 'switchTab' && message.tabName) {
            switchToTab(message.tabName);
            
            if (message.text) {
                currentText = message.text;
                updateAllTextareas(message.text);
                enableButtons();
            }
            
            showTabSwitchNotification(message.tabName);
            sendResponse({ success: true });
        }
        
        return true;
    });
});

// Navigation Functions
function initializeNavigation() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const pages = document.querySelectorAll('.page');
    
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetPage = tab.dataset.page;
            
            // Update active states
            navTabs.forEach(t => t.classList.remove('active'));
            pages.forEach(p => p.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(targetPage).classList.add('active');
            
            currentAction = targetPage;
        });
    });
}

// Setup Event Listeners
function setupEventListeners() {
    // Summarize
    document.getElementById('summarize-btn').addEventListener('click', handleSummarize);
    document.getElementById('summarize-textarea').addEventListener('input', enableButtons);
    
    // Chat
    document.getElementById('chat-send-btn').addEventListener('click', handleChatSend);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChatSend();
    });
    document.getElementById('chat-clear-btn').addEventListener('click', clearChat);
    document.getElementById('chat-textarea').addEventListener('input', enableButtons);
    
    // Read/TTS
    document.getElementById('play-btn').addEventListener('click', handlePlay);
    document.getElementById('pause-btn').addEventListener('click', handlePause);
    document.getElementById('stop-btn').addEventListener('click', handleStop);
    document.getElementById('tts-pace').addEventListener('input', updatePaceDisplay);
    document.getElementById('read-textarea').addEventListener('input', enableButtons);
    
    // Translate
    document.getElementById('translate-btn').addEventListener('click', handleTranslate);
    document.getElementById('auto-detect-btn').addEventListener('click', handleAutoDetect);
    document.getElementById('translate-textarea').addEventListener('input', enableButtons);
}

// Message Display Functions
function displayMessage(message) {
    currentText = message.text;
    
    // Update all textareas
    updateTextarea('summarize-textarea', message.text);
    updateTextarea('chat-textarea', message.text);
    updateTextarea('read-textarea', message.text);
    updateTextarea('translate-textarea', message.text);
    
    // Enable buttons
    enableButtons();
    
    // Switch to the appropriate tab based on the action type
    if (message.type) {
        switchToTab(message.type);
        
        // Add visual feedback for the switch
        showTabSwitchNotification(message.type);
    }
}

function updateTextarea(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.value = text || '';
        // Auto-focus the textarea for better UX
        element.focus();
    }
}

function updateAllTextareas(text) {
    updateTextarea('summarize-textarea', text);
    updateTextarea('chat-textarea', text);
    updateTextarea('read-textarea', text);
    updateTextarea('translate-textarea', text);
}

function switchToTab(tabName) {
    const navTabs = document.querySelectorAll('.nav-tab');
    const pages = document.querySelectorAll('.page');
    
    // Map context menu IDs to tab names if needed
    const tabMapping = {
        'summarize': 'summarize',
        'chat': 'chat', 
        'read': 'read',
        'translate': 'translate'
    };
    
    const targetTab = tabMapping[tabName] || tabName;
    
    navTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.page === targetTab);
    });
    
    pages.forEach(page => {
        page.classList.toggle('active', page.id === targetTab);
    });
    
    currentAction = targetTab;
    
    // Smooth scroll to top of the active page
    const activePage = document.getElementById(targetTab);
    if (activePage) {
        activePage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function showTabSwitchNotification(actionType) {
    const actionNames = {
        'summarize': 'Summarization',
        'chat': 'Chat', 
        'read': 'Text-to-Speech',
        'translate': 'Translation'
    };
    
    const actionName = actionNames[actionType] || actionType;
    
    // Create a temporary notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4caf50;
        color: white;
        padding: 10px 16px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    notification.textContent = `Switched to ${actionName}`;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.style.opacity = '1', 100);
    
    // Remove after 2 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 2000);
}

function enableButtons() {
    const summarizeTextarea = document.getElementById('summarize-textarea');
    const chatTextarea = document.getElementById('chat-textarea');
    const readTextarea = document.getElementById('read-textarea');
    const translateTextarea = document.getElementById('translate-textarea');
    
    const hasSummarizeText = summarizeTextarea.value.trim().length > 0;
    const hasChatText = chatTextarea.value.trim().length > 0;
    const hasReadText = readTextarea.value.trim().length > 0;
    const hasTranslateText = translateTextarea.value.trim().length > 0;
    
    document.getElementById('summarize-btn').disabled = !hasSummarizeText;
    document.getElementById('chat-input').disabled = !hasChatText;
    document.getElementById('chat-send-btn').disabled = !hasChatText;
    document.getElementById('play-btn').disabled = !hasReadText;
    document.getElementById('translate-btn').disabled = !hasTranslateText;
    document.getElementById('auto-detect-btn').disabled = !hasTranslateText;
}

function showNoSelection() {
    currentText = '';
    updateTextarea('summarize-textarea', '');
    updateTextarea('chat-textarea', '');
    updateTextarea('read-textarea', '');
    updateTextarea('translate-textarea', '');
    enableButtons();
}

function showError(errorMessage) {
    console.error(errorMessage);
    // You can add error display logic here if needed
}

// Summarize Functions
async function handleSummarize() {
    const textarea = document.getElementById('summarize-textarea');
    const text = textarea.value.trim();
    
    if (!text) return;
    
    const btn = document.getElementById('summarize-btn');
    const result = document.getElementById('summarize-result');
    const style = document.getElementById('summary-style').value;
    
    btn.disabled = true;
    btn.textContent = 'Generating...';
    
    result.style.display = 'block';
    result.className = 'result loading';
    result.innerHTML = '<strong>Generating summary...</strong><br>Please wait while we process your text.';
    
    try {
        const response = await callAPI('summarize', {
            content: text,
            mode: style,
            temperature: 0.5,
            max_tokens: 1000
        });
        
        result.className = 'result';
        result.innerHTML = renderMarkdown(response.response);
    } catch (error) {
        result.className = 'result error';
        result.innerHTML = `<strong>Error:</strong> ${error.message}`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Summary';
    }
}

// Chat Functions
async function handleChatSend() {
    const input = document.getElementById('chat-input');
    const textarea = document.getElementById('chat-textarea');
    const question = input.value.trim();
    const text = textarea.value.trim();
    
    if (!question || !text) return;
    
    const messages = document.getElementById('chat-messages');
    
    // Add user message
    addChatMessage('user', question);
    input.value = '';
    
    // Add loading message
    const loadingMsg = addChatMessage('assistant', 'Thinking...');
    loadingMsg.classList.add('loading');
    
    try {
        // Create a context-aware message that includes the selected text
        const contextMessage = `Context: ${text}\n\nQuestion: ${question}`;
        
        const response = await callAPI('chat', {
            message: contextMessage,
            model: "sarvam-m",
            temperature: 0.5,
            top_p: 1.0,
            max_tokens: 1000
        });
        
        // Replace loading message with response
        loadingMsg.classList.remove('loading');
        loadingMsg.innerHTML = `<strong>Assistant:</strong> ${renderMarkdown(response)}`;
    } catch (error) {
        loadingMsg.classList.remove('loading');
        loadingMsg.innerHTML = `<strong>Error:</strong> ${error.message}`;
        loadingMsg.classList.add('error');
    }
    
    // Scroll to bottom
    messages.scrollTop = messages.scrollHeight;
}

function addChatMessage(sender, message) {
    const messages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    
    if (sender === 'user') {
        messageDiv.innerHTML = `<strong>You:</strong> ${escapeHtml(message)}`;
    } else {
        messageDiv.innerHTML = `<strong>Assistant:</strong> ${escapeHtml(message)}`;
    }
    
    messages.appendChild(messageDiv);
    return messageDiv;
}

function clearChat() {
    const messages = document.getElementById('chat-messages');
    const welcomeMessage = renderMarkdown("Hello! I'm ready to discuss the selected text with you. What would you like to know?");
    messages.innerHTML = `
        <div class="chat-message assistant">
            <strong>Assistant:</strong> ${welcomeMessage}
        </div>
    `;
}

// Text-to-Speech Functions
async function handlePlay() {
    const textarea = document.getElementById('read-textarea');
    const text = textarea.value.trim();
    
    if (!text) return;
    
    if (isPaused && currentAudio) {
        // Resume paused audio
        currentAudio.play();
        isPlaying = true;
        isPaused = false;
        updateTTSButtons('playing');
        showTTSResult('Playing text...');
        return;
    }
    
    const btn = document.getElementById('play-btn');
    const result = document.getElementById('read-result');
    
    btn.disabled = true;
    btn.textContent = 'Generating...';
    
    result.style.display = 'block';
    result.className = 'result loading';
    result.innerHTML = '<strong>Generating speech...</strong><br>Please wait while we convert your text to speech.';
    
    try {
        // Get TTS parameters
        const language = document.getElementById('tts-language').value;
        const speaker = document.getElementById('tts-speaker').value;
        const pace = parseFloat(document.getElementById('tts-pace').value);
        
        // Call Sarvam TTS API
        const response = await callAPI('tts', {
            text: text,
            target_language_code: language,
            speaker: speaker,
            pace: pace
        });
        
        // Create audio element from the response
        if (response.audios && response.audios.length > 0) {
            // Convert base64 audio data to blob
            const audioBlob = base64ToBlob(response.audios[0], 'audio/mpeg');
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Create and play audio
            currentAudio = new Audio(audioUrl);
            currentAudio.onended = () => {
                updateTTSButtons('stopped');
                showTTSResult('Playback completed');
            };
            currentAudio.onerror = () => {
                updateTTSButtons('error');
                showTTSResult('Playback error');
            };
            
            currentAudio.play();
            isPlaying = true;
            isPaused = false;
            
            updateTTSButtons('playing');
            showTTSResult('Playing text...');
        } else {
            throw new Error('No audio data received from API');
        }
        
    } catch (error) {
        console.error('TTS API error:', error);
        result.className = 'result error';
        result.innerHTML = `<strong>Error:</strong> ${error.message}`;
        updateTTSButtons('error');
    } finally {
        btn.disabled = false;
        btn.textContent = '▶️ Play';
    }
}

function handlePause() {
    if (currentAudio && isPlaying) {
        currentAudio.pause();
        isPlaying = false;
        isPaused = true;
        updateTTSButtons('paused');
        showTTSResult('Paused');
    }
}

function handleStop() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
        isPlaying = false;
        isPaused = false;
        updateTTSButtons('stopped');
        showTTSResult('Stopped');
    }
}

function updateTTSButtons(state) {
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    const textarea = document.getElementById('read-textarea');
    const hasText = textarea.value.trim().length > 0;
    
    switch (state) {
        case 'playing':
            playBtn.disabled = true;
            pauseBtn.disabled = false;
            stopBtn.disabled = false;
            break;
        case 'paused':
            playBtn.disabled = false;
            pauseBtn.disabled = true;
            stopBtn.disabled = false;
            break;
        case 'stopped':
        case 'error':
            playBtn.disabled = !hasText;
            pauseBtn.disabled = true;
            stopBtn.disabled = true;
            break;
    }
}

function updatePaceDisplay() {
    const pace = document.getElementById('tts-pace').value;
    document.getElementById('pace-value').textContent = `${pace}x`;
}

function showTTSResult(message) {
    const result = document.getElementById('read-result');
    result.style.display = 'block';
    result.className = 'result';
    result.innerHTML = `<strong>Status:</strong> ${message}`;
}

// Utility function to convert base64 to blob
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

// Translation Functions
async function handleTranslate() {
    const textarea = document.getElementById('translate-textarea');
    const text = textarea.value.trim();
    
    if (!text) return;
    
    const btn = document.getElementById('translate-btn');
    const result = document.getElementById('translate-result');
    const sourceLang = document.getElementById('source-lang').value;
    const targetLang = document.getElementById('target-lang').value;
    
    btn.disabled = true;
    btn.textContent = 'Translating...';
    
    result.style.display = 'block';
    result.className = 'result loading';
    result.innerHTML = '<strong>Translating...</strong><br>Please wait while we translate your text.';
    
    try {
        // Prepare API request data
        const requestData = {
            input: text,
            target_language_code: targetLang,
            speaker_gender: "Male"
        };
        
        // Only include source_language_code if not auto-detect
        if (sourceLang !== 'auto') {
            requestData.source_language_code = sourceLang;
        }
        
        console.log('Translation API request:', requestData);
        const response = await callAPI('translate', requestData);
        
        result.className = 'result';
        
        // Format the response with markdown
        const sourceLangDisplay = sourceLang === 'auto' ? 'Auto-detected' : getLanguageName(sourceLang);
        const targetLangDisplay = getLanguageName(targetLang);
        
        const markdownResponse = `${response.translated_text || response}`;
        
        result.innerHTML = renderMarkdown(markdownResponse);
    } catch (error) {
        result.className = 'result error';
        result.innerHTML = `<strong>Error:</strong> ${error.message}`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Translate Text';
    }
}

// Auto-detect Language Function
async function handleAutoDetect() {
    const textarea = document.getElementById('translate-textarea');
    const text = textarea.value.trim();
    
    if (!text) return;
    
    const btn = document.getElementById('auto-detect-btn');
    const result = document.getElementById('translate-result');
    
    btn.disabled = true;
    btn.textContent = '🔍 Detecting...';
    
    result.style.display = 'block';
    result.className = 'result loading';
    result.innerHTML = '<strong>Detecting language...</strong><br>Please wait while we detect the language of your text.';
    
    try {
        const detectionResponse = await callAPI('detect', {
            input: text
        });
        
        console.log('Language detection response:', detectionResponse);
        
        const detectedSourceLang = detectionResponse.language_code;
        const detectedLanguageName = getLanguageName(detectedSourceLang);
        
        console.log('Detected language code:', detectedSourceLang);
        console.log('Detected language name:', detectedLanguageName);
        
        // Update the source language dropdown to show detected language
        document.getElementById('source-lang').value = detectedSourceLang;
        
        // Show notification about detected language
        showNotification(`Language detected: ${detectedLanguageName}`, 'info');
        
        result.className = 'result';
        result.innerHTML = `<strong>Language Detected!</strong><br>Source language has been set to: <strong>${detectedLanguageName}</strong><br><br>You can now click "Translate Text" to translate your content.`;
        
    } catch (error) {
        console.error('Language detection failed:', error);
        result.className = 'result error';
        result.innerHTML = `<strong>Detection Failed:</strong> ${error.message}<br><br>Please manually select the source language.`;
        showNotification('Language detection failed. Please select manually.', 'warning');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Auto-detect';
    }
}

// API Functions
async function callAPI(endpoint, data) {
    const baseURL = 'http://localhost:8000'; // Local FastAPI server
    
    const apis = {
        summarize: `${baseURL}/summarize`,
        chat: `${baseURL}/chat`,
        translate: `${baseURL}/translate`,
        tts: `${baseURL}/tts`,
        detect: `${baseURL}/detect`
    };
    
    try {
        console.log(`Making ${endpoint} API call to:`, apis[endpoint]);
        console.log('Request data:', data);
        
        const response = await fetch(apis[endpoint], {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response body:', errorText);
            
            if (response.status === 0 || response.status === 503) {
                throw new Error('Backend server is not running. Please start the FastAPI server first.');
            }
            throw new Error(`API Error: ${response.status} - ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('API response:', result);
        
        // Handle different response formats based on endpoint
        switch (endpoint) {
            case 'summarize':
                return result; // Returns {response: "summary text"}
            
            case 'chat':
                return result.choices?.[0]?.message?.content || result.response || 'No response received';
            
            case 'translate':
                return result; // Returns full response object with translated_text, request_id, etc.
            
            case 'detect':
                return result; // Returns {language_code: "detected_lang", script_code: "script", request_id: "id"}
            
            case 'tts':
                return result; // Returns {audios: ["base64_audio"], request_id: "id"}
            
            default:
                return result.response || result.data || result.text || result;
        }
    } catch (error) {
        console.error(`API call failed for ${endpoint}:`, error);
        
        // Provide helpful error messages
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error('Cannot connect to backend server. Please ensure the FastAPI server is running on http://localhost:8000');
        }
        
        throw new Error(`Failed to call ${endpoint} API: ${error.message}`);
    }
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderMarkdown(text) {
    if (!text) return '';
    
    try {
        // Configure marked options
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false
        });
        
        // Render markdown to HTML
        const html = marked.parse(text);
        
        // Wrap in markdown-content class for styling
        return `<div class="markdown-content">${html}</div>`;
    } catch (error) {
        console.error('Markdown rendering error:', error);
        // Fallback to plain text if markdown rendering fails
        return escapeHtml(text);
    }
}

// Helper function to get language name from language code
function getLanguageName(langCode) {
    const languages = {
        'as-IN': 'Assamese',
        'bn-IN': 'Bengali',
        'brx-IN': 'Bodo',
        'doi-IN': 'Dogri',
        'en-IN': 'English',
        'gu-IN': 'Gujarati',
        'hi-IN': 'Hindi',
        'kn-IN': 'Kannada',
        'ks-IN': 'Kashmiri',
        'kok-IN': 'Konkani',
        'mai-IN': 'Maithili',
        'ml-IN': 'Malayalam',
        'mni-IN': 'Manipuri (Meiteilon)',
        'mr-IN': 'Marathi',
        'ne-IN': 'Nepali',
        'od-IN': 'Odia',
        'pa-IN': 'Punjabi',
        'sa-IN': 'Sanskrit',
        'sat-IN': 'Santali',
        'sd-IN': 'Sindhi',
        'ta-IN': 'Tamil',
        'te-IN': 'Telugu',
        'ur-IN': 'Urdu',
        'auto': 'Auto-detected'
    };
    return languages[langCode] || langCode;
}

// Helper function to show notifications
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'info' ? '#4caf50' : type === 'warning' ? '#ff9800' : '#f44336'};
        color: white;
        padding: 10px 16px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.style.opacity = '1', 100);
    
    // Remove after 2 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 2000);
}
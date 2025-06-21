// sidepanel.js - Single Chat Page Logic

// Global state
let currentText = '';
let currentAction = 'chat';
let currentAudio = null;
let isPlaying = false;
let isPaused = false;
let resultsHistory = [];
let selectedMessageId = null; // Track selected message for quick actions
let isTextboxSelected = false; // Track if textbox is selected
let isReadAloudInProgress = false; // Track if read aloud is currently in progress

// --- Voice Input State for Chat Page ---
let isRecordingAudio = false;
let autoRecordingStarted = false; // Flag to prevent multiple auto-starts

// --- MediaRecorder-based Voice Input for Chat Page ---
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
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
        
        if (message.action === 'switchTab') {
            if (message.tabName) {
                // Handle specific tab switching if needed
                if (message.text) {
                    currentText = message.text;
                    updateAllTextareas(message.text);
                    enableButtons();
                }
            } else if (message.text) {
                // No specific tab - just load the text
                currentText = message.text;
                updateAllTextareas(message.text);
                enableButtons();
            }
            
            sendResponse({ success: true });
        }
        
        return true;
    });
    
    // Auto-start voice recording when page loads
    setTimeout(() => {
        autoStartVoiceRecording();
    }, 500);
});

// Setup Event Listeners
function setupEventListeners() {
    // Chat Mic Button
    const chatMicBtn = document.getElementById('chat-mic-btn');
    if (chatMicBtn) {
        chatMicBtn.addEventListener('click', () => {
            if (isRecordingAudio) {
                stopVoiceRecording();
            } else {
                startVoiceRecording();
            }
        });
    }

    // Chat Enter Button
    const chatEnterBtn = document.getElementById('chat-enter-btn');
    if (chatEnterBtn) {
        chatEnterBtn.addEventListener('click', async () => {
            const textarea = document.getElementById('chat-textarea');
            const text = textarea.value.trim();
            if (!text) {
                showNotification('Please enter some text first', 'warning');
                return;
            }
            
            try {
                chatEnterBtn.disabled = true;
                chatEnterBtn.style.opacity = 0.7;
                
                // Step 1: Add user message to chat history immediately
                addResult('chat', 'You', text, {});
                
                // Step 2: Clear the textbox immediately
                textarea.value = '';
                
                // Step 3: Send API call and wait for response
                const response = await callAPI('chat', {
                    message: text,
                    model: "sarvam-m",
                    temperature: 0.5,
                    top_p: 1.0,
                    max_tokens: 1000
                });
                const answer = response.choices?.[0]?.message?.content || response.response || response;
                
                // Step 4: Add AI response to chat history when it arrives
                addResult('chat', 'Assistant', answer, {});
                
            } catch (error) {
                showNotification('Chat failed: ' + error.message, 'error');
            } finally {
                chatEnterBtn.disabled = false;
                chatEnterBtn.style.opacity = 1;
            }
        });
    }

    // Read Aloud Button
    const readAloudBtn = document.getElementById('read-aloud-btn');
    if (readAloudBtn) {
        readAloudBtn.addEventListener('click', async () => {
            const textarea = document.getElementById('chat-textarea');
            const text = textarea.value.trim();
            if (!text) {
                showNotification('Please enter some text first', 'warning');
                return;
            }
            
            try {
                readAloudBtn.disabled = true;
                readAloudBtn.style.opacity = 0.7;
                
                await executeReadAloud(text);
                
            } catch (error) {
                showNotification('Read aloud failed: ' + error.message, 'error');
            } finally {
                readAloudBtn.disabled = false;
                readAloudBtn.style.opacity = 1;
            }
        });
    }

    // Clear History Button
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            clearAllResults();
        });
    }

    // Quick Action Buttons (New small square buttons)
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            
            if (action === 'move-to-input' || action === 'copy-message' || action === 'read-message') {
                // Handle message-specific actions
                handleMessageQuickAction(action);
            }
        });
    });
}

// Message Display Functions
function displayMessage(message) {
    currentText = message.text;
    
    // Update all textareas (only chat textarea now)
    updateTextarea('chat-textarea', message.text);
    
    // Enable buttons
    enableButtons();
    
    // Auto-start voice recording if switching to chat page
    if (message.type === 'chat' || !message.type) {
        // Small delay to ensure the page is fully loaded
        setTimeout(() => {
            autoStartVoiceRecording();
        }, 500);
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
    updateTextarea('chat-textarea', text);
}

function enableButtons() {
    const chatTextarea = document.getElementById('chat-textarea');
    
    // Only enable buttons for elements that exist
    if (chatTextarea) {
        const hasChatText = chatTextarea.value.trim().length > 0;
        const chatEnterBtn = document.getElementById('chat-enter-btn');
        if (chatEnterBtn) {
            chatEnterBtn.disabled = !hasChatText;
        }
        
        // Add focus/blur event listeners for textbox selection
        chatTextarea.addEventListener('focus', () => {
            isTextboxSelected = true;
            selectedMessageId = null; // Clear message selection when textbox is focused
            chatTextarea.classList.add('selected');
            updateQuickActionStates();
        });
        
        chatTextarea.addEventListener('blur', () => {
            isTextboxSelected = false;
            chatTextarea.classList.remove('selected');
            updateQuickActionStates();
        });
    }
}

function showNoSelection() {
    currentText = '';
    updateTextarea('chat-textarea', '');
    enableButtons();
}

function showError(errorMessage) {
    console.error(errorMessage);
    // You can add error display logic here if needed
}

async function executeReadAloud(text) {
    // Prevent duplicate requests
    if (isReadAloudInProgress) {
        showNotification('Read aloud already in progress. Please wait for it to finish.', 'warning');
        return;
    }
    
    // Validate text
    if (!text || text.trim().length === 0) {
        showNotification('No text to read aloud', 'warning');
        return;
    }
    
    // Log the text being sent for debugging
    console.log('=== READ ALOUD DEBUG ===');
    console.log('Text to read:', text);
    console.log('Text length:', text.length);
    console.log('Text trimmed:', text.trim());
    console.log('Text trimmed length:', text.trim().length);
    console.log('Text type:', typeof text);
    console.log('Text contains HTML:', text.includes('<') || text.includes('>'));
    console.log('Text contains markdown:', text.includes('*') || text.includes('_') || text.includes('`'));
    console.log('=======================');
    
    try {
        isReadAloudInProgress = true;
        
        // Disable read aloud button while in progress
        const readMessageBtn = document.querySelector('[data-action="read-message"]');
        if (readMessageBtn) {
            readMessageBtn.disabled = true;
            readMessageBtn.style.opacity = 0.5;
        }
        
        // Clean the text - remove HTML tags and markdown if present
        let cleanText = text.trim();
        
        // Remove HTML tags if present
        if (cleanText.includes('<') || cleanText.includes('>')) {
            cleanText = cleanText.replace(/<[^>]*>/g, '');
            console.log('Removed HTML tags, cleaned text:', cleanText);
        }
        
        // Remove markdown formatting
        cleanText = cleanText
            .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
            .replace(/\*(.*?)\*/g, '$1')     // Italic
            .replace(/`(.*?)`/g, '$1')       // Code
            .replace(/_(.*?)_/g, '$1')       // Underline
            .replace(/~~(.*?)~~/g, '$1');    // Strikethrough
        
        console.log('Final cleaned text for TTS:', cleanText);
        console.log('Final text length:', cleanText.length);
        
        if (cleanText.length === 0) {
            throw new Error('No valid text content after cleaning');
        }
        
        const response = await callAPI('tts', {
            text: cleanText
        });
        
        if (response.audios && response.audios.length > 0) {
            const audioBlob = base64ToBlob(response.audios[0], 'audio/mpeg');
            const audioUrl = URL.createObjectURL(audioBlob);
            
            currentAudio = new Audio(audioUrl);
            
            // Add event listeners to track audio state
            currentAudio.addEventListener('play', () => {
                isPlaying = true;
                showNotification('Audio playback started', 'info');
            });
            
            currentAudio.addEventListener('ended', () => {
                isPlaying = false;
                isReadAloudInProgress = false;
                // Re-enable read aloud button
                if (readMessageBtn) {
                    readMessageBtn.disabled = false;
                    readMessageBtn.style.opacity = 1;
                }
                showNotification('Audio playback finished', 'info');
            });
            
            currentAudio.addEventListener('error', (error) => {
                console.error('Audio playback error:', error);
                isPlaying = false;
                isReadAloudInProgress = false;
                // Re-enable read aloud button
                if (readMessageBtn) {
                    readMessageBtn.disabled = false;
                    readMessageBtn.style.opacity = 1;
                }
                showNotification('Audio playback failed', 'error');
            });
            
            currentAudio.play();
        } else {
            throw new Error('No audio data received from TTS API');
        }
        
    } catch (error) {
        console.error('Read aloud error:', error);
        isReadAloudInProgress = false;
        
        // Re-enable read aloud button
        const readMessageBtn = document.querySelector('[data-action="read-message"]');
        if (readMessageBtn) {
            readMessageBtn.disabled = false;
            readMessageBtn.style.opacity = 1;
        }
        
        showNotification('Text-to-speech failed: ' + error.message, 'error');
    }
}

function updateCurrentText(text) {
    currentText = text;
    document.getElementById('chat-textarea').value = text;
    enableButtons();
}

function addResult(type, title, content, metadata = {}) {
    const timestamp = new Date().toLocaleTimeString();
    const resultItem = {
        id: Date.now(),
        type: type,
        title: title,
        content: content,
        timestamp: timestamp,
        metadata: metadata
    };
    
    resultsHistory.unshift(resultItem);
    renderResults();
    
    // Auto-scroll to top
    const container = document.getElementById('results-container');
    container.scrollTop = 0;
}

function renderResults() {
    const container = document.getElementById('results-container');
    
    if (resultsHistory.length === 0) {
        container.innerHTML = `
            <div class="welcome-message">
                <p>Welcome to your AI Assistant! 🚀</p>
                <p>Select text from any webpage, then use the quick actions below to:</p>
                <ul>
                    <li>🎤 <strong>Voice Input</strong> - Recording starts automatically when you open this page!</li>
                    <li>⬇️ <strong>Move to Input</strong> - Click a message or focus textbox, then use this to copy content</li>
                    <li>📋 <strong>Copy</strong> - Click a message or focus textbox, then use this to copy content</li>
                    <li>🔊 <strong>Read Aloud</strong> - Click a message or focus textbox, then use this to read content</li>
                </ul>
                <p><strong>Tip:</strong> Click on any chat message to select it, or focus the textbox to work with its content!</p>
        </div>
    `;
        return;
    }
    
    // Filter to only show chat messages
    const chatMessages = resultsHistory.filter(result => result.type === 'chat');
    
    if (chatMessages.length === 0) {
        container.innerHTML = `
            <div class="welcome-message">
                <p>Start a conversation by typing a message and clicking send!</p>
        </div>
    `;
        return;
    }
    
    const resultsHTML = chatMessages.map(result => {
        const isSelected = result.id === selectedMessageId;
        return `
            <div class="result-item ${isSelected ? 'selected' : ''}" data-message-id="${result.id}">
                <div class="result-header">
                    <span class="result-type">${result.title}</span>
                    <span class="result-timestamp">${result.timestamp}</span>
                </div>
                <div class="result-content">
                    ${renderMarkdown(result.content)}
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = resultsHTML;
    
    // Add click handlers for message selection
    container.querySelectorAll('.result-item').forEach(item => {
        item.addEventListener('click', () => {
            const messageId = parseInt(item.dataset.messageId);
            selectMessage(messageId);
        });
    });
    
    // Update quick action button states
    updateQuickActionStates();
}

async function readAloudResult(resultId) {
    const result = resultsHistory.find(r => r.id === resultId);
    if (!result) return;
    
    // Use the same executeReadAloud function to ensure consistent behavior
    await executeReadAloud(result.content);
}

function useAsInput(resultId) {
    const result = resultsHistory.find(r => r.id === resultId);
    if (result) {
        updateCurrentText(result.content);
        showNotification('Text updated with result', 'info');
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Copied to clipboard', 'info');
    }).catch(() => {
        showNotification('Failed to copy', 'error');
    });
}

function clearAllResults() {
    resultsHistory = [];
    selectedMessageId = null; // Reset selected message
    renderResults();
    updateQuickActionStates();
    showNotification('All results cleared', 'info');
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

// API Functions
async function callAPI(endpoint, data) {
    const baseURL = 'http://localhost:8000'; // Local FastAPI server
    
    const apis = {
        chat: `${baseURL}/chat`,
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
            case 'chat':
                return result.choices?.[0]?.message?.content || result.response || 'No response received';
            
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

// Helper function to show notifications
function showNotification(message, type = 'info', delay = 2000) {
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
    }, delay);
}

// Auto-start voice recording when chat page opens
async function autoStartVoiceRecording() {
    // Prevent multiple auto-starts
    if (autoRecordingStarted || isRecordingAudio) {
        return;
    }
    
    try {
        // Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            console.log('No active tab found for auto-recording');
            return;
        }
        
        console.log('Auto-starting voice recording for chat page');
        
        // Check if we can inject content script on this page
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('file://')) {
            console.log('Auto-recording not available on this page type');
            return;
        }
        
        // Check if content script is loaded
        try {
            const checkResponse = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
            console.log('Content script ping response for auto-recording:', checkResponse);
        } catch (error) {
            console.log('Content script not responding for auto-recording:', error.message);
            return;
        }
        
        // Request microphone permission
        try {
            const permissionResponse = await chrome.tabs.sendMessage(tab.id, { action: 'requestMicrophonePermission' });
            console.log('Auto-recording permission response:', permissionResponse);
            
            if (!permissionResponse.success || !permissionResponse.permissionGranted) {
                console.log('Microphone permission not granted for auto-recording');
                return;
            }
        } catch (error) {
            console.log('Failed to request microphone permission for auto-recording:', error.message);
            return;
        }
        
        // Start recording
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'startRecording' });
        
        if (response.success) {
            console.log('Auto-recording started successfully');
            isRecordingAudio = true;
            autoRecordingStarted = true;
            updateVoiceUI('recording');
            
            // Update mic button icon to stop
            const chatMicBtn = document.getElementById('chat-mic-btn');
            if (chatMicBtn) {
                const img = chatMicBtn.querySelector('img');
                if (img) {
                    img.src = 'icons/stop.png';
                }
            }
            
            showNotification('Voice recording started automatically. Speak now!', 'info');
        } else {
            console.log('Failed to start auto-recording:', response.error);
        }
        
    } catch (error) {
        console.error('Error in auto-start voice recording:', error);
        // Don't show error notifications for auto-start to avoid being intrusive
    }
}

// --- MediaRecorder-based Voice Input for Chat Page ---
async function startVoiceRecording() {
    try {
        // Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            showNotification('No active tab found. Please refresh the page and try again.', 'error');
            resetVoiceButton();
            return;
        }
        
        console.log('Current tab URL:', tab.url);
        console.log('Current tab ID:', tab.id);
        
        // Check if we can inject content script on this page
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
            showNotification('Voice recording is not available on this page. Please try on a regular website.', 'error');
            resetVoiceButton();
            return;
        }
        
        // Check if the page is accessible
        if (tab.url.startsWith('file://')) {
            showNotification('Voice recording is not available on local files. Please try on a website.', 'error');
            resetVoiceButton();
            return;
        }
        
        console.log('Starting recording via content script in tab:', tab.id);
        
        // First, try to check if content script is loaded
        try {
            const checkResponse = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
            console.log('Content script ping response:', checkResponse);
        } catch (error) {
            console.log('Content script not responding to ping:', error.message);
            showNotification('Content script not loaded. Please refresh the page and try again.', 'error');
            resetVoiceButton();
            return;
        }
        
        // First, request microphone permission
        showNotification('Requesting microphone permission...', 'info');
        
        try {
            const permissionResponse = await chrome.tabs.sendMessage(tab.id, { action: 'requestMicrophonePermission' });
            console.log('Permission response:', permissionResponse);
            
            if (!permissionResponse.success) {
                throw new Error('Failed to request microphone permission');
            }
            
            if (!permissionResponse.permissionGranted) {
                showNotification('Microphone permission denied. Please allow microphone access when prompted.', 'error');
                resetVoiceButton();
                return;
            }
        } catch (error) {
            if (error.message.includes('Could not establish connection')) {
                showNotification('Extension not loaded on this page. Please refresh the page and try again.', 'error');
                resetVoiceButton();
                return;
            }
            throw error;
        }
        
        showNotification('Microphone permission granted! Starting recording...', 'info');
        
        // Now start recording
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'startRecording' });
        
        if (response.success) {
            console.log('Recording started successfully via content script');
            isRecordingAudio = true;
            updateVoiceUI('recording');
            
            // Update mic button color to red and change icon
            const chatMicBtn = document.getElementById('chat-mic-btn');
            if (chatMicBtn) {
                chatMicBtn.style.background = '#e74c3c';
                const img = chatMicBtn.querySelector('img');
                if (img) {
                    img.src = 'icons/stop.png';
                }
            }
            
            showNotification('Recording started. Speak now!', 'info', 800); // Shorter delay
        } else {
            throw new Error(response.error || 'Failed to start recording');
        }
        
    } catch (error) {
        console.error('Error starting recording:', error);
        
        if (error.message.includes('Could not establish connection')) {
            showNotification('Extension not loaded on this page. Please refresh the page and try again.', 'error');
        } else if (error.message.includes('Microphone permission denied')) {
            showNotification('Microphone access denied. Please click the microphone icon in the address bar and allow access, or go to Chrome Settings > Privacy and Security > Site Settings > Microphone', 'error');
        } else {
            showNotification('Failed to start recording: ' + error.message, 'error');
        }
        
        resetVoiceButton();
    }
}

function resetVoiceButton() {
    const chatMicBtn = document.getElementById('chat-mic-btn');
    if (chatMicBtn) {
        chatMicBtn.style.background = 'transparent';
        const img = chatMicBtn.querySelector('img');
        if (img) {
            img.src = 'icons/start.png';
        }
    }
    isRecordingAudio = false;
    autoRecordingStarted = false; // Reset auto-recording flag
    updateVoiceUI('stopped');
}

function stopVoiceRecording() {
    if (isRecordingAudio) {
        stopRecordingViaContentScript();
    }
}

async function stopRecordingViaContentScript() {
    try {
        // Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            showNotification('No active tab found.', 'error');
            resetVoiceButton();
            return;
        }
        
        console.log('Stopping recording via content script in tab:', tab.id);
        
        // Send message to content script to stop recording
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'stopRecording' });
        
        if (response.success) {
            console.log('Recording stopped successfully, processing audio...');
            isRecordingAudio = false;
            autoRecordingStarted = false; // Reset auto-recording flag
            updateVoiceUI('stopped');
            
            // Process the audio data
            await processAudioData(response.audioData, response.audioSize);
            
        } else {
            throw new Error(response.error || 'Failed to stop recording');
        }
        
    } catch (error) {
        console.error('Error stopping recording:', error);
        showNotification('Failed to stop recording: ' + error.message, 'error');
        resetVoiceButton();
    }
}

async function processAudioData(audioData, audioSize) {
    try {
        console.log('Processing audio data, size:', audioSize, 'bytes');
        
        // Convert base64 to blob
        const audioBlob = base64ToBlob(audioData, 'audio/webm');
        const file = new File([audioBlob], 'voice-input.webm', { type: 'audio/webm' });
        
        // Prepare form data
        const formData = new FormData();
        formData.append('file', file);
        formData.append('model', 'saarika:v2.5');
        formData.append('language_code', 'unknown'); // Auto language detection
        
        showNotification('Sending audio for transcription...', 'info');
        
        const response = await fetch('http://localhost:8000/stt', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('STT API error:', response.status, errorText);
            throw new Error(`STT API error: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('STT API response:', result);
        
        const transcript = result.transcript || '';
        if (!transcript) {
            showNotification('No transcript received. Please try speaking more clearly.', 'warning');
            return;
        }
        
        // Always append to existing text
        const textarea = document.getElementById('chat-textarea');
        const currentText = textarea.value.trim();
        
        if (currentText) {
            updateCurrentText(currentText + '\n\n' + transcript);
            showNotification('Voice input: Text appended', 'info');
        } else {
            updateCurrentText(transcript);
            showNotification('Voice input: Text added', 'info');
        }
        
        // Reset the voice button state
        resetVoiceButton();
        
    } catch (error) {
        console.error('Audio processing error:', error);
        showNotification('Failed to process voice input: ' + error.message, 'error');
        
        // Reset the voice button state on error
        resetVoiceButton();
    }
}

function updateVoiceUI(state) {
    // Update voice UI state if needed
    console.log('Voice UI state:', state);
}

function selectMessage(messageId) {
    if (selectedMessageId === messageId) {
        // If clicking the same message, unselect it
        selectedMessageId = null;
    } else {
        // Select the new message
        selectedMessageId = messageId;
    }
    renderResults(); // Re-render to update selection styling
    updateQuickActionStates();
}

function handleMessageQuickAction(action) {
    if (!selectedMessageId && !isTextboxSelected) {
        showNotification('Please select a message or focus the textbox first', 'warning');
        return;
    }
    
    if (isTextboxSelected) {
        // Handle textbox actions
        handleTextboxQuickAction(action);
    } else if (selectedMessageId) {
        // Handle message actions
        const selectedMessage = resultsHistory.find(r => r.id === selectedMessageId);
        if (!selectedMessage) {
            showNotification('Selected message not found', 'error');
            return;
        }
        
        switch (action) {
            case 'move-to-input':
                updateCurrentText(selectedMessage.content);
                showNotification('Message moved to input', 'info');
                break;
            case 'copy-message':
                copyToClipboard(selectedMessage.content);
                break;
            case 'read-message':
                readAloudResult(selectedMessageId);
                break;
        }
    }
}

function handleTextboxQuickAction(action) {
    const textarea = document.getElementById('chat-textarea');
    const text = textarea.value.trim();
    
    if (!text) {
        showNotification('Textbox is empty', 'warning');
        return;
    }
    
    switch (action) {
        case 'move-to-input':
            // Already in input, no action needed
            showNotification('Text is already in the input area', 'info');
            break;
        case 'copy-message':
            copyToClipboard(text);
            break;
        case 'read-message':
            executeReadAloud(text);
            break;
    }
}

function updateQuickActionStates() {
    const moveToInputBtn = document.querySelector('[data-action="move-to-input"]');
    const copyMessageBtn = document.querySelector('[data-action="copy-message"]');
    const readMessageBtn = document.querySelector('[data-action="read-message"]');
    
    const hasSelection = selectedMessageId !== null || isTextboxSelected;
    
    if (moveToInputBtn) moveToInputBtn.disabled = !hasSelection;
    if (copyMessageBtn) copyMessageBtn.disabled = !hasSelection;
    if (readMessageBtn) {
        // Disable read aloud button if no selection OR if read aloud is in progress
        readMessageBtn.disabled = !hasSelection || isReadAloudInProgress;
        if (isReadAloudInProgress) {
            readMessageBtn.style.opacity = 0.5;
        } else {
            readMessageBtn.style.opacity = 1;
        }
    }
}
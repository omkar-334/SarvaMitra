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
let detectedImages = []; // Track all images found on the page
let selectedImageId = null; // Track selected image for quick actions

// --- Chat Context Management ---
let chatContext = {
    text: null,
    image_urls: []
};

// --- Image Detection Caching ---
let currentPageUrl = null; // Track current page URL for caching
let imagesCache = new Map(); // Cache images by URL

// Function to clear image cache (useful for testing or when cache gets too large)
function clearImageCache() {
    imagesCache.clear();
    currentPageUrl = null;
    detectedImages = [];
    console.log('Image cache cleared');
}

// Function to ensure content script is available
async function ensureContentScriptAvailable(tabId) {
    try {
        // First try to ping the content script
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        return true; // Content script is available
    } catch (error) {
        console.log('Content script not available, attempting to inject:', error.message);
        
        try {
            // Try to inject the content script programmatically
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            
            // Wait a bit for the script to initialize
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Try to ping again
            await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            console.log('Content script successfully injected');
            return true;
            
        } catch (injectionError) {
            console.log('Failed to inject content script:', injectionError.message);
            return false;
        }
    }
}

// --- Voice Input State for Chat Page ---
let isRecordingAudio = false;

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
                    // Set as context text instead of updating main textbox
                    setContextText(message.text);
                }
            } else if (message.text) {
                // No specific tab - just set as context text
                setContextText(message.text);
            }
            
            sendResponse({ success: true });
        }
        
        // Handle keyboard shortcut commands
        if (message.action === 'toggleMic') {
            console.log('Sidepanel received toggleMic command');
            const chatMicBtn = document.getElementById('chat-mic-btn');
            if (chatMicBtn) {
                console.log('Found mic button, clicking it');
                chatMicBtn.click();
            } else {
                console.log('Mic button not found in DOM');
            }
            sendResponse({ success: true });
        }
        
        if (message.action === 'sendMessage') {
            console.log('Sidepanel received sendMessage command');
            const chatEnterBtn = document.getElementById('chat-enter-btn');
            if (chatEnterBtn) {
                console.log('Found send button, checking if enabled:', !chatEnterBtn.disabled);
                // Check if we have content to send
                const hasContextText = chatContext.text && chatContext.text.trim().length > 0;
                const hasUserInput = getCurrentUserMessage().trim().length > 0;
                
                console.log('Keyboard shortcut - has context text:', hasContextText, 'has user input:', hasUserInput);
                
                if (hasUserInput || hasContextText) {
                    // Enable the button temporarily for keyboard shortcut
                    const wasDisabled = chatEnterBtn.disabled;
                    if (wasDisabled) {
                        chatEnterBtn.disabled = false;
                        console.log('Temporarily enabled send button for keyboard shortcut');
                    }
                    chatEnterBtn.click();
                    // Re-disable if it was disabled before
                    if (wasDisabled) {
                        setTimeout(() => {
                            chatEnterBtn.disabled = !hasUserInput();
                        }, 100);
                    }
                } else {
                    console.log('No content to send, showing notification');
                    showNotification('Please enter a message or select text from the webpage first', 'warning');
                }
            } else {
                console.log('Send button not found in DOM');
            }
            sendResponse({ success: true });
        }
        
        if (message.action === 'readAloud') {
            console.log('Read aloud action received');
            // Handle async operation properly
            handleReadAloud().then(() => {
                sendResponse({ success: true });
            }).catch(error => {
                console.error('Read aloud error:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true; // Keep message channel open for async response
        }
        
        if (message.action === 'translate') {
            console.log('Translate action received');
            // Handle async operation properly
            handleTranslate().then(() => {
                sendResponse({ success: true });
            }).catch(error => {
                console.error('Translate error:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true; // Keep message channel open for async response
        }
        
        if (message.action === 'enableChunking') {
            console.log('Enable chunking action received');
            // Handle async operation properly
            handleEnableChunking().then(() => {
                sendResponse({ success: true });
            }).catch(error => {
                console.error('Enable chunking error:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true; // Keep message channel open for async response
        }
        
        // Handle chunk selection updates
        if (message.action === 'chunkSelectionsUpdated') {
            console.log('Received chunk selections update:', message);
            updateChunkingStatus(message.selectedCount, message.totalChunks);
            updateContextWithChunks(message.selectedTexts);
            sendResponse({ success: true });
        }
        
        return true;
    });
    
    // Listen for tab updates to clear cache when navigating to different pages
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.url && tab.url !== currentPageUrl) {
            console.log('Page navigation detected, clearing image cache');
            clearImageCache();
        }
    });
    
    // Initialize the textbox with context system
    updateTextboxWithContext();
    
    // Always detect images on the current page when sidebar opens
    // This runs regardless of whether text was selected or sidebar was opened manually
    detectImagesOnPage(); // Removed the setTimeout delay
    
    // Auto-enable chunking for accessibility (enabled by default)
    setTimeout(() => {
        console.log('Starting auto-enable chunking...');
        autoEnableChunking();
    }, 500); // Reduced delay for faster chunking
    
    // Also try again after a longer delay in case the first attempt fails
    setTimeout(() => {
        console.log('Retry auto-enable chunking...');
        autoEnableChunking();
    }, 2000);
    
    // Load chunking state if available
    loadChunkingState();
    
    // Add language dropdown change listener
    const languageSelect = document.getElementById('translation-language');
    if (languageSelect) {
        languageSelect.addEventListener('change', (e) => {
            const selectedLanguage = e.target.value;
            const languageName = e.target.options[e.target.selectedIndex].text;
            console.log('Translation language changed to:', selectedLanguage, languageName);
            showNotification(`Translation language set to ${languageName}`, 'info', 1500);
        });
    }
});

// Setup Event Listeners
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Chat Mic Button
    const chatMicBtn = document.getElementById('chat-mic-btn');
    console.log('Mic button found:', !!chatMicBtn);
    if (chatMicBtn) {
        chatMicBtn.addEventListener('click', () => {
            console.log('Mic button clicked');
            if (isRecordingAudio) {
                stopVoiceRecording();
            } else {
                startVoiceRecording();
            }
        });
    }

    // Chat Enter Button
    const chatEnterBtn = document.getElementById('chat-enter-btn');
    console.log('Send button found:', !!chatEnterBtn);
    if (chatEnterBtn) {
        chatEnterBtn.addEventListener('click', async () => {
            console.log('Chat enter button clicked');
            // Add visual feedback
            chatEnterBtn.style.background = '#ffeb3b';
            setTimeout(() => {
                chatEnterBtn.style.background = 'transparent';
            }, 200);
            
            const userMessage = getCurrentUserMessage();
            console.log('User message:', userMessage);
            console.log('Message length:', userMessage.length);
            
            // Check if there's user input OR context text
            const hasContextText = chatContext.text && chatContext.text.trim().length > 0;
            const hasUserInput = userMessage && userMessage.trim().length > 0;
            
            console.log('Has context text:', hasContextText);
            console.log('Has user input:', hasUserInput);
            
            if (!hasUserInput && !hasContextText) {
                showNotification('Please enter a message or select text from the webpage first', 'warning');
                return;
            }
            
            // If no user input but there's context text, use the context text as the message
            const messageToSend = hasUserInput ? userMessage : chatContext.text;
            console.log('Message to send:', messageToSend);
            
            try {
                chatEnterBtn.disabled = true;
                chatEnterBtn.style.opacity = 0.7;
                
                // Step 1: Add user message to chat history immediately
                addResult('chat', 'You', messageToSend, {});
                
                // Step 2: Clear the textbox after sending (only if user typed something)
                if (hasUserInput) {
                    const textarea = document.getElementById('chat-textarea');
                    textarea.value = '';
                }
                
                // Step 3: Prepare context object for API
                console.log('Current chat context:', chatContext);
                console.log('Context text:', chatContext.text);
                console.log('Context image URLs:', chatContext.image_urls);
                console.log('Image URLs length:', chatContext.image_urls.length);
                
                const context = {
                    text: chatContext.text || null,
                    image_urls: chatContext.image_urls.length > 0 ? chatContext.image_urls : null
                };
                
                console.log('Sending API call with context:', context);
                
                // Step 4: Send API call with new format
                const response = await callAPI('chat', {
                    message: messageToSend,
                    context: context,
                    model: "sarvam-m",
                    temperature: 0.5,
                    top_p: 1.0,
                    max_tokens: 1000
                });
                const answer = response.choices?.[0]?.message?.content || response.response || response;
                
                console.log('API response received:', answer);
                
                // Step 5: Add AI response to chat history when it arrives
                addResult('chat', 'Assistant', answer, {});
                
                // Step 6: Automatically read the assistant response aloud
                try {
                    // Check if auto-read is enabled
                    const autoReadToggle = document.getElementById('auto-read-toggle');
                    if (autoReadToggle && autoReadToggle.checked) {
                        console.log('Reading assistant response aloud...');
                        // Add a small delay to ensure UI has updated
                        setTimeout(async () => {
                            try {
                                await executeReadAloud(answer);
                                showNotification('Reading response aloud', 'info');
                            } catch (error) {
                                console.error('Failed to read response aloud:', error);
                                // Don't show error notification for auto-read to avoid spam
                            }
                        }, 500);
                    } else {
                        console.log('Auto-read is disabled, skipping response reading');
                    }
                } catch (error) {
                    console.error('Failed to schedule response reading:', error);
                    // Don't show error notification for auto-read to avoid spam
                }
                
            } catch (error) {
                console.error('Chat API error:', error);
                showNotification('Chat failed: ' + error.message, 'error');
            } finally {
                chatEnterBtn.disabled = false;
                chatEnterBtn.style.opacity = 1;
            }
        });
    }

    // Read Aloud Button
    const readAloudBtn = document.getElementById('read-content-btn');
    console.log('Read aloud button found:', !!readAloudBtn);
    if (readAloudBtn) {
        readAloudBtn.addEventListener('click', async () => {
            console.log('Read aloud button clicked');
            // Add visual feedback
            readAloudBtn.style.background = '#ffeb3b';
            setTimeout(() => {
                readAloudBtn.style.background = 'transparent';
            }, 200);
            
            // Use the smart read function that handles both chunks and selected content
            readCurrentActiveContent();
        });
    }

    // Clear History Button
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    console.log('Clear history button found:', !!clearHistoryBtn);
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            clearAllResults();
        });
    }

    // Quick Action Buttons (New small square buttons) - REMOVED, using new button system
    // Old quick action listeners removed

    // Copy Content Button
    const copyContentBtn = document.getElementById('copy-content-btn');
    console.log('Copy content button found:', !!copyContentBtn);
    if (copyContentBtn) {
        copyContentBtn.addEventListener('click', () => {
            console.log('Copy content button clicked');
            const textarea = document.getElementById('selected-content-textarea');
            if (textarea && textarea.value.trim()) {
                copyToClipboard(textarea.value);
            } else {
                showNotification('No content to copy', 'warning');
            }
        });
    }
    
    // Chunking Controls
    const chunkWebpageBtn = document.getElementById('chunk-webpage-btn');
    const clearChunksBtn = document.getElementById('clear-chunks-btn');
    
    console.log('Chunk webpage button found:', !!chunkWebpageBtn);
    console.log('Clear chunks button found:', !!clearChunksBtn);
    
    if (chunkWebpageBtn) {
        chunkWebpageBtn.addEventListener('click', async () => {
            console.log('Chunk webpage button clicked');
            await enableChunking();
        });
    }
    
    if (clearChunksBtn) {
        clearChunksBtn.addEventListener('click', async () => {
            console.log('Clear chunks button clicked');
            await clearChunkSelections();
        });
    }
    
    console.log('Event listeners setup complete');
    
    // Test button functionality after a short delay
    setTimeout(() => {
        console.log('=== BUTTON TEST ===');
        const testSendBtn = document.getElementById('chat-enter-btn');
        const testReadBtn = document.getElementById('read-content-btn');
        
        console.log('Send button in test:', !!testSendBtn);
        console.log('Read button in test:', !!testReadBtn);
        
        if (testSendBtn) {
            console.log('Send button disabled:', testSendBtn.disabled);
            console.log('Send button style:', testSendBtn.style.cssText);
        }
        
        if (testReadBtn) {
            console.log('Read button disabled:', testReadBtn.disabled);
            console.log('Read button style:', testReadBtn.style.cssText);
        }
        console.log('=== END BUTTON TEST ===');
    }, 1000);
    
    // Load auto-read preference
    const autoReadToggle = document.getElementById('auto-read-toggle');
    if (autoReadToggle) {
        chrome.storage.sync.get(['autoReadEnabled'], (result) => {
            autoReadToggle.checked = result.autoReadEnabled !== false; // Default to true
        });
        
        // Save preference when changed
        autoReadToggle.addEventListener('change', () => {
            chrome.storage.sync.set({ autoReadEnabled: autoReadToggle.checked });
        });
    }
}

// Message Display Functions
function displayMessage(message) {
    // Set the selected text as context instead of direct textarea update
    setContextText(message.text);
    
    // Update current text for backward compatibility
    currentText = message.text;
    
    // Enable buttons since we have context
    enableButtons();
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
        const hasUserInputText = hasUserInput();
        const chatEnterBtn = document.getElementById('chat-enter-btn');
        if (chatEnterBtn) {
            chatEnterBtn.disabled = !hasUserInputText;
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
        
        // Add input event listener to update button state when user types
        chatTextarea.addEventListener('input', () => {
            const hasUserInputText = hasUserInput();
            const chatEnterBtn = document.getElementById('chat-enter-btn');
            if (chatEnterBtn) {
                chatEnterBtn.disabled = !hasUserInputText;
            }
        });
    }
}

function showNoSelection() {
    // Update current text for backward compatibility
    currentText = '';
    
    // Enable buttons (they will be disabled if no user input)
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
            text: cleanText,
            speaker: "anushka",
            pace: 1.0
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
                    <li>⌨️ <strong>Keyboard Navigation</strong> - Automatically enabled! Use Tab to navigate paragraphs, Space/Enter to select</li>
                    <li>📋 <strong>Copy</strong> - Click a message or focus textbox, then use this to copy content</li>
                    <li>🔊 <strong>Read Aloud</strong> - Click a message or focus textbox, then use this to read content</li>
                </ul>
                <p><strong>Accessibility Tip:</strong> Chunking is automatically enabled! Just press Tab to navigate through webpage paragraphs, then Space or Enter to select!</p>
                <p><strong>Images:</strong> Click on images below to select them for context. Selected images will have blue borders.</p>
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
        detect: `${baseURL}/detect`,
        translate: `${baseURL}/translate`
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
            
            // Try to parse error details for better user feedback
            let errorMessage = `API Error: ${response.status} - ${response.statusText}`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.detail) {
                    errorMessage = errorJson.detail;
                } else if (errorJson.message) {
                    errorMessage = errorJson.message;
                }
            } catch (e) {
                // If we can't parse JSON, use the raw error text
                if (errorText && errorText.length < 200) {
                    errorMessage = errorText;
                }
            }
            
            throw new Error(errorMessage);
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
            
            case 'translate':
                return result; // Returns {translated_text: "text", source_language_code: "lang", request_id: "id"}
            
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
            // Add to main textbox for voice input
            textarea.value = currentText + '\n\n' + transcript;
            showNotification('Voice input: Text appended', 'info');
        } else {
            // Add to main textbox for voice input
            textarea.value = transcript;
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
    const userMessage = getCurrentUserMessage();
    
    if (!userMessage) {
        showNotification('No user message to work with', 'warning');
        return;
    }
    
    switch (action) {
        case 'copy-message':
            copyToClipboard(userMessage);
            break;
        case 'read-message':
            executeReadAloud(userMessage);
            break;
    }
}

// handleImageQuickAction function removed - image input functionality disabled

function updateQuickActionStates() {
    const copyMessageBtn = document.querySelector('[data-action="copy-message"]');
    const readMessageBtn = document.querySelector('[data-action="read-message"]');
    
    const hasSelection = selectedMessageId !== null || isTextboxSelected;
    
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

// Utility function to properly format base64 image URLs
function formatImageUrl(url) {
    if (url.startsWith('data:image/')) {
        // If it's already properly formatted with base64, return as is
        if (url.includes(';base64,')) {
            return url;
        }
        
        // If it's URL-encoded, try to decode it
        try {
            const decodedUrl = decodeURIComponent(url);
            if (decodedUrl.startsWith('data:image/') && decodedUrl.includes(';base64,')) {
                return decodedUrl;
            }
        } catch (e) {
            console.log('Failed to decode URL-encoded base64:', e);
        }
        
        // If we can't properly format it, skip this image
        console.log('Skipping malformed base64 image URL:', url);
        return null;
    }
    
    // For regular URLs, return as is
    return url;
}

// Image Detection Functions
// This function runs every time the sidebar opens, but only detects images once per page
async function detectImagesOnPage() {
    try {
        // Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            console.log('No active tab found for image detection');
            return;
        }
        
        // Check if we can inject content script on this page
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('file://')) {
            console.log('Image detection not available on this page type');
            showNotification('Image detection not available on this page type', 'info');
            return;
        }
        
        // Check if we already have cached images for this page
        if (currentPageUrl === tab.url && imagesCache.has(tab.url)) {
            console.log('Using cached images for page:', tab.url);
            detectedImages = imagesCache.get(tab.url);
            renderImageRow();
            return;
        }
        
        // Page URL has changed or no cache exists, so detect images
        console.log('Detecting images on page:', tab.url);
        currentPageUrl = tab.url;
        
        // Ensure content script is available before attempting image detection
        const contentScriptAvailable = await ensureContentScriptAvailable(tab.id);
        
        if (!contentScriptAvailable) {
            console.log('Content script not available, skipping image detection');
            showNotification('Image detection temporarily unavailable. Please refresh the page and try again.', 'warning');
            // Cache empty result to avoid repeated failed attempts
            imagesCache.set(tab.url, []);
            return;
        }
        
        // Content script is available, now detect images
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectImages' });
        
        if (response && response.success) {
            detectedImages = response.images || [];
            // Cache the detected images for this page
            imagesCache.set(tab.url, detectedImages);
            
            // Limit cache size to prevent memory issues (keep only last 10 pages)
            if (imagesCache.size > 10) {
                const firstKey = imagesCache.keys().next().value;
                imagesCache.delete(firstKey);
            }
            
            console.log('Detected and cached images:', detectedImages);
            renderImageRow();
            
            // Call batch image analysis API with all detected image URLs
            if (detectedImages.length > 0) {
                const imageUrls = detectedImages.map(img => formatImageUrl(img.src)).filter(url => url !== null);
                console.log('Calling batch image analysis API with URLs:', imageUrls);
                
                // Make the API call non-blocking so it doesn't affect the UI
                setTimeout(async () => {
                    try {
                        // First check if backend server is available
                        const healthCheck = await fetch('http://localhost:8000/health', { 
                            method: 'GET',
                            signal: AbortSignal.timeout(3000) // 3 second timeout
                        });
                        
                        if (!healthCheck.ok) {
                            console.log('Backend server health check failed, skipping batch image analysis');
                            return;
                        }
                        
                        const healthResult = await healthCheck.json();
                        if (healthResult.status !== 'ok') {
                            console.log('Backend server not healthy, skipping batch image analysis');
                            return;
                        }
                        
                        console.log('Backend server is healthy, proceeding with batch image analysis');
                        
                        const batchResponse = await fetch('http://localhost:8000/batch/image', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(imageUrls), // Send properly formatted URLs
                            signal: AbortSignal.timeout(10000) // 10 second timeout
                        });
                        
                        if (batchResponse.ok) {
                            const batchResult = await batchResponse.json();
                            console.log('Batch image analysis started:', batchResult);
                            showNotification(`Image analysis started for ${imageUrls.length} images`, 'info');
                        } else {
                            console.error('Batch image analysis failed:', batchResponse.status, batchResponse.statusText);
                        }
                    } catch (error) {
                        if (error.name === 'AbortError') {
                            console.log('Batch image analysis request timed out');
                        } else {
                            console.error('Error calling batch image analysis API:', error);
                        }
                        // Don't show error notification to user as this is a background task
                    }
                }, 100); // Small delay to ensure UI rendering is not blocked
            }
        }
    } catch (error) {
        console.error('Error detecting images:', error);
        showNotification('Failed to detect images: ' + error.message, 'error');
    }
}

function renderImageRow() {
    const imageRow = document.getElementById('image-row');
    if (!imageRow) return;
    
    if (detectedImages.length === 0) {
        imageRow.style.display = 'none';
        return;
    }
    
    imageRow.style.display = 'block';
    
    const imageContainer = document.getElementById('image-container');
    const imagesHTML = detectedImages.map((image, index) => {
        const formattedUrl = formatImageUrl(image.src);
        const isInContext = formattedUrl && chatContext.image_urls.includes(formattedUrl);
        
        return `
            <div class="image-item ${isInContext ? 'selected' : ''}" data-image-id="${image.id}" title="${image.alt || 'Image'}" style="position:relative;">
                <img src="${image.src}" crossorigin="anonymous" alt="${image.alt || 'Image'}"
                    onerror="this.style.display='none'; this.parentNode.querySelector('.image-number').style.display='block';"
                    style="width:100%;height:100%;object-fit:cover;display:block;" />
                <span class="image-number" style="display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:4px 8px;border-radius:12px;border:1px solid #ddd;">${index + 1}</span>
            </div>
        `;
    }).join('');

    imageContainer.innerHTML = imagesHTML;

    // Add click handlers for image selection
    imageContainer.querySelectorAll('.image-item').forEach(item => {
        item.addEventListener('click', () => {
            const imageId = item.dataset.imageId;
            selectImage(imageId);
        });
    });

    // Update quick action button states
    updateQuickActionStates();
}

function selectImage(imageId) {
    const selectedImage = detectedImages.find(img => img.id === imageId);
    if (!selectedImage) {
        console.log('Selected image not found');
        return;
    }
    
    console.log('Selecting image:', selectedImage);
    
    // Format the image URL properly
    const formattedUrl = formatImageUrl(selectedImage.src);
    if (!formattedUrl) {
        console.log('Skipping image with malformed URL:', selectedImage.src);
        showNotification('Image URL format not supported', 'warning');
        return;
    }
    
    console.log('Formatted URL:', formattedUrl);
    
    // Check if image is already in context
    const isInContext = chatContext.image_urls.includes(formattedUrl);
    console.log('Is image in context:', isInContext);
    console.log('Current context image URLs:', chatContext.image_urls);
    
    if (isInContext) {
        // Remove from context
        const index = chatContext.image_urls.indexOf(formattedUrl);
        chatContext.image_urls.splice(index, 1);
        console.log('Image removed from context:', formattedUrl);
    } else {
        // Add to context
        chatContext.image_urls.push(formattedUrl);
        console.log('Image added to context:', formattedUrl);
    }
    
    console.log('Updated context image URLs:', chatContext.image_urls);
    
    // Focus on the image on the webpage using the correct image ID
    focusOnImage(selectedImage.id);
    
    // Update the display
    renderImageRow();
    updateTextboxWithContext();
    updateQuickActionStates();
}

// --- Chat Context Management Functions ---
function setContextText(text) {
    if (text && text.trim()) {
        chatContext.text = text.trim();
        console.log('Context text set:', chatContext.text);
        
        // Only update the selected content textarea, not the main prompt textbox
        updateSelectedContentTextarea();
        
        // Update button state since we now have context
        const chatEnterBtn = document.getElementById('chat-enter-btn');
        if (chatEnterBtn) {
            chatEnterBtn.disabled = !hasUserInput();
            console.log('Updated send button state - disabled:', chatEnterBtn.disabled);
        }
    }
}

function addContextImageUrl(imageUrl) {
    if (!chatContext.image_urls.includes(imageUrl)) {
        chatContext.image_urls.push(imageUrl);
        updateTextboxWithContext();
        console.log('Context image URL added:', imageUrl);
    }
}

function updateSelectedContentTextarea() {
    const textarea = document.getElementById('selected-content-textarea');
    if (!textarea) return;
    
    let content = '';
    
    // Add context text if available (raw text, no labels)
    if (chatContext.text) {
        content += chatContext.text;
    }
    
    // Add a separator if both text and images are present
    if (chatContext.text && chatContext.image_urls.length > 0) {
        content += '\n\n';
    }
    
    // Add image count if available (simple format)
    if (chatContext.image_urls.length > 0) {
        content += `${chatContext.image_urls.length} image(s) selected`;
    }
    
    textarea.value = content;
    
    // Update placeholder to show chunk status
    if (chatContext.text && chatContext.text.includes('\n\n')) {
        // If text contains multiple paragraphs, it's likely from chunking
        const chunkCount = (chatContext.text.match(/\n\n/g) || []).length + 1;
        textarea.placeholder = `${chunkCount} chunk(s) selected from webpage`;
    } else if (chatContext.text) {
        textarea.placeholder = 'Text selected from webpage';
    } else if (chatContext.image_urls.length > 0) {
        textarea.placeholder = `${chatContext.image_urls.length} image(s) selected`;
    } else {
        textarea.placeholder = 'Selected content will appear here...';
    }
}

function updateTextboxWithContext() {
    const textarea = document.getElementById('chat-textarea');
    if (!textarea) return;
    
    // Don't clear the main textbox - preserve user input
    // Only update the selected content textarea
    updateSelectedContentTextarea();
}

function getCurrentUserMessage() {
    const textarea = document.getElementById('chat-textarea');
    if (!textarea) return '';
    
    // Simply return the textarea value since there's no context display
    return textarea.value.trim();
}

function hasUserInput() {
    const userMessage = getCurrentUserMessage();
    const hasUserText = userMessage.length > 0;
    const hasContextText = chatContext.text && chatContext.text.trim().length > 0;
    
    console.log('hasUserInput check - user text:', hasUserText, 'context text:', hasContextText);
    
    return hasUserText || hasContextText;
}

async function focusOnImage(imageId) {
    try {
        console.log('Focusing on image with ID:', imageId);
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            console.error('No active tab found for image focusing');
            showNotification('No active tab found.', 'error');
            return;
        }
        
        console.log('Sending focus message to tab:', tab.id);
        
        // Send message to content script to focus on the image
        const response = await chrome.tabs.sendMessage(tab.id, { 
            action: 'focusOnImage', 
            imageId: imageId 
        });
        
        console.log('Focus response:', response);
        
        if (response && response.success) {
            showNotification('Image focused on webpage', 'info');
        } else {
            console.error('Focus failed:', response?.error || 'Unknown error');
            showNotification('Failed to focus on image', 'error');
        }
        
    } catch (error) {
        console.error('Error focusing on image:', error);
        showNotification('Failed to focus on image: ' + error.message, 'error');
    }
}

// Function to clear the image map (useful for cleanup)
function clearImageMap() {
    if (window.sarvamImageMap) {
        window.sarvamImageMap.clear();
        console.log('Image map cleared');
    }
}

// --- Chunking Functions for Accessibility ---

// Enable chunking mode
async function enableChunking() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            showNotification('No active tab found', 'error');
            return;
        }
        
        console.log('Enabling chunking for tab:', tab.id);
        
        // Check if we can inject content script on this page
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('file://')) {
            showNotification('Chunking is not available on this page type. Please try on a regular website.', 'error');
            return;
        }
        
        // Try to enable chunking with retry logic
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                console.log(`Attempt ${retryCount + 1} to enable chunking`);
                
                // First check if content script is available
                await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
                console.log('Content script is available, enabling chunking...');
                
                // Send message to content script to enable chunking
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'chunkWebpage' });
                
                if (response.success) {
                    console.log('Chunking enabled:', response.message);
                    showChunkingControls(true);
                    updateChunkingStatus(0, response.chunkCount);
                    updateContextWithChunks([]);
                    
                    // Show notification with focus information
                    if (response.chunkCount > 0) {
                        showNotification(`Chunking enabled! ${response.chunkCount} chunks available. First chunk auto-focused. Use Tab to navigate, Enter/Space to select.`, 'info');
                    } else {
                        showNotification('Chunking enabled but no chunks found on this page.', 'warning');
                    }
                    return; // Success, exit the retry loop
                } else {
                    throw new Error(response.error || 'Failed to enable chunking');
                }
                
            } catch (error) {
                retryCount++;
                console.log(`Chunking attempt ${retryCount} failed:`, error.message);
                
                if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
                    // Content script not ready, wait and retry
                    if (retryCount < maxRetries) {
                        console.log(`Waiting ${retryCount * 1000}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
                        
                        // Try to inject content script if it's not loaded
                        try {
                            await chrome.scripting.executeScript({
                                target: { tabId: tab.id },
                                files: ['content.js']
                            });
                            console.log('Content script injected, will retry...');
                            await new Promise(resolve => setTimeout(resolve, 500)); // Wait for script to initialize
                        } catch (injectionError) {
                            console.log('Failed to inject content script:', injectionError.message);
                        }
                    } else {
                        console.log('Max retries reached, giving up on chunking');
                        showNotification('Failed to enable chunking: Content script not available. Please refresh the page and try again.', 'error');
                        return;
                    }
                } else {
                    // Other error, don't retry
                    console.log('Non-connection error, not retrying:', error.message);
                    showNotification('Failed to enable chunking: ' + error.message, 'error');
                    return;
                }
            }
        }
        
    } catch (error) {
        console.error('Error enabling chunking:', error);
        showNotification('Failed to enable chunking: ' + error.message, 'error');
    }
}

// Clear chunk selections
async function clearChunkSelections() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            showNotification('No active tab found', 'error');
            return;
        }
        
        console.log('Clearing chunk selections for tab:', tab.id);
        
        // Send message to content script to clear selections
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'clearChunkSelections' });
        
        if (response.success) {
            console.log('Chunk selections cleared');
            updateChunkingStatus(0, 0);
            updateContextWithChunks([]);
            showNotification('Chunk selections cleared', 'info');
        } else {
            throw new Error(response.error || 'Failed to clear chunk selections');
        }
        
    } catch (error) {
        console.error('Error clearing chunk selections:', error);
        showNotification('Failed to clear chunk selections: ' + error.message, 'error');
    }
}

// Show/hide chunking controls
function showChunkingControls(show) {
    const chunkingRow = document.getElementById('chunking-row');
    const chunkingInstructions = document.getElementById('chunking-instructions');
    
    if (chunkingRow) {
        chunkingRow.style.display = show ? 'block' : 'none';
    }
    
    if (chunkingInstructions) {
        chunkingInstructions.style.display = show ? 'block' : 'none';
    }
}

// Update chunking status display
function updateChunkingStatus(selectedCount, totalChunks) {
    const chunkingStatus = document.getElementById('chunking-status');
    const chunkingInstructions = document.getElementById('chunking-instructions');
    
    if (chunkingStatus) {
        if (totalChunks > 0) {
            chunkingStatus.innerHTML = `
                <strong>🎯 Chunking Active:</strong> ${selectedCount} of ${totalChunks} chunks selected
                ${selectedCount > 0 ? '<br><small>Selected chunks are now in context!</small>' : '<br><small>Use Tab to navigate, Space/Enter to select</small>'}
            `;
            chunkingStatus.style.color = selectedCount > 0 ? '#4caf50' : '#1976d2';
        } else {
            chunkingStatus.innerHTML = `
                <strong>⌨️ Keyboard Navigation</strong><br>
                <small>Should be automatically enabled. Click ⌨️ button if not working.</small>
            `;
            chunkingStatus.style.color = '#666';
        }
    }
    
    if (chunkingInstructions) {
        chunkingInstructions.style.display = totalChunks > 0 ? 'block' : 'none';
    }
}

// Update context with selected chunks
function updateContextWithChunks(selectedTexts) {
    if (selectedTexts.length > 0) {
        // Combine all selected chunks into context text
        const combinedText = selectedTexts.join('\n\n');
        setContextText(combinedText);
        console.log('Updated context with', selectedTexts.length, 'chunks');
    } else {
        // Clear context text if no chunks selected
        chatContext.text = null;
        updateSelectedContentTextarea();
        console.log('Cleared context text');
    }
}

// Load chunking state on startup
async function loadChunkingState() {
    try {
        const result = await chrome.storage.session.get(['selectedChunks']);
        const selectedChunks = result.selectedChunks;
        
        if (selectedChunks && selectedChunks.texts) {
            console.log('Loading chunking state:', selectedChunks);
            showChunkingControls(true);
            updateChunkingStatus(selectedChunks.count, selectedChunks.totalChunks);
            updateContextWithChunks(selectedChunks.texts);
        }
    } catch (error) {
        console.error('Error loading chunking state:', error);
    }
}

// Auto-enable chunking for accessibility
async function autoEnableChunking() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            console.log('No active tab found for auto-chunking');
            return;
        }
        
        console.log('Auto-enabling chunking for tab:', tab.id);
        
        // Check if we can inject content script on this page
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('file://')) {
            console.log('Auto-chunking not available on this page type');
            return;
        }
        
        // Try to enable chunking with retry logic
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                console.log(`Attempt ${retryCount + 1} to auto-enable chunking`);
                
                // First check if content script is available
                await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
                console.log('Content script is available, enabling chunking...');
                
                // Send message to content script to enable chunking
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'chunkWebpage' });
                
                if (response.success) {
                    console.log('Chunking enabled:', response.message);
                    showChunkingControls(true);
                    updateChunkingStatus(0, response.chunkCount);
                    updateContextWithChunks([]);
                    
                    // Show notification with focus information
                    if (response.chunkCount > 0) {
                        showNotification(`Chunking enabled! ${response.chunkCount} chunks available. First chunk auto-focused. Use Tab to navigate, Enter/Space to select.`, 'info');
                    } else {
                        showNotification('Chunking enabled but no chunks found on this page.', 'warning');
                    }
                    return; // Success, exit the retry loop
                } else {
                    throw new Error(response.error || 'Failed to enable chunking');
                }
                
            } catch (error) {
                retryCount++;
                console.log(`Auto-chunking attempt ${retryCount} failed:`, error.message);
                
                if (error.message.includes('Could not establish connection') || error.message.includes('Receiving end does not exist')) {
                    // Content script not ready, wait and retry
                    if (retryCount < maxRetries) {
                        console.log(`Waiting ${retryCount * 1000}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
                        
                        // Try to inject content script if it's not loaded
                        try {
                            await chrome.scripting.executeScript({
                                target: { tabId: tab.id },
                                files: ['content.js']
                            });
                            console.log('Content script injected, will retry...');
                            await new Promise(resolve => setTimeout(resolve, 500)); // Wait for script to initialize
                        } catch (injectionError) {
                            console.log('Failed to inject content script:', injectionError.message);
                        }
                    } else {
                        console.log('Max retries reached, giving up on auto-chunking');
                        // Don't show error notification for auto-enable to avoid spam
                        return;
                    }
                } else {
                    // Other error, don't retry
                    console.log('Non-connection error, not retrying:', error.message);
                    return;
                }
            }
        }
        
    } catch (error) {
        console.error('Error auto-enabling chunking:', error);
        // Don't show error notification for auto-enable to avoid spam
        console.log('Auto-enable chunking failed (this is normal for some pages):', error.message);
    }
}

// Read whatever content is currently active (chunk or selected content)
async function readCurrentActiveContent() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            showNotification('No active tab found', 'error');
            return;
        }
        
        console.log('Reading current active content for tab:', tab.id);
        
        // First, try to get the current active chunk from content script
        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getCurrentActiveChunk' });
            
            if (response && response.success && response.chunkText) {
                console.log('Found active chunk, reading it aloud');
                executeReadAloud(response.chunkText);
                showNotification('Reading current chunk aloud', 'info');
                return;
            }
        } catch (error) {
            console.log('No active chunk found or content script not available:', error.message);
        }
        
        // If no active chunk, fall back to reading selected content
        const textarea = document.getElementById('selected-content-textarea');
        if (textarea && textarea.value.trim()) {
            console.log('Reading selected content aloud');
            executeReadAloud(textarea.value);
            showNotification('Reading selected content aloud', 'info');
        } else {
            console.log('No content to read');
            showNotification('No content to read. Select text or navigate to a chunk first.', 'warning');
        }
        
    } catch (error) {
        console.error('Error reading current active content:', error);
        showNotification('Failed to read content: ' + error.message, 'error');
    }
}

// Handler functions for keyboard shortcuts
async function handleReadAloud() {
    console.log('Handling read aloud...');
    await readCurrentActiveContent();
}

async function handleTranslate() {
    console.log('Handling translate...');
    await translateCurrentActiveContent();
}

async function handleEnableChunking() {
    console.log('Handling enable chunking...');
    await enableChunking();
}

// Translate current active content
async function translateCurrentActiveContent() {
    try {
        // Get the selected language
        const languageSelect = document.getElementById('translation-language');
        const targetLanguage = languageSelect ? languageSelect.value : 'hi-IN';
        
        console.log('Target language for translation:', targetLanguage);
        
        // Get current active content (chunk or selected text)
        let textToTranslate = '';
        let elementToReplace = null;
        let isChunk = false;
        
        // First try to get active chunk
        const activeChunk = await getCurrentActiveChunk();
        if (activeChunk && activeChunk.chunkText) {
            textToTranslate = activeChunk.chunkText;
            isChunk = true;
            console.log('Using active chunk for translation:', textToTranslate);
        } else {
            // Fallback to selected content
            const selectedContentTextarea = document.getElementById('selected-content-textarea');
            if (selectedContentTextarea && selectedContentTextarea.value.trim()) {
                textToTranslate = selectedContentTextarea.value.trim();
                elementToReplace = selectedContentTextarea;
                console.log('Using selected content for translation:', textToTranslate);
            } else {
                // Fallback to chat textarea
                const chatTextarea = document.getElementById('chat-textarea');
                if (chatTextarea && chatTextarea.value.trim()) {
                    textToTranslate = chatTextarea.value.trim();
                    elementToReplace = chatTextarea;
                    console.log('Using chat textarea for translation:', textToTranslate);
                }
            }
        }
        
        if (!textToTranslate.trim()) {
            showNotification('No content to translate. Please select text or navigate to a chunk first.', 'warning');
            return;
        }
        
        console.log('Text to translate:', textToTranslate);
        
        // Call translation API
        console.log('Making translation API call with data:', {
            input: textToTranslate,
            source_language_code: "auto",
            target_language_code: targetLanguage,
            speaker_gender: "Male"
        });
        
        const response = await callAPI('translate', {
            input: textToTranslate,
            source_language_code: "auto",
            target_language_code: targetLanguage,
            speaker_gender: "Male"
        });
        
        console.log('Translation API response received:', response);
        
        if (response && response.translated_text) {
            console.log('Translation result:', response);
            
            // Replace the original text with translated text
            if (isChunk) {
                // Replace chunk content in the webpage
                try {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tab) {
                        await chrome.tabs.sendMessage(tab.id, {
                            action: 'replaceChunkText',
                            chunkIndex: activeChunk.chunkIndex,
                            translatedText: response.translated_text
                        });
                        console.log('Replaced chunk text in webpage');
                    }
                } catch (error) {
                    console.error('Failed to replace chunk text:', error);
                }
            } else if (elementToReplace) {
                // Replace textarea content
                elementToReplace.value = response.translated_text;
                console.log('Replaced textarea content');
            }
            
            // Add translation result to chat for reference
            const languageName = languageSelect.options[languageSelect.selectedIndex].text;
            const resultTitle = `Translation to ${languageName}`;
            const resultContent = `**Original:** ${textToTranslate}\n\n**Translated:** ${response.translated_text}`;
            
            addResult('translation', resultTitle, resultContent, {
                originalText: textToTranslate,
                translatedText: response.translated_text,
                targetLanguage: targetLanguage,
                sourceLanguage: response.source_language_code
            });
            
            showNotification(`Content translated to ${languageName}`, 'success');
        } else {
            throw new Error('No translation result received');
        }
        
    } catch (error) {
        console.error('Translation error:', error);
        showNotification(`Translation failed: ${error.message}`, 'error');
    }
}

// Get current active chunk from content script
async function getCurrentActiveChunk() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            console.log('No active tab found');
            return null;
        }
        
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getCurrentActiveChunk' });
        console.log('Active chunk response:', response);
        return response;
        
    } catch (error) {
        console.error('Error getting active chunk:', error);
        return null;
    }
}
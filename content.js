// content.js - Content script for microphone access

console.log('Sarvam content script loaded for microphone access');

let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let isRecording = false;
let permissionIframe = null;
let permissionGranted = false;

// --- Webpage Chunking for Accessibility ---
let webpageChunks = [];
let currentChunkIndex = -1;
let selectedChunks = new Set();

// Define selectors for meaningful content chunks
const CHUNK_SELECTORS = [
    "p",
    "li", 
    "blockquote",
    "article",
    "section",
    "div:has(> p)",
    "main",
    "h1", "h2", "h3", "h4", "h5", "h6",
    ".content",
    ".text",
    ".paragraph"
];

// Inject the permission iframe
function injectMicrophonePermissionIframe() {
    if (permissionIframe) {
        return; // Already injected
    }
    
    console.log('Injecting microphone permission iframe...');
    
    permissionIframe = document.createElement("iframe");
    permissionIframe.setAttribute("hidden", "hidden");
    permissionIframe.setAttribute("id", "sarvam-permissions-iframe");
    permissionIframe.setAttribute("allow", "microphone");
    permissionIframe.src = chrome.runtime.getURL("permission.html");
    
    // Listen for messages from the iframe
    window.addEventListener('message', (event) => {
        if (event.data.type === 'MICROPHONE_PERMISSION_GRANTED') {
            console.log('Microphone permission granted via iframe');
            permissionGranted = true;
        } else if (event.data.type === 'MICROPHONE_PERMISSION_DENIED') {
            console.log('Microphone permission denied via iframe:', event.data.error);
            permissionGranted = false;
        }
    });
    
    document.body.appendChild(permissionIframe);
    console.log('Permission iframe injected successfully');
}

// Inject the iframe when the content script loads
injectMicrophonePermissionIframe();

// Listen for messages from the side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);
    
    if (message.action === 'ping') {
        console.log('Content script ping received');
        sendResponse({ success: true, message: 'Content script is loaded' });
        return true;
    }
    
    if (message.action === 'startRecording') {
        startRecording().then(result => {
            sendResponse(result);
        });
        return true; // Keep the message channel open for async response
    }
    
    if (message.action === 'stopRecording') {
        stopRecording().then(result => {
            sendResponse(result);
        });
        return true;
    }
    
    if (message.action === 'checkMicrophonePermission') {
        checkMicrophonePermission().then(result => {
            sendResponse(result);
        });
        return true;
    }
    
    if (message.action === 'requestMicrophonePermission') {
        requestMicrophonePermission().then(result => {
            sendResponse(result);
        });
        return true;
    }
    
    if (message.action === 'detectImages') {
        detectImages().then(result => {
            sendResponse(result);
        });
        return true;
    }
    
    if (message.action === 'focusOnImage') {
        focusOnImage(message.imageId).then(result => {
            sendResponse(result);
        });
        return true;
    }
});

async function requestMicrophonePermission() {
    try {
        // Ensure the iframe is injected
        if (!permissionIframe) {
            injectMicrophonePermissionIframe();
        }
        
        // Request permission through the iframe
        if (permissionIframe && permissionIframe.contentWindow) {
            permissionIframe.contentWindow.postMessage({
                type: 'REQUEST_MICROPHONE_PERMISSION'
            }, '*');
        }
        
        // Wait a bit for the permission request to process
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return { success: true, permissionGranted: permissionGranted };
        
    } catch (error) {
        console.error('Error requesting microphone permission:', error);
        return { success: false, error: error.message };
    }
}

async function checkMicrophonePermission() {
    try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        console.log('Microphone permission status:', permissionStatus.state);
        return { success: true, permission: permissionStatus.state };
    } catch (error) {
        console.error('Error checking microphone permission:', error);
        return { success: false, error: error.message };
    }
}

async function startRecording() {
    try {
        console.log('Starting recording in content script...');
        
        // Check if we have permission
        if (!permissionGranted) {
            // Try to request permission first
            const permissionResult = await requestMicrophonePermission();
            if (!permissionResult.permissionGranted) {
                return { success: false, error: 'Microphone permission not granted' };
            }
        }
        
        // Check permission status
        const permissionResult = await checkMicrophonePermission();
        if (permissionResult.permission === 'denied') {
            return { success: false, error: 'Microphone permission denied' };
        }
        
        // Request microphone access
        audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            } 
        });
        
        console.log('Microphone access granted in content script');
        
        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(audioStream, {
            mimeType: 'audio/webm;codecs=opus'
        });
        
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            console.log('Recording stopped in content script');
            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
                audioStream = null;
            }
        };
        
        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error in content script:', event);
        };
        
        // Start recording
        mediaRecorder.start();
        isRecording = true;
        
        return { success: true, message: 'Recording started' };
        
    } catch (error) {
        console.error('Error starting recording in content script:', error);
        return { success: false, error: error.message };
    }
}

async function stopRecording() {
    try {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            
            // Wait for the ondataavailable event to fire
            return new Promise((resolve) => {
                mediaRecorder.onstop = () => {
                    if (audioStream) {
                        audioStream.getTracks().forEach(track => track.stop());
                        audioStream = null;
                    }
                    
                    if (audioChunks.length > 0) {
                        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                        const reader = new FileReader();
                        reader.onload = () => {
                            const base64Audio = reader.result.split(',')[1]; // Remove data URL prefix
                            resolve({ 
                                success: true, 
                                audioData: base64Audio,
                                audioSize: audioBlob.size 
                            });
                        };
                        reader.readAsDataURL(audioBlob);
                    } else {
                        resolve({ success: false, error: 'No audio recorded' });
                    }
                };
            });
        } else {
            return { success: false, error: 'No active recording' };
        }
    } catch (error) {
        console.error('Error stopping recording in content script:', error);
        return { success: false, error: error.message };
    }
}

// Inject a helper function into the page for debugging
window.addEventListener('load', () => {
    console.log('Content script loaded for microphone access');
});

// Clear image map when page is refreshed or navigated away
window.addEventListener('beforeunload', () => {
    clearImageMap();
});

// Also clear on page visibility change (in case of SPA navigation)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        clearImageMap();
    }
});

// Image detection and focusing functions
async function detectImages() {
    try {
        const images = Array.from(document.querySelectorAll('img')).filter(img => {
            const rect = img.getBoundingClientRect();
            
            // More strict visibility checks
            const isVisible = rect.width > 0 && rect.height > 0;
            const isLargeEnough = rect.width >= 50 && rect.height >= 50;
            const hasSrc = img.src && img.src.trim() !== '';
            
            // Check if image is actually in viewport or close to it
            const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
            const isNearViewport = Math.abs(rect.top) < window.innerHeight * 2; // Within 2 viewport heights
            
            // More strict filtering for spam/hidden images
            const isNotIcon = !/icon|logo|favicon|sprite|avatar|emoji|button|nav|menu|header|footer/i.test(img.src);
            const isNotHidden = !img.hidden && img.style.display !== 'none' && img.style.visibility !== 'hidden';
            const hasReasonableAspectRatio = rect.width / rect.height > 0.1 && rect.width / rect.height < 10;
            
            // Check if image is actually loaded and has content
            const isLoaded = img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
            
            return isVisible && isLargeEnough && hasSrc && isNotIcon && isNotHidden && 
                   hasReasonableAspectRatio && (isInViewport || isNearViewport) && isLoaded;
        });
        
        // Create a map to store image references by ID
        window.sarvamImageMap = new Map();
        
        const imageData = images.map((img, index) => {
            const imageId = `img_${index}_${Date.now()}`;
            // Store reference to the actual DOM element
            window.sarvamImageMap.set(imageId, img);
            
            // Handle base64 URLs properly
            let processedSrc = img.src;
            if (processedSrc.startsWith('data:image/')) {
                // If it's already a proper base64 URL, keep it
                if (processedSrc.includes(';base64,')) {
                    // Already properly formatted
                } else {
                    // URL-encoded base64, decode it
                    try {
                        const decodedSrc = decodeURIComponent(processedSrc);
                        if (decodedSrc.startsWith('data:image/')) {
                            processedSrc = decodedSrc;
                        }
                    } catch (e) {
                        console.log('Failed to decode URL-encoded base64:', e);
                    }
                }
            }
            
            return {
                id: imageId,
                src: processedSrc,
                alt: img.alt || '',
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height
            };
        });
        
        console.log("Extracted images:", imageData.map(img => img.src));
        console.log("Image map created with", window.sarvamImageMap.size, "entries");
        return { success: true, images: imageData };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Function to clear the image map (useful for cleanup)
function clearImageMap() {
    if (window.sarvamImageMap) {
        window.sarvamImageMap.clear();
        console.log('Image map cleared');
    }
}

async function focusOnImage(imageId) {
    try {
        console.log('Focusing on image:', imageId);
        console.log('Available images in map:', window.sarvamImageMap ? Array.from(window.sarvamImageMap.keys()) : 'No map');
        
        // Get the actual DOM element from our map
        let targetImage = window.sarvamImageMap?.get(imageId);
        
        if (!targetImage) {
            console.log('Image not found in map, trying fallback method...');
            
            // Fallback: try to find by the original element reference
            const images = Array.from(document.querySelectorAll('img'));
            const imageIndex = parseInt(imageId.split('_')[1]);
            const fallbackImage = images[imageIndex];
            
            if (!fallbackImage) {
                console.log('Fallback image not found at index:', imageIndex);
                return { success: false, error: 'Image not found' };
            }
            
            console.log('Using fallback image at index:', imageIndex);
            // Use fallback image
            targetImage = fallbackImage;
        } else {
            console.log('Found image in map, using direct reference');
        }
        
        console.log('Target image src:', targetImage.src);
        
        // Scroll to the image
        targetImage.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'center'
        });
        
        // Add a temporary highlight effect
        const originalBorder = targetImage.style.border;
        const originalOutline = targetImage.style.outline;
        
        targetImage.style.border = '3px solid #1976d2';
        targetImage.style.outline = '2px solid rgba(25, 118, 210, 0.3)';
        
        // Remove highlight after 3 seconds
        setTimeout(() => {
            targetImage.style.border = originalBorder;
            targetImage.style.outline = originalOutline;
        }, 3000);
        
        return { success: true, message: 'Image focused' };
        
    } catch (error) {
        console.error('Error focusing on image:', error);
        return { success: false, error: error.message };
    }
}

// Function to chunk the webpage into selectable elements
function chunkWebpage() {
    console.log('Chunking webpage for accessibility...');
    
    // Clear existing chunks
    webpageChunks = [];
    selectedChunks.clear();
    currentChunkIndex = -1;
    
    // Remove existing chunk styling
    document.querySelectorAll('.sarvam-chunk-highlight').forEach(el => {
        el.classList.remove('sarvam-chunk-highlight');
        el.removeAttribute('tabindex');
        el.removeAttribute('data-sarvam-chunk-id');
    });
    
    // Find all potential chunks
    const allElements = Array.from(document.querySelectorAll(CHUNK_SELECTORS.join(',')));
    
    // Filter and process chunks
    allElements.forEach((element, index) => {
        const text = element.innerText.trim();
        
        // Skip if too short, hidden, or already processed
        if (text.length < 20 || 
            element.offsetParent === null || 
            element.style.display === 'none' ||
            element.style.visibility === 'hidden' ||
            element.classList.contains('sarvam-chunk-highlight')) {
            return;
        }
        
        // Skip if element is inside another chunk
        if (element.closest('.sarvam-chunk-highlight')) {
            return;
        }
        
        // Create chunk object
        const chunk = {
            id: `chunk-${index}`,
            element: element,
            text: text,
            index: webpageChunks.length
        };
        
        webpageChunks.push(chunk);
        
        // Make element focusable and add styling
        element.setAttribute('tabindex', '0');
        element.setAttribute('data-sarvam-chunk-id', chunk.id);
        element.classList.add('sarvam-chunk-highlight');
        
        // Add click handler for mouse users
        element.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleChunkSelection(chunk.id);
        });
    });
    
    console.log(`Created ${webpageChunks.length} chunks for keyboard navigation`);
    
    // Add keyboard navigation
    setupKeyboardNavigation();
    
    // Add visual styling
    addChunkStyles();
    
    return webpageChunks.length;
}

// Function to setup keyboard navigation
function setupKeyboardNavigation() {
    // Remove existing listeners
    document.removeEventListener('keydown', handleChunkKeyboardNavigation);
    
    // Add keyboard navigation listener
    document.addEventListener('keydown', handleChunkKeyboardNavigation);
}

// Keyboard navigation handler
function handleChunkKeyboardNavigation(e) {
    // Only handle if we're in chunk navigation mode
    if (!webpageChunks.length) return;
    
    switch (e.key) {
        case 'Tab':
            // Navigate between chunks
            e.preventDefault();
            if (e.shiftKey) {
                navigateToPreviousChunk();
            } else {
                navigateToNextChunk();
            }
            break;
            
        case 'Enter':
            // Select/deselect current chunk
            if (currentChunkIndex >= 0 && currentChunkIndex < webpageChunks.length) {
                e.preventDefault();
                const chunk = webpageChunks[currentChunkIndex];
                toggleChunkSelection(chunk.id);
            }
            break;
            
        case 'Escape':
            // Exit chunk navigation mode
            e.preventDefault();
            exitChunkNavigation();
            break;
            
        case ' ':
            // Space bar to select current chunk
            if (currentChunkIndex >= 0 && currentChunkIndex < webpageChunks.length) {
                e.preventDefault();
                const chunk = webpageChunks[currentChunkIndex];
                toggleChunkSelection(chunk.id);
            }
            break;
    }
}

// Navigate to next chunk
function navigateToNextChunk() {
    if (webpageChunks.length === 0) return;
    
    // Remove focus from current chunk
    if (currentChunkIndex >= 0 && currentChunkIndex < webpageChunks.length) {
        webpageChunks[currentChunkIndex].element.classList.remove('sarvam-chunk-focused');
    }
    
    // Move to next chunk
    currentChunkIndex = (currentChunkIndex + 1) % webpageChunks.length;
    
    // Focus on new chunk
    const chunk = webpageChunks[currentChunkIndex];
    chunk.element.classList.add('sarvam-chunk-focused');
    chunk.element.focus();
    
    // Announce chunk to screen readers
    announceChunk(chunk);
    
    console.log(`Navigated to chunk ${currentChunkIndex + 1}/${webpageChunks.length}: ${chunk.text.substring(0, 50)}...`);
}

// Navigate to previous chunk
function navigateToPreviousChunk() {
    if (webpageChunks.length === 0) return;
    
    // Remove focus from current chunk
    if (currentChunkIndex >= 0 && currentChunkIndex < webpageChunks.length) {
        webpageChunks[currentChunkIndex].element.classList.remove('sarvam-chunk-focused');
    }
    
    // Move to previous chunk
    currentChunkIndex = currentChunkIndex <= 0 ? webpageChunks.length - 1 : currentChunkIndex - 1;
    
    // Focus on new chunk
    const chunk = webpageChunks[currentChunkIndex];
    chunk.element.classList.add('sarvam-chunk-focused');
    chunk.element.focus();
    
    // Announce chunk to screen readers
    announceChunk(chunk);
    
    console.log(`Navigated to chunk ${currentChunkIndex + 1}/${webpageChunks.length}: ${chunk.text.substring(0, 50)}...`);
}

// Toggle chunk selection
function toggleChunkSelection(chunkId) {
    const chunk = webpageChunks.find(c => c.id === chunkId);
    if (!chunk) return;
    
    if (selectedChunks.has(chunkId)) {
        // Deselect
        selectedChunks.delete(chunkId);
        chunk.element.classList.remove('sarvam-chunk-selected');
        console.log(`Deselected chunk: ${chunk.text.substring(0, 50)}...`);
    } else {
        // Select
        selectedChunks.add(chunkId);
        chunk.element.classList.add('sarvam-chunk-selected');
        console.log(`Selected chunk: ${chunk.text.substring(0, 50)}...`);
    }
    
    // Send selection update to extension
    sendChunkSelectionUpdate();
}

// Send chunk selection update to extension
function sendChunkSelectionUpdate() {
    const selectedTexts = Array.from(selectedChunks).map(chunkId => {
        const chunk = webpageChunks.find(c => c.id === chunkId);
        return chunk ? chunk.text : '';
    }).filter(text => text.length > 0);
    
    chrome.runtime.sendMessage({
        type: 'chunk_selection_update',
        selectedTexts: selectedTexts,
        selectedCount: selectedChunks.size,
        totalChunks: webpageChunks.length
    });
}

// Announce chunk to screen readers
function announceChunk(chunk) {
    const announcement = `Chunk ${chunk.index + 1} of ${webpageChunks.length}. ${chunk.text.substring(0, 100)}...`;
    
    // Create temporary announcement element
    const announcer = document.createElement('div');
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    announcer.style.position = 'absolute';
    announcer.style.left = '-10000px';
    announcer.style.width = '1px';
    announcer.style.height = '1px';
    announcer.style.overflow = 'hidden';
    announcer.textContent = announcement;
    
    document.body.appendChild(announcer);
    
    // Remove after announcement
    setTimeout(() => {
        document.body.removeChild(announcer);
    }, 1000);
}

// Exit chunk navigation mode
function exitChunkNavigation() {
    if (currentChunkIndex >= 0 && currentChunkIndex < webpageChunks.length) {
        webpageChunks[currentChunkIndex].element.classList.remove('sarvam-chunk-focused');
    }
    currentChunkIndex = -1;
    console.log('Exited chunk navigation mode');
}

// Add visual styles for chunks
function addChunkStyles() {
    const styleId = 'sarvam-chunk-styles';
    
    // Remove existing styles
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
        existingStyle.remove();
    }
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .sarvam-chunk-highlight {
            transition: all 0.2s ease;
            cursor: pointer;
            border-radius: 4px;
            padding: 2px;
            margin: 1px 0;
        }
        
        .sarvam-chunk-highlight:hover {
            background-color: rgba(0, 188, 212, 0.1);
            outline: 1px solid rgba(0, 188, 212, 0.3);
        }
        
        .sarvam-chunk-highlight:focus {
            outline: 2px solid #00bcd4 !important;
            background-color: rgba(0, 188, 212, 0.15) !important;
            box-shadow: 0 0 0 2px rgba(0, 188, 212, 0.2) !important;
        }
        
        .sarvam-chunk-focused {
            outline: 3px solid #1976d2 !important;
            background-color: rgba(25, 118, 210, 0.1) !important;
            box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.3) !important;
        }
        
        .sarvam-chunk-selected {
            outline: 2px solid #4caf50 !important;
            background-color: rgba(76, 175, 80, 0.1) !important;
            border-left: 4px solid #4caf50 !important;
        }
        
        .sarvam-chunk-selected.sarvam-chunk-focused {
            outline: 3px solid #1976d2 !important;
            background-color: rgba(76, 175, 80, 0.15) !important;
        }
    `;
    
    document.head.appendChild(style);
}

// Function to get all selected chunks
function getSelectedChunks() {
    return Array.from(selectedChunks).map(chunkId => {
        const chunk = webpageChunks.find(c => c.id === chunkId);
        return chunk ? chunk.text : '';
    }).filter(text => text.length > 0);
}

// Function to clear all selections
function clearChunkSelections() {
    selectedChunks.clear();
    webpageChunks.forEach(chunk => {
        chunk.element.classList.remove('sarvam-chunk-selected');
    });
    sendChunkSelectionUpdate();
} 
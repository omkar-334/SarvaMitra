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
    // Main content containers
    "article",
    "section", 
    "main",
    ".content",
    ".text-content",
    ".article-content",
    ".post-content",
    ".entry-content",
    
    // Headings with their content
    "h1", "h2", "h3", "h4", "h5", "h6",
    
    // Paragraphs and text blocks
    "p",
    "blockquote",
    "pre",
    "code",
    
    // List items (individual items)
    "li",
    
    // Div containers that likely contain meaningful content
    "div[class*='content']",
    "div[class*='text']", 
    "div[class*='article']",
    "div[class*='post']",
    "div[class*='entry']",
    "div[class*='body']",
    "div[class*='description']",
    "div[class*='summary']",
    "div[class*='excerpt']",
    
    // Common content classes
    ".paragraph",
    ".text-block",
    ".content-block",
    ".section-content"
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

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);
    
    switch (message.action) {
        case 'ping':
            sendResponse({ success: true, message: 'Content script is ready' });
            break;
            
        case 'requestMicrophonePermission':
            requestMicrophonePermission().then(sendResponse);
            break;
            
        case 'startRecording':
            startRecording().then(sendResponse);
            break;
            
        case 'stopRecording':
            stopRecording().then(sendResponse);
            break;
            
        case 'detectImages':
            detectImages().then(sendResponse);
            break;
            
        case 'focusOnImage':
            focusOnImage(message.imageId).then(sendResponse);
            break;
            
        case 'chunkWebpage':
            try {
                // Enable chunking mode
                const chunkCount = chunkWebpage();
                // Auto-focus on first chunk
                setTimeout(() => autoFocusFirstChunk(), 100);
                sendResponse({ 
                    success: true, 
                    chunkCount: chunkCount,
                    message: `Created ${chunkCount} chunks for keyboard navigation`
                });
            } catch (error) {
                console.error('Error in chunkWebpage:', error);
                sendResponse({ 
                    success: false, 
                    error: error.message || 'Failed to enable chunking'
                });
            }
            break;
            
        case 'clearChunkSelections':
            // Clear all chunk selections
            clearChunkSelections();
            sendResponse({ success: true, message: 'Cleared all chunk selections' });
            break;
            
        case 'getSelectedChunks':
            // Get all selected chunks
            const selectedTexts = getSelectedChunks();
            sendResponse({ 
                success: true, 
                selectedTexts: selectedTexts,
                selectedCount: selectedTexts.length
            });
            break;
            
        case 'exitChunkNavigation':
            // Exit chunk navigation mode
            exitChunkNavigation();
            sendResponse({ success: true, message: 'Exited chunk navigation mode' });
            break;
            
        case 'getCurrentActiveChunk':
            // Get the currently active chunk
            const activeChunk = getCurrentActiveChunk();
            sendResponse({ 
                success: true, 
                chunkText: activeChunk ? activeChunk.text : null,
                chunkIndex: currentChunkIndex
            });
            break;
            
        case 'replaceChunkText':
            // Replace chunk text with translated text
            const replaceResult = replaceChunkText(message.chunkIndex, message.translatedText);
            sendResponse({ 
                success: replaceResult.success, 
                message: replaceResult.message
            });
            break;
            
        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }
    
    return true; // Keep message channel open for async responses
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
            const hasSrc = img.src && typeof img.src === 'string' && img.src.trim() !== '';
            
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
    
    // Find all potential chunks using improved algorithm
    const chunks = findMeaningfulChunks();
    
    // Process and add chunks
    chunks.forEach((chunk, index) => {
        const chunkObj = {
            id: `chunk-${index}`,
            element: chunk.element,
            text: chunk.text,
            index: webpageChunks.length,
            type: chunk.type,
            level: chunk.level
        };
        
        webpageChunks.push(chunkObj);
        
        // Make element focusable and add styling
        chunk.element.setAttribute('tabindex', '0');
        chunk.element.setAttribute('data-sarvam-chunk-id', chunkObj.id);
        chunk.element.setAttribute('data-chunk-type', chunk.type);
        chunk.element.classList.add('sarvam-chunk-highlight');
        
        // Add click handler for mouse users
        chunk.element.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleChunkSelection(chunkObj.id);
        });
    });
    
    console.log(`Created ${webpageChunks.length} chunks for keyboard navigation`);
    
    // Add keyboard navigation
    setupKeyboardNavigation();
    
    // Add visual styling
    addChunkStyles();
    
    return webpageChunks.length;
}

// Improved function to find meaningful chunks - COMPREHENSIVE VERSION
function findMeaningfulChunks() {
    const chunks = [];
    
    // Strategy 1: Find ALL content areas comprehensively
    const allContentAreas = findAllContentAreas();
    allContentAreas.forEach(area => {
        const areaChunks = extractChunksFromAreaComprehensive(area);
        chunks.push(...areaChunks);
    });
    
    // Strategy 2: Find ANY remaining content elements not already processed
    const remainingChunks = findRemainingContent();
    chunks.push(...remainingChunks);
    
    // Strategy 3: Add filtered images as chunks
    const imageChunks = createImageChunks();
    chunks.push(...imageChunks);
    
    // Strategy 4: Group related content intelligently
    const groupedChunks = groupRelatedContentIntelligently(chunks);
    
    // Strategy 5: Final cleanup and deduplication
    return finalizeChunks(groupedChunks);
}

// Find ALL content areas comprehensively
function findAllContentAreas() {
    const areas = [];
    
    // 1. Standard content selectors
    const standardSelectors = [
        'main', 'article', 'section', 'aside',
        '.content', '.main-content', '.article-content', '.post-content', '.entry-content',
        '#content', '#main', '#article',
        '[role="main"]', '[role="article"]', '[role="contentinfo"]'
    ];
    
    standardSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            if (isVisibleElement(el) && hasSignificantContent(el)) {
                areas.push(el);
            }
        });
    });
    
    // 2. Find content by class patterns
    const classPatterns = [
        'div[class*="content"]', 'div[class*="text"]', 'div[class*="article"]',
        'div[class*="post"]', 'div[class*="entry"]', 'div[class*="body"]',
        'div[class*="description"]', 'div[class*="summary"]', 'div[class*="excerpt"]'
    ];
    
    classPatterns.forEach(pattern => {
        const elements = document.querySelectorAll(pattern);
        elements.forEach(el => {
            if (isVisibleElement(el) && hasSignificantContent(el) && !el.closest('.sarvam-chunk-highlight')) {
                areas.push(el);
            }
        });
    });
    
    // 3. Find content by text density (divs with lots of text)
    const allDivs = document.querySelectorAll('div');
    allDivs.forEach(div => {
        if (isVisibleElement(div) && hasSignificantContent(div) && 
            !div.closest('.sarvam-chunk-highlight') && 
            !areas.includes(div) &&
            div.children.length < 20 && // Avoid navigation/header divs
            (div.innerText || div.textContent || '').trim().length > 100) { // Must have substantial text
            areas.push(div);
        }
    });
    
    // 4. If no areas found, use body as fallback
    if (areas.length === 0) {
        areas.push(document.body);
    }
    
    // 5. Remove duplicates and nested areas
    const uniqueAreas = [];
    areas.forEach(area => {
        const isNested = uniqueAreas.some(existing => existing.contains(area));
        const containsExisting = uniqueAreas.some(existing => area.contains(existing));
        
        if (!isNested && !containsExisting) {
            uniqueAreas.push(area);
        } else if (containsExisting) {
            // Replace parent with child if child has more specific content
            const index = uniqueAreas.findIndex(existing => area.contains(existing));
            if (index !== -1) {
                uniqueAreas[index] = area;
            }
        }
    });
    
    return uniqueAreas;
}

// Comprehensive chunk extraction from any area
function extractChunksFromAreaComprehensive(area) {
    const chunks = [];
    
    // Get ALL text-containing elements in the area
    const allElements = area.querySelectorAll('*');
    const textElements = [];
    
    allElements.forEach(element => {
        // Skip if already processed
        if (element.closest('.sarvam-chunk-highlight')) {
            return;
        }
        
        const text = element.innerText || element.textContent || '';
        if (text.trim().length > 20 && isVisibleElement(element) && hasSignificantContent(element)) {
            textElements.push({
                element: element,
                text: text,
                tagName: element.tagName.toLowerCase(),
                isHeading: isHeading(element),
                depth: getElementDepth(element)
            });
        }
    });
    
    // Sort by DOM depth to process in order
    textElements.sort((a, b) => a.depth - b.depth);
    
    // Group content by headings and create chunks
    let currentChunk = null;
    let processedElements = new Set();
    
    for (let i = 0; i < textElements.length; i++) {
        const item = textElements[i];
        
        // Skip if already processed
        if (processedElements.has(item.element)) {
            continue;
        }
        
        if (item.isHeading) {
            // Save previous chunk
            if (currentChunk && currentChunk.text.trim().length > 20) {
                chunks.push(currentChunk);
            }
            
            // Start new chunk with heading
            currentChunk = {
                element: item.element,
                text: item.text,
                type: 'heading',
                level: parseInt(item.tagName.charAt(1))
            };
            processedElements.add(item.element);
        } else {
            // Check if this element is part of a heading's content
            const parentHeading = findParentHeading(item.element);
            
            if (parentHeading && currentChunk && currentChunk.element === parentHeading) {
                // Add to current heading chunk
                currentChunk.text += '\n\n' + item.text;
                currentChunk.element = item.element; // Update focus element
                processedElements.add(item.element);
            } else if (currentChunk && !parentHeading) {
                // Add to current chunk if no heading relationship
                currentChunk.text += '\n\n' + item.text;
                currentChunk.element = item.element;
                processedElements.add(item.element);
            } else {
                // Create standalone chunk
                chunks.push({
                    element: item.element,
                    text: item.text,
                    type: item.tagName,
                    level: 0
                });
                processedElements.add(item.element);
                currentChunk = null;
            }
        }
    }
    
    // Add the last chunk
    if (currentChunk && currentChunk.text.trim().length > 20) {
        chunks.push(currentChunk);
    }
    
    return chunks;
}

// Find remaining content not already processed
function findRemainingContent() {
    const chunks = [];
    const processedElements = document.querySelectorAll('.sarvam-chunk-highlight');
    const processedSet = new Set(Array.from(processedElements));
    
    // Find any remaining text elements
    const allElements = document.querySelectorAll('p, div, span, article, section, aside');
    
    allElements.forEach(element => {
        if (processedSet.has(element) || element.closest('.sarvam-chunk-highlight')) {
            return;
        }
        
        const text = element.innerText.trim();
        if (text.length > 50 && isVisibleElement(element) && hasSignificantContent(element)) {
            // Check if this element contains meaningful content
            const hasRealContent = text.split(' ').length > 5; // At least 5 words
            
            if (hasRealContent) {
                chunks.push({
                    element: element,
                    text: text,
                    type: element.tagName.toLowerCase(),
                    level: 0
                });
            }
        }
    });
    
    return chunks;
}

// Find parent heading for an element
function findParentHeading(element) {
    let current = element.parentElement;
    while (current && current !== document.body) {
        if (isHeading(current)) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

// Get element depth in DOM
function getElementDepth(element) {
    let depth = 0;
    let current = element.parentElement;
    while (current && current !== document.body) {
        depth++;
        current = current.parentElement;
    }
    return depth;
}

// Intelligent content grouping
function groupRelatedContentIntelligently(chunks) {
    const grouped = [];
    let currentGroup = null;
    
    chunks.forEach(chunk => {
        if (chunk.type === 'heading' && chunk.level <= 3) {
            // Start new group for major headings
            if (currentGroup && currentGroup.text && currentGroup.text.trim().length > 20) {
                grouped.push(currentGroup);
            }
            currentGroup = chunk;
        } else if (chunk.type === 'image') {
            // Images are standalone
            if (currentGroup && currentGroup.text && currentGroup.text.trim().length > 20) {
                grouped.push(currentGroup);
            }
            grouped.push(chunk);
            currentGroup = null;
        } else if (currentGroup && chunk.type !== 'heading') {
            // Add to current group
            currentGroup.text += '\n\n' + chunk.text;
            currentGroup.element = chunk.element;
        } else {
            // Standalone chunk
            if (currentGroup && currentGroup.text && currentGroup.text.trim().length > 20) {
                grouped.push(currentGroup);
            }
            grouped.push(chunk);
            currentGroup = null;
        }
    });
    
    if (currentGroup && currentGroup.text && currentGroup.text.trim().length > 20) {
        grouped.push(currentGroup);
    }
    
    return grouped;
}

// Final chunk processing and deduplication
function finalizeChunks(chunks) {
    const finalChunks = [];
    const seenTexts = new Set();
    
    chunks.forEach(chunk => {
        const text = chunk.text || '';
        if (text.trim().length > 5) {
            // Skip if duplicate content
            if (seenTexts.has(text)) return;
            
            // Skip navigation/advertisement content
            if (isNavigationElement(chunk.element)) return;
            
            // Skip hidden elements
            if (!isVisibleElement(chunk.element)) return;
            
            seenTexts.add(text);
            finalChunks.push(chunk);
        }
    });
    
    return finalChunks;
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
    let announcement = `Chunk ${chunk.index + 1} of ${webpageChunks.length}`;
    
    // Add chunk type information
    if (chunk.type === 'heading') {
        announcement += `. Heading level ${chunk.level}`;
    } else if (chunk.type === 'image') {
        announcement += `. Image`;
    } else if (chunk.type === 'content-div') {
        announcement += `. Content section`;
    } else {
        announcement += `. ${chunk.type} element`;
    }
    
    // Add content preview
    const preview = chunk.text.substring(0, 100).replace(/\n/g, ' ');
    announcement += `. ${preview}...`;
    
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
            transition: all 0.3s ease;
            cursor: pointer;
            border-radius: 8px;
            padding: 8px;
            margin: 4px 0;
            position: relative;
            border: 2px solid transparent;
        }
        
        .sarvam-chunk-highlight:hover {
            background-color: rgba(0, 188, 212, 0.08);
            border-color: rgba(0, 188, 212, 0.3);
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 188, 212, 0.15);
        }
        
        .sarvam-chunk-highlight:focus {
            outline: none;
            border-color: #00bcd4 !important;
            background-color: rgba(0, 188, 212, 0.12) !important;
            box-shadow: 0 0 0 3px rgba(0, 188, 212, 0.25) !important;
            transform: translateY(-2px);
        }
        
        .sarvam-chunk-focused {
            outline: none !important;
            border-color: #1976d2 !important;
            background-color: rgba(25, 118, 210, 0.15) !important;
            box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.3) !important;
            transform: translateY(-2px);
        }
        
        .sarvam-chunk-selected {
            border-color: #4caf50 !important;
            background-color: rgba(76, 175, 80, 0.12) !important;
            border-left-width: 6px !important;
            position: relative;
        }
        
        .sarvam-chunk-selected::before {
            content: "✓";
            position: absolute;
            top: 8px;
            right: 8px;
            background: #4caf50;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
        }
        
        .sarvam-chunk-selected.sarvam-chunk-focused {
            border-color: #1976d2 !important;
            background-color: rgba(76, 175, 80, 0.18) !important;
            box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.3), 0 2px 8px rgba(76, 175, 80, 0.2) !important;
        }
        
        /* Special styling for heading chunks */
        .sarvam-chunk-highlight[data-chunk-type="heading"] {
            background-color: rgba(255, 193, 7, 0.05);
            border-left: 4px solid #ffc107;
        }
        
        .sarvam-chunk-highlight[data-chunk-type="heading"]:hover {
            background-color: rgba(255, 193, 7, 0.1);
            border-color: #ffc107;
        }
        
        .sarvam-chunk-highlight[data-chunk-type="heading"].sarvam-chunk-focused {
            background-color: rgba(255, 193, 7, 0.15) !important;
            border-color: #1976d2 !important;
        }
        
        /* Special styling for image chunks */
        .sarvam-chunk-highlight[data-chunk-type="image"] {
            background-color: rgba(255, 87, 34, 0.05);
            border-left: 4px solid #ff5722;
            border-radius: 12px;
            padding: 12px;
        }
        
        .sarvam-chunk-highlight[data-chunk-type="image"]:hover {
            background-color: rgba(255, 87, 34, 0.1);
            border-color: #ff5722;
            transform: scale(1.02);
        }
        
        .sarvam-chunk-highlight[data-chunk-type="image"].sarvam-chunk-focused {
            background-color: rgba(255, 87, 34, 0.15) !important;
            border-color: #1976d2 !important;
            transform: scale(1.02);
        }
        
        .sarvam-chunk-highlight[data-chunk-type="image"].sarvam-chunk-selected {
            background-color: rgba(255, 87, 34, 0.12) !important;
            border-color: #4caf50 !important;
        }
        
        /* Special styling for content div chunks */
        .sarvam-chunk-highlight[data-chunk-type="content-div"] {
            background-color: rgba(156, 39, 176, 0.05);
            border-left: 4px solid #9c27b0;
        }
        
        .sarvam-chunk-highlight[data-chunk-type="content-div"]:hover {
            background-color: rgba(156, 39, 176, 0.1);
            border-color: #9c27b0;
        }
        
        .sarvam-chunk-highlight[data-chunk-type="content-div"].sarvam-chunk-focused {
            background-color: rgba(156, 39, 176, 0.15) !important;
            border-color: #1976d2 !important;
        }
        
        /* Ensure images in image chunks are properly styled */
        .sarvam-chunk-highlight[data-chunk-type="image"] img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            display: block;
            margin: 0 auto;
        }
        
        /* Responsive design for chunks */
        @media (max-width: 768px) {
            .sarvam-chunk-highlight {
                padding: 6px;
                margin: 2px 0;
                border-radius: 6px;
            }
            
            .sarvam-chunk-highlight[data-chunk-type="image"] {
                padding: 8px;
                border-radius: 8px;
            }
        }
    `;
    
    document.head.appendChild(style);
    console.log('Chunk styles added');
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

// Auto-focus on first chunk when chunking is enabled
function autoFocusFirstChunk() {
    if (webpageChunks.length > 0) {
        currentChunkIndex = 0;
        const firstChunk = webpageChunks[0];
        firstChunk.element.classList.add('sarvam-chunk-focused');
        firstChunk.element.focus();
        announceChunk(firstChunk);
        console.log(`Auto-focused on first chunk: ${firstChunk.text.substring(0, 50)}...`);
    }
}

// Get the currently active chunk
function getCurrentActiveChunk() {
    if (currentChunkIndex >= 0 && currentChunkIndex < webpageChunks.length) {
        return webpageChunks[currentChunkIndex];
    }
    return null;
}

// Create chunks from filtered images
function createImageChunks() {
    const chunks = [];
    
    // Get all images that have been detected and filtered
    const filteredImages = document.querySelectorAll('img[data-sarvam-image-id]');
    
    filteredImages.forEach((img, index) => {
        const imageId = img.getAttribute('data-sarvam-image-id');
        const altText = img.alt || img.title || 'Image';
        const src = img.src;
        
        // Create a chunk for each filtered image
        chunks.push({
            element: img,
            text: `[Image: ${altText}] - ${src}`,
            type: 'image',
            level: 0,
            imageId: imageId,
            imageUrl: src
        });
    });
    
    return chunks;
}

// Helper function to check if element is visible
function isVisibleElement(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           element.offsetParent !== null &&
           element.offsetWidth > 0 &&
           element.offsetHeight > 0;
}

// Helper function to check if element has significant content
function hasSignificantContent(element) {
    if (!element) return false;
    
    const text = element.innerText || element.textContent || '';
    return text.trim().length > 10;
}

// Helper function to check if element is a heading
function isHeading(element) {
    return /^h[1-6]$/i.test(element.tagName);
}

// Helper function to check if element is navigation
function isNavigationElement(element) {
    const navSelectors = [
        'nav',
        '.nav',
        '.navigation',
        '.menu',
        '.header',
        '.footer',
        '.sidebar',
        '.advertisement',
        '.ad',
        '[role="navigation"]',
        '[role="banner"]',
        '[role="contentinfo"]'
    ];
    
    return navSelectors.some(selector => 
        element.matches(selector) || element.closest(selector)
    );
}

// Replace chunk text with translated text
function replaceChunkText(chunkIndex, translatedText) {
    try {
        console.log(`Replacing chunk ${chunkIndex} with translated text:`, translatedText);
        
        if (chunkIndex < 0 || chunkIndex >= webpageChunks.length) {
            return { success: false, message: 'Invalid chunk index' };
        }
        
        const chunk = webpageChunks[chunkIndex];
        if (!chunk || !chunk.element) {
            return { success: false, message: 'Chunk element not found' };
        }
        
        // Replace the text content of the chunk element
        const element = chunk.element;
        
        // Handle different types of elements
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            // For input/textarea elements, update the value
            element.value = translatedText;
        } else {
            // For other elements, update the text content
            element.textContent = translatedText;
        }
        
        // Update the chunk object to reflect the change
        chunk.text = translatedText;
        
        console.log(`Successfully replaced chunk ${chunkIndex} text`);
        return { success: true, message: 'Chunk text replaced successfully' };
        
    } catch (error) {
        console.error('Error replacing chunk text:', error);
        return { success: false, message: error.message };
    }
} 
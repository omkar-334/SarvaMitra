// content.js - Content script for microphone access

console.log('Sarvam content script loaded for microphone access');

let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let isRecording = false;
let permissionIframe = null;
let permissionGranted = false;

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
/**
 * permission.js
 * Requests user permission for microphone access in an iframe.
 * This allows Chrome extensions to request microphone permissions properly.
 */

/**
 * Requests user permission for microphone access.
 * @returns {Promise<void>} A Promise that resolves when permission is granted or rejects with an error.
 */
async function getUserPermission() {
    return new Promise((resolve, reject) => {
        // Using navigator.mediaDevices.getUserMedia to request microphone access
        navigator.mediaDevices
            .getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                } 
            })
            .then((stream) => {
                // Permission granted, handle the stream if needed
                console.log("Microphone access granted in permission iframe");

                // Stop the tracks to prevent the recording indicator from being shown
                stream.getTracks().forEach(function (track) {
                    track.stop();
                });

                // Notify the parent window that permission was granted
                if (window.parent) {
                    window.parent.postMessage({
                        type: 'MICROPHONE_PERMISSION_GRANTED',
                        success: true
                    }, '*');
                }

                resolve();
            })
            .catch((error) => {
                console.error("Error requesting microphone permission in iframe", error);

                // Notify the parent window that permission was denied
                if (window.parent) {
                    window.parent.postMessage({
                        type: 'MICROPHONE_PERMISSION_DENIED',
                        success: false,
                        error: error.message
                    }, '*');
                }

                reject(error);
            });
    });
}

// Listen for messages from the parent window
window.addEventListener('message', (event) => {
    if (event.data.type === 'REQUEST_MICROPHONE_PERMISSION') {
        console.log('Permission iframe received request for microphone access');
        getUserPermission()
            .then(() => {
                console.log('Microphone permission granted successfully');
            })
            .catch((error) => {
                console.error('Microphone permission request failed:', error);
            });
    }
});

// Auto-request permission when the iframe loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Permission iframe loaded, requesting microphone access...');
    getUserPermission()
        .then(() => {
            console.log('Microphone permission granted on iframe load');
        })
        .catch((error) => {
            console.error('Microphone permission request failed on iframe load:', error);
        });
}); 
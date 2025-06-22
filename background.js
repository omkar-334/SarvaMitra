// background.js - Updated with Single Unified Menu

// Set the side panel to open when clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Failed to set panel behavior:', error));

// Add keyboard shortcuts for global access
chrome.commands.onCommand.addListener((command) => {
  console.log('Keyboard command received:', command);
  
  // Get the current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      console.log('No active tab found for keyboard command');
      return;
    }
    
    const tab = tabs[0];
    console.log('Processing command for tab:', tab.id);
    
    // First, ensure the side panel is open
    chrome.sidePanel.open({ tabId: tab.id }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error opening side panel:', chrome.runtime.lastError);
        return;
      }
      
      // Wait a bit for the side panel to load, then send the command
      setTimeout(() => {
        switch (command) {
          case 'toggle-mic':
            console.log('Sending toggle mic command');
            chrome.runtime.sendMessage({
              action: 'toggleMic'
            }).catch(error => {
              console.log('Failed to send toggle mic message:', error.message);
            });
            break;
            
          case 'send-message':
            console.log('Sending send message command');
            chrome.runtime.sendMessage({
              action: 'sendMessage'
            }).catch(error => {
              console.log('Failed to send message command:', error.message);
            });
            break;
            
          case 'read-aloud':
            console.log('Sending read aloud command');
            chrome.runtime.sendMessage({
              action: 'readAloud'
            }).catch(error => {
              console.log('Failed to send read aloud command:', error.message);
            });
            break;
            
          case 'translate':
            console.log('Sending translate command');
            chrome.runtime.sendMessage({
              action: 'translate'
            }).catch(error => {
              console.log('Failed to send translate command:', error.message);
            });
            break;
            
          default:
            console.log('Unknown command:', command);
        }
      }, 500); // Wait 500ms for side panel to load
    });
  });
});

// Create context menus when extension starts
chrome.runtime.onInstalled.addListener(() => {
  // Create single unified menu item
  chrome.contextMenus.create({
    id: "text-assistant",
    title: "🤖 SarvaMitra",
    contexts: ["selection"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "text-assistant") {
    console.log(`Text Assistant clicked with text: ${info.selectionText}`);
    
    // Store the selected text (no specific action type - goes to homepage)
    const messageData = {
      text: info.selectionText,
      timestamp: Date.now()
    };
    
    chrome.storage.session.set({
      lastMessage: messageData
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error storing message:', chrome.runtime.lastError);
        return;
      }
      
      console.log('Message stored successfully:', messageData);
      
      // Open the side panel
      chrome.sidePanel.open({ tabId: tab.id }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error opening side panel:', chrome.runtime.lastError);
        } else {
          console.log('Side panel opened for Text Assistant');
          
          // Send a message to the side panel to ensure it loads the text
          setTimeout(() => {
            chrome.runtime.sendMessage({
              action: 'switchTab',
              text: info.selectionText
            }).catch(error => {
              // This is expected to fail if the side panel isn't ready yet
              console.log('Direct message failed (expected):', error.message);
            });
          }, 500);
        }
      });
    });
  }
});

// Handle messages from content scripts or side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  
  if (message.type && message.text) {
    // Store message from content script or other sources
    chrome.storage.session.set({ 
      lastMessage: {
        type: message.type,
        text: message.text,
        timestamp: Date.now()
      }
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("Failed to store message:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('Message stored from runtime message');
        sendResponse({ success: true });
      }
    });
    return true; // Keep message channel open
  }
  
  if (message.type === 'chunk_selection_update') {
    // Handle chunk selection updates from content script
    console.log('Chunk selection update:', message);
    
    // Store selected chunks in session storage
    chrome.storage.session.set({ 
      selectedChunks: {
        texts: message.selectedTexts,
        count: message.selectedCount,
        totalChunks: message.totalChunks,
        timestamp: Date.now()
      }
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("Failed to store chunk selections:", chrome.runtime.lastError);
      } else {
        console.log('Chunk selections stored:', message.selectedTexts.length, 'chunks');
        
        // Send update to side panel if it's open
        chrome.runtime.sendMessage({
          action: 'chunkSelectionsUpdated',
          selectedTexts: message.selectedTexts,
          selectedCount: message.selectedCount,
          totalChunks: message.totalChunks
        }).catch(error => {
          // Side panel might not be open, which is fine
          console.log('Side panel not ready for chunk update:', error.message);
        });
      }
    });
    
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'getLastMessage') {
    // Handle request for last message
    chrome.storage.session.get(['lastMessage'], (result) => {
      sendResponse({ lastMessage: result.lastMessage });
    });
    return true;
  }
  
  if (message.action === 'getSelectedChunks') {
    // Handle request for selected chunks
    chrome.storage.session.get(['selectedChunks'], (result) => {
      sendResponse({ selectedChunks: result.selectedChunks });
    });
    return true;
  }
  
  // Handle other message types
  sendResponse({ success: true });
});

// Check for command shortcut conflicts during installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    checkCommandShortcuts();
  }
});

function checkCommandShortcuts() {
  chrome.commands.getAll((commands) => {
    let missingShortcuts = [];

    for (let {name, shortcut} of commands) {
      if (shortcut === '') {
        missingShortcuts.push(name);
      }
    }

    if (missingShortcuts.length > 0) {
      console.warn('Some commands are unassigned due to conflicts:', missingShortcuts);
      // You could show a notification to the user here
    }
  });
}
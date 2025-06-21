// background.js - Updated with Single Unified Menu

// Set the side panel to open when clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Failed to set panel behavior:', error));

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
  
  if (message.action === 'getLastMessage') {
    // Handle request for last message
    chrome.storage.session.get(['lastMessage'], (result) => {
      sendResponse({ lastMessage: result.lastMessage });
    });
    return true;
  }
  
  // Handle other message types
  sendResponse({ success: true });
});
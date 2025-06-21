// background.js - Updated with Tab Switching

// Set the side panel to open when clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Failed to set panel behavior:', error));

// Create context menus when extension starts
chrome.runtime.onInstalled.addListener(() => {
  // Create individual menu items
  const menuItems = [
    { id: "summarize", title: "📝 Summarize" },
    { id: "chat", title: "💬 Chat" },
    { id: "read", title: "🔊 Read" },
    { id: "translate", title: "🌐 Translate" }
  ];

  menuItems.forEach(item => {
    chrome.contextMenus.create({
      id: item.id,
      title: item.title,
      contexts: ["selection"]
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const validActions = ["summarize", "chat", "read", "translate"];
  
  if (validActions.includes(info.menuItemId)) {
    console.log(`Context menu clicked: ${info.menuItemId} with text: ${info.selectionText}`);
    
    // Store the selected text and action type
    const messageData = {
      type: info.menuItemId,
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
          console.log(`Side panel opened for action: ${info.menuItemId}`);
          
          // Send a message to the side panel to ensure it switches to the correct tab
          // This is a backup in case the storage listener doesn't fire immediately
          setTimeout(() => {
            chrome.runtime.sendMessage({
              action: 'switchTab',
              tabName: info.menuItemId,
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
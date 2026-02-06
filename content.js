/ ChitChat Enhancer - Content Script
console.log('ChitChat Enhancer content script loaded');

// Configuration
let config = {
  enabled: false,
  paused: false,
  keywords: [],
  timeout: 30000,
  filterAgeGender: true
};

// Global instances
let inactivityMonitor = null;
let chatObserver = null;

// Initialize the extension
(async function init() {
  try {
    console.log('Initializing ChitChat Enhancer...');
    await loadSettings();
    setupMessageListener();

    if (config.enabled) {
      startAutomation();
    }

    console.log('ChitChat Enhancer initialized with config:', config);
  } catch (error) {
    logError('Initialization failed', error);
  }
})();

// Load settings from storage
async function loadSettings() {
  try {
    const settings = await chrome.storage.local.get([
      'automationEnabled',
      'keywords',
      'timeout',
      'filterAgeGender',
      'pauseState'
    ]);

    config.enabled = settings.automationEnabled || false;
    config.keywords = settings.keywords || ['m', 'male', 'M'];
    config.timeout = (settings.timeout || 30) * 1000;
    config.filterAgeGender = settings.filterAgeGender !== false;
    config.paused = settings.pauseState || false;

    console.log('Settings loaded:', config);
  } catch (error) {
    logError('Failed to load settings', error);
  }
}

// Setup message listener for communication with popup
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);

    switch (request.action) {
      case 'toggleAutomation':
        handleToggleAutomation(request.enabled);
        sendResponse({ success: true });
        break;

      case 'pauseAutomation':
        handlePauseAutomation();
        sendResponse({ success: true, paused: config.paused });
        break;

      case 'updateSettings':
        handleUpdateSettings(request.settings);
        sendResponse({ success: true });
        break;

      case 'skipNow':
        skipCurrentChat('manual');
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }

    return true; // Keep channel open for async response
  });
}

// Handle automation toggle
function handleToggleAutomation(enabled) {
  config.enabled = enabled;

  if (enabled) {
    console.log('Starting automation...');
    startAutomation();
    showNotification('Automation enabled');
  } else {
    console.log('Stopping automation...');
    stopAutomation();
    showNotification('Automation disabled');
  }
}

// Handle pause/resume
function handlePauseAutomation() {
  config.paused = !config.paused;

  chrome.storage.local.set({ pauseState: config.paused });

  if (config.paused) {
    console.log('Automation paused');
    if (inactivityMonitor) {
      inactivityMonitor.stop();
    }
    showNotification('Automation paused');
  } else {
    console.log('Automation resumed');
    if (inactivityMonitor && config.enabled) {
      inactivityMonitor.start();
    }
    showNotification('Automation resumed');
  }
}

// Handle settings update
function handleUpdateSettings(settings) {
  console.log('Updating settings:', settings);

  if (settings.keywords) {
    config.keywords = settings.keywords;
  }

  if (settings.timeout) {
    config.timeout = settings.timeout * 1000;
    if (inactivityMonitor) {
      inactivityMonitor.updateTimeout(config.timeout);
    }
  }

  if (settings.filterAgeGender !== undefined) {
    config.filterAgeGender = settings.filterAgeGender;
  }

  showNotification('Settings updated');
}

// Start automation
function startAutomation() {
  console.log('Starting automation system...');

  // Initialize inactivity monitor
  inactivityMonitor = new InactivityMonitor(config.timeout);
  if (!config.paused) {
    inactivityMonitor.start();
  }

  // Start observing new chats
  observeNewChats();

  // Increment active time periodically
  startActiveTimeTracking();
}

// Stop automation
function stopAutomation() {
  console.log('Stopping automation system...');

  if (inactivityMonitor) {
    inactivityMonitor.stop();
    inactivityMonitor = null;
  }

  if (chatObserver) {
    chatObserver.disconnect();
    chatObserver = null;
  }
}

// Observe new chat messages
function observeNewChats() {
  // Try multiple selectors to find chat container
  const selectors = [
    '.chat-messages',
    '.messages-container',
    '.conversation',
    '#messages',
    '[class*="message"]',
    '[class*="chat"]'
  ];

  let chatContainer = null;
  for (const selector of selectors) {
    chatContainer = document.querySelector(selector);
    if (chatContainer) {
      console.log('Found chat container with selector:', selector);
      break;
    }
  }

  if (!chatContainer) {
    console.warn('Chat container not found, retrying in 2 seconds...');
    setTimeout(observeNewChats, 2000);
    return;
  }

  chatObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        const hasNewMessage = Array.from(mutation.addedNodes).some(node => {
          return node.nodeType === 1 && (
            node.classList.contains('message') ||
            node.querySelector('.message') ||
            node.classList.contains('msg') ||
            node.querySelector('.msg')
          );
        });

        if (hasNewMessage) {
          console.log('New message detected');
          checkNewMessage();
        }
      }
    });
  });

  chatObserver.observe(chatContainer, {
    childList: true,
    subtree: true
  });

  console.log('Chat observer started');
}

// Check new message for filters
function checkNewMessage() {
  if (config.paused || !config.enabled) {
    console.log('Skipping check - automation is paused or disabled');
    return;
  }

  // Find all messages
  const messageSelectors = [
    '.message',
    '.msg',
    '[class*="message"]',
    '[class*="msg"]'
  ];

  let messages = [];
  for (const selector of messageSelectors) {
    messages = document.querySelectorAll(selector);
    if (messages.length > 0) break;
  }

  if (messages.length === 0) {
    console.log('No messages found');
    return;
  }

  // Get the latest stranger message (not your own)
  let latestStrangerMessage = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    // Skip if it's your own message (usually has a different class)
    if (!msg.classList.contains('you') && 
        !msg.classList.contains('self') &&
        !msg.classList.contains('own')) {
      latestStrangerMessage = msg;
      break;
    }
  }

  if (!latestStrangerMessage) {
    console.log('No stranger messages found');
    return;
  }

  const messageText = latestStrangerMessage.textContent.trim();
  console.log('Checking message:', messageText);

  // Update total chats counter
  updateStats('totalChats');

  // Check keyword filters
  const hasBlockedKeyword = config.keywords.some(keyword => {
    const lowerMessage = messageText.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    return lowerMessage === lowerKeyword || 
           lowerMessage.includes(' ' + lowerKeyword) ||
           lowerMessage.includes(lowerKeyword + ' ') ||
           lowerMessage.startsWith(lowerKeyword) ||
           lowerMessage.endsWith(lowerKeyword);
  });

  if (hasBlockedKeyword) {
    console.log('Blocked keyword detected, skipping...');
    skipCurrentChat('keyword');
    return;
  }

  // Check age/gender patterns if enabled
  if (config.filterAgeGender) {
    const ageGenderPattern = /\b\d{1,2}\s*[mMfF]\b/;
    if (ageGenderPattern.test(messageText)) {
      console.log('Age/gender pattern detected, skipping...');
      skipCurrentChat('pattern');
      return;
    }
  }

  console.log('Message passed all filters');
}

// Skip current chat - FIXED VERSION
function skipCurrentChat(reason) {
  console.log(`Skipping chat due to: ${reason}`);

  // Try multiple selectors for skip/next button
  const buttonSelectors = [
    '.skip-btn',
    '.next-btn',
    'button[aria-label="Next"]',
    'button[aria-label="Skip"]',
    '[class*="skip"]',
    '[class*="next"]'
  ];

  let skipButton = null;

  // First try querySelector with valid selectors
  for (const selector of buttonSelectors) {
    try {
      skipButton = document.querySelector(selector);
      if (skipButton) {
        console.log('Found skip button with selector:', selector);
        break;
      }
    } catch (e) {
      console.warn('Invalid selector:', selector);
    }
  }

  // If not found, search by button text content
  if (!skipButton) {
    console.log('Searching for skip button by text content...');
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent.toLowerCase().trim();
      if (text === 'skip' || text === 'next' || text.includes('skip') || text.includes('next')) {
        skipButton = btn;
        console.log('Found skip button by text:', text);
        break;
      }
    }
  }

  // Also try finding by common button attributes
  if (!skipButton) {
    const allButtons = document.querySelectorAll('button, a[role="button"], [onclick*="skip"], [onclick*="next"]');
    for (const btn of allButtons) {
      const onclick = btn.getAttribute('onclick') || '';
      const id = btn.id || '';
      const className = btn.className || '';

      if (onclick.includes('skip') || onclick.includes('next') ||
          id.includes('skip') || id.includes('next') ||
          className.includes('skip') || className.includes('next')) {
        skipButton = btn;
        console.log('Found skip button by attributes');
        break;
      }
    }
  }

  if (skipButton) {
    skipButton.click();
    console.log('Skip button clicked');

    // Update stats
    if (reason === 'keyword' || reason === 'pattern') {
      updateStats('keywordFiltered');
    } else if (reason === 'inactivity') {
      updateStats('inactivitySkipped');
    }

    updateStats('chatsSkipped');

    showNotification(`Chat skipped: ${reason}`);
  } else {
    console.error('Skip button not found! Available buttons:', 
      Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent.trim(),
        class: b.className,
        id: b.id
      }))
    );
  }
}

// Update statistics
function updateStats(statType) {
  chrome.runtime.sendMessage({
    action: 'updateStats',
    statType: statType
  });
}

// Show notification
function showNotification(message) {
  chrome.runtime.sendMessage({
    action: 'notify',
    message: message
  });
}

// Log error
function logError(message, error) {
  console.error(`[ChitChat Enhancer] ${message}:`, error);
  chrome.runtime.sendMessage({
    action: 'logError',
    message: message,
    error: error ? error.toString() : null
  });
}

// Start tracking active time
function startActiveTimeTracking() {
  setInterval(() => {
    if (config.enabled && !config.paused) {
      updateStats('activeTime');
    }
  }, 60000); // Update every minute
}

// ============================================
// Inactivity Monitor Class
// ============================================
class InactivityMonitor {
  constructor(timeout) {
    this.timeout = timeout;
    this.timer = null;
    this.observer = null;
    console.log(`InactivityMonitor created with timeout: ${timeout}ms`);
  }

  start() {
    console.log('Starting inactivity monitoring...');
    this.observeMessages();
    this.resetTimer();
  }

  stop() {
    console.log('Stopping inactivity monitoring...');
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  updateTimeout(newTimeout) {
    console.log(`Updating timeout to: ${newTimeout}ms`);
    this.timeout = newTimeout;
    this.resetTimer();
  }

  observeMessages() {
    const selectors = [
      '.chat-messages',
      '.messages-container',
      '.conversation',
      '#messages'
    ];

    let chatContainer = null;
    for (const selector of selectors) {
      chatContainer = document.querySelector(selector);
      if (chatContainer) break;
    }

    if (!chatContainer) {
      console.warn('Chat container not found for inactivity monitoring');
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      const hasNewMessage = mutations.some(m => m.addedNodes.length > 0);
      if (hasNewMessage) {
        console.log('Activity detected, resetting timer...');
        this.resetTimer();
      }
    });

    this.observer.observe(chatContainer, {
      childList: true,
      subtree: true
    });

    console.log('Inactivity observer attached');
  }

  resetTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      console.log('Inactivity timeout reached');
      if (!config.paused && config.enabled) {
        skipCurrentChat('inactivity');
      }
    }, this.timeout);
  }
}

// ============================================
// Keyboard Shortcuts
// ============================================
document.addEventListener('keydown', (e) => {
  // Alt+P to pause/resume
  if (e.altKey && e.key === 'p') {
    e.preventDefault();
    handlePauseAutomation();
  }

  // Alt+S to skip manually
  if (e.altKey && e.key === 's') {
    e.preventDefault();
    if (config.enabled) {
      skipCurrentChat('manual');
    }
  }
});

console.log('ChitChat Enhancer content script ready');

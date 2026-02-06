// ChitChat Enhancer - Background Service Worker
console.log('ChitChat Enhancer background service worker loaded');

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  console.log('ChitChat Enhancer installed/updated', details);

  // Set default settings on first install
  if (details.reason === 'install') {
    chrome.storage.local.set({
      automationEnabled: false,
      keywords: ['m', 'male', 'M'],
      timeout: 30,
      filterAgeGender: true,
      pauseState: false,
      stats: {
        chatsSkipped: 0,
        keywordFiltered: 0,
        inactivitySkipped: 0,
        totalChats: 0,
        activeTime: 0,
        sessionStart: Date.now()
      }
    });

    console.log('Default settings initialized');
  }
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);

  switch (request.action) {
    case 'updateStats':
      handleUpdateStats(request);
      break;

    case 'notify':
      handleNotification(request);
      break;

    case 'logError':
      console.error('Content script error:', request.message, request.error);
      break;

    case 'getSettings':
      handleGetSettings(sendResponse);
      return true; // Keep channel open for async response

    default:
      console.warn('Unknown action:', request.action);
  }
});

// Handle stats updates
async function handleUpdateStats(request) {
  try {
    const { stats } = await chrome.storage.local.get('stats');
    const currentStats = stats || getDefaultStats();

    if (request.statType && currentStats.hasOwnProperty(request.statType)) {
      currentStats[request.statType] = (currentStats[request.statType] || 0) + 1;
      await chrome.storage.local.set({ stats: currentStats });
      console.log('Stats updated:', request.statType, currentStats[request.statType]);
    }
  } catch (error) {
    console.error('Failed to update stats:', error);
  }
}

// Handle notifications
function handleNotification(request) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: request.title || 'ChitChat Enhancer',
      message: request.message,
      priority: 1
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}

// Handle settings retrieval
async function handleGetSettings(sendResponse) {
  try {
    const settings = await chrome.storage.local.get([
      'automationEnabled',
      'keywords',
      'timeout',
      'filterAgeGender',
      'pauseState',
      'stats'
    ]);
    sendResponse({ success: true, settings });
  } catch (error) {
    console.error('Failed to get settings:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Get default stats object
function getDefaultStats() {
  return {
    chatsSkipped: 0,
    keywordFiltered: 0,
    inactivitySkipped: 0,
    totalChats: 0,
    activeTime: 0,
    sessionStart: Date.now()
  };
}

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
  console.log('ChitChat Enhancer started');
});

// Handle extension icon click (open popup)
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked on tab:', tab.id);
});

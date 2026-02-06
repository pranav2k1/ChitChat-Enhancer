// ChitChat Enhancer - Content Script
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

// ChitChat Enhancer - Popup Script
console.log('Popup script loaded');

// DOM Elements
const automationToggle = document.getElementById('automation-toggle');
const pauseBtn = document.getElementById('pause-btn');
const keywordsInput = document.getElementById('keywords');
const timeoutInput = document.getElementById('timeout');
const filterAgeGender = document.getElementById('filter-age-gender');
const saveBtn = document.getElementById('save-settings');
const resetStatsBtn = document.getElementById('reset-stats');
const statusIndicator = document.getElementById('status');

// State
let currentSettings = {};
let statsUpdateInterval = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing popup...');
  await loadSettings();
  setupEventListeners();
  startStatsUpdate();
});

// Load settings from storage
async function loadSettings() {
  try {
    const settings = await chrome.storage.local.get([
      'automationEnabled',
      'keywords',
      'timeout',
      'filterAgeGender',
      'pauseState',
      'stats'
    ]);

    console.log('Loaded settings:', settings);
    currentSettings = settings;

    // Update UI
    automationToggle.checked = settings.automationEnabled || false;
    keywordsInput.value = (settings.keywords || ['m', 'male', 'M']).join(', ');
    timeoutInput.value = settings.timeout || 30;
    filterAgeGender.checked = settings.filterAgeGender !== false;

    // Update pause button
    if (settings.pauseState) {
      pauseBtn.textContent = 'Resume';
      pauseBtn.classList.add('paused');
    } else {
      pauseBtn.textContent = 'Pause';
      pauseBtn.classList.remove('paused');
    }

    updateStatusIndicator(settings.automationEnabled);
    updateStats(settings.stats);
  } catch (error) {
    console.error('Failed to load settings:', error);
    showMessage('Failed to load settings', 'error');
  }
}

// Setup event listeners
function setupEventListeners() {
  // Automation toggle
  automationToggle.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    console.log('Automation toggled:', enabled);

    try {
      await chrome.storage.local.set({ automationEnabled: enabled });
      updateStatusIndicator(enabled);

      // Send message to content script
      await sendMessageToActiveTab({
        action: 'toggleAutomation',
        enabled: enabled
      });

      showMessage(enabled ? 'Automation enabled' : 'Automation disabled', 'success');
    } catch (error) {
      console.error('Failed to toggle automation:', error);
      showMessage('Failed to toggle automation', 'error');
    }
  });

  // Pause button
  pauseBtn.addEventListener('click', async () => {
    try {
      const response = await sendMessageToActiveTab({
        action: 'pauseAutomation'
      });

      if (response && response.paused !== undefined) {
        if (response.paused) {
          pauseBtn.textContent = 'Resume';
          pauseBtn.classList.add('paused');
          showMessage('Automation paused', 'info');
        } else {
          pauseBtn.textContent = 'Pause';
          pauseBtn.classList.remove('paused');
          showMessage('Automation resumed', 'success');
        }
      }
    } catch (error) {
      console.error('Failed to pause/resume:', error);
      showMessage('Failed to pause/resume', 'error');
    }
  });

  // Save settings button
  saveBtn.addEventListener('click', async () => {
    try {
      const keywords = keywordsInput.value
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const timeout = parseInt(timeoutInput.value);
      const filterAge = filterAgeGender.checked;

      // Validate
      if (keywords.length === 0) {
        showMessage('Please enter at least one keyword', 'warning');
        return;
      }

      if (timeout < 5 || timeout > 120) {
        showMessage('Timeout must be between 5 and 120 seconds', 'warning');
        return;
      }

      // Save to storage
      await chrome.storage.local.set({
        keywords: keywords,
        timeout: timeout,
        filterAgeGender: filterAge
      });

      // Send to content script
      await sendMessageToActiveTab({
        action: 'updateSettings',
        settings: {
          keywords: keywords,
          timeout: timeout,
          filterAgeGender: filterAge
        }
      });

      showMessage('Settings saved successfully', 'success');
      showSaveConfirmation();
    } catch (error) {
      console.error('Failed to save settings:', error);
      showMessage('Failed to save settings', 'error');
    }
  });

  // Reset stats button
  resetStatsBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to reset all statistics?')) {
      try {
        const newStats = {
          chatsSkipped: 0,
          keywordFiltered: 0,
          inactivitySkipped: 0,
          totalChats: 0,
          activeTime: 0,
          sessionStart: Date.now()
        };

        await chrome.storage.local.set({ stats: newStats });
        updateStats(newStats);
        showMessage('Statistics reset', 'success');
      } catch (error) {
        console.error('Failed to reset stats:', error);
        showMessage('Failed to reset statistics', 'error');
      }
    }
  });
}

// Send message to active tab
async function sendMessageToActiveTab(message) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tabs.length === 0) {
      throw new Error('No active tab found');
    }

    const tab = tabs[0];

    // Check if tab is on chitchat.gg
    if (!tab.url || !tab.url.includes('chitchat.gg')) {
      showMessage('Please navigate to chitchat.gg', 'warning');
      return null;
    }

    const response = await chrome.tabs.sendMessage(tab.id, message);
    return response;
  } catch (error) {
    console.error('Failed to send message to tab:', error);
    throw error;
  }
}

// Update status indicator
function updateStatusIndicator(enabled) {
  if (enabled) {
    statusIndicator.classList.add('active');
    statusIndicator.title = 'Automation active';
  } else {
    statusIndicator.classList.remove('active');
    statusIndicator.title = 'Automation inactive';
  }
}

// Update statistics display
function updateStats(stats) {
  if (!stats) return;

  document.getElementById('total-chats').textContent = stats.totalChats || 0;
  document.getElementById('skipped-chats').textContent = stats.chatsSkipped || 0;
  document.getElementById('filtered-chats').textContent = stats.keywordFiltered || 0;

  const activeMinutes = Math.floor((Date.now() - (stats.sessionStart || Date.now())) / 60000);
  document.getElementById('active-time').textContent = `${activeMinutes}m`;
}

// Start periodic stats update
function startStatsUpdate() {
  statsUpdateInterval = setInterval(async () => {
    try {
      const { stats } = await chrome.storage.local.get('stats');
      updateStats(stats);
    } catch (error) {
      console.error('Failed to update stats:', error);
    }
  }, 2000); // Update every 2 seconds
}

// Stop stats update when popup closes
window.addEventListener('beforeunload', () => {
  if (statsUpdateInterval) {
    clearInterval(statsUpdateInterval);
  }
});

// Show save confirmation
function showSaveConfirmation() {
  const originalText = saveBtn.textContent;
  const originalColor = saveBtn.style.backgroundColor;

  saveBtn.textContent = '‚úì Saved!';
  saveBtn.style.backgroundColor = '#4CAF50';
  saveBtn.disabled = true;

  setTimeout(() => {
    saveBtn.textContent = originalText;
    saveBtn.style.backgroundColor = originalColor;
    saveBtn.disabled = false;
  }, 2000);
}

// Show message (simple notification in popup)
function showMessage(message, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${message}`);

  // Create toast notification
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  document.body.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

console.log('Popup script ready');

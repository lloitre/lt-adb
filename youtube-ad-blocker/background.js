// Cross-browser extension API compatibility
const browserAPI = chrome || browser;
if (!browserAPI) {
  console.error('No browser extension API found');
}

// Performance-optimized background service
class AdBlockerService {
  constructor() {
    this.state = {
      enabled: true, // Default state is enabled
      statsCache: new Map(), // Cache to store ad blocking statistics
      lastUpdate: Date.now(), // Timestamp of the last update
      version: '1.0' // Match manifest version
    };
    
    this.init();
  }

  async init() {
    try {
      await this.loadState(); // Load the saved state from storage
      this.setupListeners(); // Set up event listeners
      this.startPerformanceMonitor(); // Start performance monitoring
      this.checkCompatibility(); // Check for required APIs
      console.log('YouTube Ad Blocker initialized');
    } catch (error) {
      console.error('Initialization error:', error);
    }
  }

  checkCompatibility() {
    // Check required APIs are available
    const requiredAPIs = [
      'storage',
      'runtime',
      'tabs',
      'declarativeNetRequest'
    ];

    const missingAPIs = requiredAPIs.filter(api => !browserAPI[api]);
    if (missingAPIs.length > 0) {
      console.warn('Missing required APIs:', missingAPIs);
    }
  }

  async loadState() {
    try {
      const data = await browserAPI.storage.local.get(['enabled', 'stats', 'version']);
      this.state.enabled = data.enabled ?? true; // Use default if not found
      if (data.stats) {
        this.state.statsCache = new Map(Object.entries(data.stats)); // Convert object to Map
      }
      // Handle version updates
      if (data.version !== this.state.version) {
        await this.handleVersionUpdate(data.version);
      }
    } catch (error) {
      console.error('Load state error:', error);
      // Use default values if loading fails
      this.state.enabled = true;
      this.state.statsCache = new Map();
    }
  }

  async handleVersionUpdate(oldVersion) {
    // Perform any necessary data migrations
    await browserAPI.storage.local.set({ version: this.state.version });
    console.log(`Updated from version ${oldVersion} to ${this.state.version}`);
  }

  setupListeners() {
    // Listen for messages from the popup
    browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'getState') {
        sendResponse({ enabled: this.state.enabled, stats: Object.fromEntries(this.state.statsCache) });
      } else if (message.action === 'setState') {
        this.state.enabled = message.enabled;
        browserAPI.storage.local.set({ enabled: this.state.enabled });
        sendResponse({ success: true });
      }
      return true; // Keep the message channel open for sendResponse
    });
  }

  startPerformanceMonitor() {
    // Implement performance monitoring if needed
    setInterval(() => {
      // Example: Log the number of ads blocked today
      const today = new Date().toDateString();
      const todayStats = this.state.statsCache.get(today) || 0;
      console.log(`Ads blocked today: ${todayStats}`);
    }, 60000); // Log every minute
  }

  updateStats(date, count) {
    const dateString = date.toDateString();
    const currentCount = this.state.statsCache.get(dateString) || 0;
    this.state.statsCache.set(dateString, currentCount + count);
    browserAPI.storage.local.set({ stats: Object.fromEntries(this.state.statsCache) });
  }

  async updateRules() {
    try {
      const rules = [
        {
          id: 1,
          priority: 1,
          action: {
            type: 'block'
          },
          condition: {
            urlFilter: '||googlevideo.com/*adformat*',
            resourceTypes: ['media']
          }
        },
        {
          id: 2,
          priority: 1,
          action: {
            type: 'block'
          },
          condition: {
            urlFilter: '||youtube.com/*ad*',
            resourceTypes: ['media', 'script', 'stylesheet']
          }
        }
      ];

      await browserAPI.declarativeNetRequest.updateDynamicRules({
        addRules: rules,
        removeRuleIds: [1, 2] // Remove existing rules with the same IDs
      });

      console.log('Rules updated:', rules);
    } catch (error) {
      console.error('Error updating rules:', error);
    }
  }
}

const adBlockerService = new AdBlockerService();
adBlockerService.updateRules(); // Update rules on initialization
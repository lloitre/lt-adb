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
      'webRequest'
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
    // Listen for webRequest events to block ads
    browserAPI.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (this.state.enabled) {
          // Example condition to block ads (you need to define the actual conditions)
          if (details.url.includes('googlevideo.com') && details.url.includes('ad')) {
            console.log('Blocking ad:', details.url);
            return { cancel: true }; // Cancel the request to block the ad
          }
        }
        return { cancel: false }; // Allow the request if ad blocking is disabled
      },
      { urls: ["<all_urls>"] }, // Listen to all URLs
      ["blocking"] // Block the request if the condition is met
    );

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
}

new AdBlockerService();
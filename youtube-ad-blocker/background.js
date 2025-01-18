// This file manages background tasks like enabling/disabling the ad blocker and tracking stats.
// It communicates with content.js and handles browser extension APIs.

// Cross-browser extension API compatibility
const browserAPI = chrome || browser;
if (!browserAPI) {
  console.error('No browser extension API found');
}

// Performance-optimized background service
class AdBlockerService {
  constructor() {
    this.state = {
      enabled: true,
      statsCache: new Map(),
      lastUpdate: Date.now(),
      version: '1.0' // Match manifest version
    };
    
    this.init();
  }

  async init() {
    try {
      await this.loadState();
      this.setupListeners();
      this.startPerformanceMonitor();
      this.checkCompatibility();
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

    const missingAPIs = requiredAPIs.filter(api => !chrome[api]);
    if (missingAPIs.length > 0) {
      console.warn('Missing required APIs:', missingAPIs);
    }
  }

  async loadState() {
    try {
      const data = await chrome.storage.local.get(['enabled', 'stats', 'version']);
      this.state.enabled = data.enabled ?? true;
      if (data.stats) {
        this.state.statsCache = new Map(Object.entries(data.stats));
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
    await chrome.storage.local.set({ version: this.state.version });
  }

  setupListeners() {
    // Update message listener for service worker compatibility
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Service workers require immediate return and async handling
      const response = this.handleMessage(request, sender);
      response.then(sendResponse);
      return true;
    });

    // Tab update listener
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab).catch(error => {
        console.error('Tab update error:', error);
      });
    });// This file manages background tasks like enabling/disabling the ad blocker and tracking stats.
// It communicates with content.js and handles browser extension APIs.

// Cross-browser extension API compatibility
const browserAPI = chrome || browser;
if (!browserAPI) {
  console.error('No browser extension API found');
}

// Performance-optimized background service
class AdBlockerService {
  constructor() {
    this.state = {
      enabled: true,
      statsCache: new Map(),
      lastUpdate: Date.now(),
      version: '1.0' // Match manifest version
    };
    
    this.init();
  }

  async init() {
    try {
      await this.loadState();
      this.setupListeners();
      this.startPerformanceMonitor();
      this.checkCompatibility();
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

    const missingAPIs = requiredAPIs.filter(api => !chrome[api]);
    if (missingAPIs.length > 0) {
      console.warn('Missing required APIs:', missingAPIs);
    }
  }

  async loadState() {
    try {
      const data = await chrome.storage.local.get(['enabled', 'stats', 'version']);
      this.state.enabled = data.enabled ?? true;
      if (data.stats) {
        this.state.statsCache = new Map(Object.entries(data.stats));
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
    await chrome.storage.local.set({ version: this.state.version });
  }

  setupListeners() {
    // Update message listener for service worker compatibility
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Service workers require immediate return and async handling
      const response = this.handleMessage(request, sender);
      response.then(sendResponse);
      return true;
    });

    // Tab update listener
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab).catch(error => {
        console.error('Tab update error:', error);
      });
    });

    // Web request listener (if available)
    if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
      chrome.webRequest.onBeforeRequest.addListener(
        details => this.interceptAds(details),
        {
          urls: [
            "*://*.youtube.com/*",
            "*://*.doubleclick.net/*",
            "*://*.google-analytics.com/*",
            "*://*/api/stats/ads*",
            "*://*.googlesyndication.com/*", // Additional ad domains
            "*://*.youtube-nocookie.com/*"   // Privacy-enhanced YouTube embeds
          ]
        },
        ["blocking"]
      );
    }

    // Handle extension updates
    chrome.runtime.onUpdateAvailable.addListener(() => {
      chrome.runtime.reload();
    });
  }

  async handleMessage(request, sender) {
    try {
      switch(request.action) {
        case 'getState':
          return {
            success: true,
            enabled: this.state.enabled,
            stats: Object.fromEntries(this.state.statsCache),
            version: this.state.version
          };

        case 'setState':
          if (typeof request.enabled !== 'boolean') {
            throw new Error('Invalid enabled state');
          }
          this.state.enabled = request.enabled;
          await this.saveState();
          // Notify all tabs of state change
          await this.notifyAllTabs();
          return { success: true };

        case 'updateStats':
          if (!sender?.tab?.id) {
            throw new Error('Invalid sender');
          }
          await this.updateStats(sender.tab.id, request.stats);
          return { success: true };

        case 'resetStats':
          await this.resetStats();
          return { success: true };

        default:
          throw new Error('Unknown action');
      }
    } catch (error) {
      console.error('Message handler error:', error);
      return { success: false, error: error.message };
    }
  }

  async notifyAllTabs() {
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'stateUpdate',
          enabled: this.state.enabled
        });
      } catch (error) {
        console.warn(`Failed to notify tab ${tab.id}:`, error);
      }
    }
  }

  interceptAds(details) {
    try {
      if (!this.state.enabled) return {};
      
      const adPatterns = [
        'ad', 'ads', 'advert', 'doubleclick', 'analytics',
        'pagead', 'googleads', 'googlesyndication'
      ];
      const isAdRequest = adPatterns.some(pattern => 
        details.url.toLowerCase().includes(pattern)
      );

      if ((details.type === 'xmlhttprequest' || details.type === 'script') && isAdRequest) {
        return { cancel: true };
      }

      return {};
    } catch (error) {
      console.error('Ad interception error:', error);
      return {};
    }
  }

  startPerformanceMonitor() {
    setInterval(() => {
      try {
        this.checkMemoryUsage();
        this.cleanupOldStats();
      } catch (error) {
        console.warn('Performance monitoring error:', error);
      }
    }, 30000);
  }

  async checkMemoryUsage() {
    if (performance?.memory?.usedJSHeapSize > 50_000_000) {
      await this.cleanupResources();
    }
  }

  async cleanupResources() {
    try {
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const oldEntries = Array.from(this.state.statsCache.entries())
        .filter(([_, data]) => Date.now() - data.timestamp > twentyFourHours);
      
      oldEntries.forEach(([key]) => this.state.statsCache.delete(key));
      await this.saveState();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  async cleanupOldStats() {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const oldEntries = Array.from(this.state.statsCache.entries())
      .filter(([_, data]) => Date.now() - data.timestamp > thirtyDays);
    
    if (oldEntries.length > 0) {
      oldEntries.forEach(([key]) => this.state.statsCache.delete(key));
      await this.saveState();
    }
  }

  async resetStats() {
    this.state.statsCache.clear();
    await this.saveState();
  }

  async saveState() {
    try {
      await chrome.storage.local.set({
        enabled: this.state.enabled,
        stats: Object.fromEntries(this.state.statsCache),
        version: this.state.version
      });
    } catch (error) {
      console.error('Save state error:', error);
    }
  }

  async handleTabUpdate(tabId, changeInfo, tab) {
    try {
      if (changeInfo.status === 'complete' && 
          tab.url?.includes('youtube.com')) {
        await chrome.tabs.sendMessage(tabId, { 
          action: 'reinitialize',
          enabled: this.state.enabled
        });
      }
    } catch (error) {
      console.error('Tab update error:', error);
    }
  }

  async updateStats(tabId, newStats) {
    try {
      const key = new Date().toDateString();
      const currentStats = this.state.statsCache.get(key)?.count || 0;
      this.state.statsCache.set(key, {
        count: currentStats + (newStats.adsBlocked || 0),
        timestamp: Date.now()
      });
      await this.saveState();
    } catch (error) {
      console.error('Update stats error:', error);
    }
  }
}

// Initialize the service without try-catch (service workers handle this differently)
const adBlockerService = new AdBlockerService();

// Register service worker
chrome.runtime.onInstall.addListener(() => {
  console.log('Extension installed');
});

chrome.runtime.onActivate.addListener(() => {
  console.log('Extension activated');
});


    // Web request listener (if available)
    if (chrome.webRequest && chrome.webRequest.onBeforeRequest) {
      chrome.webRequest.onBeforeRequest.addListener(
        details => this.interceptAds(details),
        {
          urls: [
            "*://*.youtube.com/*",
            "*://*.doubleclick.net/*",
            "*://*.google-analytics.com/*",
            "*://*/api/stats/ads*",
            "*://*.googlesyndication.com/*", // Additional ad domains
            "*://*.youtube-nocookie.com/*"   // Privacy-enhanced YouTube embeds
          ]
        },
        ["blocking"]
      );
    }

    // Handle extension updates
    chrome.runtime.onUpdateAvailable.addListener(() => {
      chrome.runtime.reload();
    });
  }

  async handleMessage(request, sender) {
    try {
      switch(request.action) {
        case 'getState':
          return {
            success: true,
            enabled: this.state.enabled,
            stats: Object.fromEntries(this.state.statsCache),
            version: this.state.version
          };

        case 'setState':
          if (typeof request.enabled !== 'boolean') {
            throw new Error('Invalid enabled state');
          }
          this.state.enabled = request.enabled;
          await this.saveState();
          // Notify all tabs of state change
          await this.notifyAllTabs();
          return { success: true };

        case 'updateStats':
          if (!sender?.tab?.id) {
            throw new Error('Invalid sender');
          }
          await this.updateStats(sender.tab.id, request.stats);
          return { success: true };

        case 'resetStats':
          await this.resetStats();
          return { success: true };

        default:
          throw new Error('Unknown action');
      }
    } catch (error) {
      console.error('Message handler error:', error);
      return { success: false, error: error.message };
    }
  }

  async notifyAllTabs() {
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'stateUpdate',
          enabled: this.state.enabled
        });
      } catch (error) {
        console.warn(`Failed to notify tab ${tab.id}:`, error);
      }
    }
  }

  interceptAds(details) {
    try {
      if (!this.state.enabled) return {};
      
      const adPatterns = [
        'ad', 'ads', 'advert', 'doubleclick', 'analytics',
        'pagead', 'googleads', 'googlesyndication'
      ];
      const isAdRequest = adPatterns.some(pattern => 
        details.url.toLowerCase().includes(pattern)
      );

      if ((details.type === 'xmlhttprequest' || details.type === 'script') && isAdRequest) {
        return { cancel: true };
      }

      return {};
    } catch (error) {
      console.error('Ad interception error:', error);
      return {};
    }
  }

  startPerformanceMonitor() {
    setInterval(() => {
      try {
        this.checkMemoryUsage();
        this.cleanupOldStats();
      } catch (error) {
        console.warn('Performance monitoring error:', error);
      }
    }, 30000);
  }

  async checkMemoryUsage() {
    if (performance?.memory?.usedJSHeapSize > 50_000_000) {
      await this.cleanupResources();
    }
  }

  async cleanupResources() {
    try {
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const oldEntries = Array.from(this.state.statsCache.entries())
        .filter(([_, data]) => Date.now() - data.timestamp > twentyFourHours);
      
      oldEntries.forEach(([key]) => this.state.statsCache.delete(key));
      await this.saveState();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  async cleanupOldStats() {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const oldEntries = Array.from(this.state.statsCache.entries())
      .filter(([_, data]) => Date.now() - data.timestamp > thirtyDays);
    
    if (oldEntries.length > 0) {
      oldEntries.forEach(([key]) => this.state.statsCache.delete(key));
      await this.saveState();
    }
  }

  async resetStats() {
    this.state.statsCache.clear();
    await this.saveState();
  }

  async saveState() {
    try {
      await chrome.storage.local.set({
        enabled: this.state.enabled,
        stats: Object.fromEntries(this.state.statsCache),
        version: this.state.version
      });
    } catch (error) {
      console.error('Save state error:', error);
    }
  }

  async handleTabUpdate(tabId, changeInfo, tab) {
    try {
      if (changeInfo.status === 'complete' && 
          tab.url?.includes('youtube.com')) {
        await chrome.tabs.sendMessage(tabId, { 
          action: 'reinitialize',
          enabled: this.state.enabled
        });
      }
    } catch (error) {
      console.error('Tab update error:', error);
    }
  }

  async updateStats(tabId, newStats) {
    try {
      const key = new Date().toDateString();
      const currentStats = this.state.statsCache.get(key)?.count || 0;
      this.state.statsCache.set(key, {
        count: currentStats + (newStats.adsBlocked || 0),
        timestamp: Date.now()
      });
      await this.saveState();
    } catch (error) {
      console.error('Update stats error:', error);
    }
  }
}

// Initialize the service without try-catch (service workers handle this differently)
const adBlockerService = new AdBlockerService();

// Register service worker
chrome.runtime.onInstall.addListener(() => {
  console.log('Extension installed');
});

chrome.runtime.onActivate.addListener(() => {
  console.log('Extension activated');
});

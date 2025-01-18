// High-performance content script
class AdBlockerClient {
    constructor() {
      this.config = {
        selectors: new Set([
          '.ad-showing', '.video-ads', '.ytp-ad-overlay-container',
          'ytd-promoted-video-renderer', '.ytd-player-legacy-desktop-watch-ads-renderer',
          '[class*="ad-"]', '[id*="ad-"]', 
          '.ytd-player-legacy-desktop-watch-ads-renderer',
          '.ytp-ad-text', '.ytp-ad-preview-container',
          '.ytp-ad-skip-button-container',
          '.ytp-ad-progress',
          '.ytp-ad-progress-list',
          'ytd-in-feed-ad-layout-renderer',
          'ytd-banner-promo-renderer',
          'ytd-statement-banner-renderer',
          '.ytd-video-masthead-ad-v3-renderer',
          '.ytd-in-feed-ad-layout-renderer'
        ]),
        observerConfig: { childList: true, subtree: true, attributes: true },
        updateInterval: 100,
        batchSize: 10,
        retryAttempts: 3,
        retryDelay: 1000,
        statsReportInterval: 60000 // Report stats every minute
      };
  
      this.state = {
        adsBlocked: 0,
        lastCheck: Date.now(),
        isProcessing: false,
        enabled: true,
        lastStatsReport: Date.now(),
        errors: [],
        initialized: false
      };
  
      this.init();
    }
  
    async init() {
      try {
        // Check if document is ready
        if (document.readyState === 'loading') {
          await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve);
          });
        }
  
        // Listen for messages from background
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          if (message.action === 'reinitialize') {
            this.reinitialize();
          } else if (message.action === 'getState') {
            sendResponse({ state: this.state });
          } else if (message.action === 'setEnabled') {
            this.state.enabled = message.enabled;
          }
          return true; // Keep message channel open for async response
        });
  
        // Initial scan when page loads
        window.addEventListener('load', () => this.quickScan());
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) {
            this.quickScan();
          }
        });
  
        await this.setupObservers();
        await this.injectStyles();
        this.startPeriodicCheck();
        this.startStatsReporting();
        
        this.state.initialized = true;
        console.log('YouTube Ad Blocker initialized successfully');
      } catch (error) {
        console.error('Initialization error:', error);
        this.state.errors.push({ time: Date.now(), error: error.message });
      }
    }
  
    async setupObservers() {
      try {
        // Cleanup existing observers
        if (this.observer) {
          this.observer.disconnect();
        }
        if (this.intersectionObserver) {
          this.intersectionObserver.disconnect();
        }
  
        this.setupObserver();
        this.setupIntersectionObserver();
      } catch (error) {
        console.error('Observer setup error:', error);
        this.state.errors.push({ time: Date.now(), error: error.message });
      }
    }
  
    async reinitialize() {
      try {
        await this.setupObservers();
        await this.quickScan();
      } catch (error) {
        console.error('Reinitialization error:', error);
        this.state.errors.push({ time: Date.now(), error: error.message });
      }
    }
  
    setupObserver() {
      this.observer = new MutationObserver(
        this.debounce(this.handleMutations.bind(this), 50)
      );
      if (document.body) {
        this.observer.observe(document.body, this.config.observerConfig);
      }
    }
  
    setupIntersectionObserver() {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && this.isAdElement(entry.target)) {
              this.removeAd(entry.target);
            }
          });
        },
        { threshold: 0.1 }
      );
    }
  
    async handleMutations(mutations) {
      if (this.state.isProcessing || !this.state.enabled) return;
      
      this.state.isProcessing = true;
      try {
        const newElements = new Set();
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) newElements.add(node);
          });
          // Also check modified elements
          if (mutation.target && mutation.type === 'attributes') {
            newElements.add(mutation.target);
          }
        });
  
        await this.processElements(Array.from(newElements));
      } finally {
        this.state.isProcessing = false;
      }
    }
  
    async processElements(elements) {
      if (!this.state.enabled) return;
      
      const chunks = this.chunkArray(elements, this.config.batchSize);
      for (const chunk of chunks) {
        await new Promise(resolve => {
          requestAnimationFrame(() => {
            try {
              chunk.forEach(element => {
                if (element && this.isAdElement(element)) {
                  this.removeAd(element);
                }
                if (element && this.intersectionObserver) {
                  this.intersectionObserver.observe(element);
                }
                // Check children for nested ads
                if (element) {
                  const children = element.querySelectorAll('*');
                  children.forEach(child => {
                    if (this.isAdElement(child)) {
                      this.removeAd(child);
                    }
                  });
                }
              });
            } catch (error) {
              console.warn('Element processing error:', error);
              this.state.errors.push({ time: Date.now(), error: error.message });
            }
            resolve();
          });
        });
      }
    }
  
    isAdElement(element) {
      if (!element) return false;
      
      return Array.from(this.config.selectors).some(selector => {
        try {
          return element.matches(selector);
        } catch {
          return false;
        }
      }) || this.checkCustomAdPatterns(element);
    }
  
    checkCustomAdPatterns(element) {
      const patterns = [
        /sponsored/i,
        /advertisement/i,
        /promoted/i,
        /ad-\w+/i
      ];
      
      return patterns.some(pattern => 
        (element.id && pattern.test(element.id)) ||
        (element.className && pattern.test(element.className)) ||
        (element.getAttribute('data-purpose') && pattern.test(element.getAttribute('data-purpose')))
      );
    }
  
    removeAd(element) {
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
        this.state.adsBlocked++;
        this.reportStats();
      }
    }
  
    async injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        ${Array.from(this.config.selectors).join(',')} {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `;
      document.head.appendChild(style);
    }
  
    startPeriodicCheck() {
      setInterval(() => {
        if (Date.now() - this.state.lastCheck > 1000) {
          this.quickScan();
          this.state.lastCheck = Date.now();
        }
      }, this.config.updateInterval);
    }
  
    startStatsReporting() {
      setInterval(() => {
        if (Date.now() - this.state.lastStatsReport > this.config.statsReportInterval) {
          this.reportStats();
          this.state.lastStatsReport = Date.now();
        }
      }, this.config.statsReportInterval);
    }
  
    async quickScan() {
      if (!this.state.enabled) return;
      
      try {
        const elements = document.querySelectorAll(Array.from(this.config.selectors).join(','));
        await this.processElements(Array.from(elements));
      } catch (error) {
        console.warn('Quick scan error:', error);
        this.state.errors.push({ time: Date.now(), error: error.message });
      }
    }
  
    reportStats() {
      chrome.runtime.sendMessage({
        action: 'updateStats',
        stats: {
          adsBlocked: this.state.adsBlocked,
          timestamp: Date.now(),
          errors: this.state.errors.slice(-10) // Send last 10 errors
        }
      });
    }
  
    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }
  
    chunkArray(array, size) {
      const chunks = [];
      for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
      }
      return chunks;
    }
  }
  
  // Initialize the ad blocker
  new AdBlockerClient();
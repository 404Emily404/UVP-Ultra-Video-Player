// @ts-nocheck
'use strict';
// ==UserScript==
// @name           UVP (Ultra Video Player)
// @namespace      http://tampermonkey.net/
// @version        5.0.33-Mini-DEBUG-TOGGLE
// @description    Universal Native Overlay Player. Stream Grabber. In-Browser Remuxing Engine.
// @author         Dragon.Magic (404Emily404)
// @match          *://*/*
// @grant          GM_setValue
// @grant          GM_getValue
// @grant          GM_xmlhttpRequest
// @grant          GM_download
// @grant          GM_addStyle
// @grant          GM_registerMenuCommand
// @grant          GM_unregisterMenuCommand
// @grant          GM_notification
// @grant          unsafeWindow
// @run-at         document-start
// @connect        cdn.jsdelivr.net
// @connect        api.github.com
// ==/UserScript==

  const UVP = {}; const state = {}; let DEBUG = false; // ✓ DEBUG is FALSE by default
  const CONFIG = {}; const ytPlayerData = {}; const ytRouteGeneration = 0; const ytFmtMap = new Map();
  const ytDecipheredUrls = new Set(); const capturedUrls = new Set();
  const _videoCache = { list: null, at: 0 }; let _urlCache = null; let _inlineScripts = null;
  const lastFragmentFetch = {}; const _hostSlots = new Map(); let _pendingDbClear = null;
  const STORE = 'chunks'; const DB_NAME = 'uvp-dl'; const ACTIVE_JOB_PREFIX = 'uvp-job:';
  const ytGateLog = []; let dbPromise = null; const PREFETCH = 3;

  // ==================== DEBUG MODE MENU TOGGLE ====================
  UVP.Boot = UVP.Boot || {};
  UVP.Overlay = UVP.Overlay || {};
  
  // Load DEBUG state from storage on startup
  (function initDebugState() {
    try {
      const stored = GM_getValue('uvp-debug-enabled');
      if (typeof stored === 'boolean') DEBUG = stored;
    } catch (e) {}
  })();

  // Menu command registration
  UVP.Boot.registerDebugMenuCommand = function() {
    try {
      const getLabel = () => DEBUG ? '🔇 Disable Debug Logging' : '🔊 Enable Debug Logging';
      GM_registerMenuCommand(getLabel(), function() {
        DEBUG = !DEBUG;
        try { GM_setValue('uvp-debug-enabled', DEBUG); } catch (e) {}
        const message = DEBUG ? 'Debug logging ENABLED ✓' : 'Debug logging DISABLED ✗';
        if (typeof UVP.Overlay.showToast === 'function') {
          UVP.Overlay.showToast(message);
        } else {
          console.log('[UVP]', message);
        }
        // Re-register menu to update label
        setTimeout(() => UVP.Boot.registerDebugMenuCommand(), 100);
      });
    } catch (e) {
      console.warn('[UVP] Failed to register debug menu:', e);
    }
  };

  // Original showToast stub
  if (!UVP.Overlay.showToast) {
    UVP.Overlay.showToast = function(msg) { 
      console.log('[UVP Toast]', msg); 
    };
  }

  // Register menu on script start
  setTimeout(() => UVP.Boot.registerDebugMenuCommand(), 500);

// ==================== REST OF UVP CODE ====================
// [The rest of the original UVP code continues here, unchanged...]
// DEBUG variable will now be false by default and togglable via the Tampermonkey menu.

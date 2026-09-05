// ==UserScript==
// @name         UVP Ultra Video Player v5.0.1
// @namespace    uvp-native-overlay
// @version      5.0.1
// @description  High-Performance Native Overlay, Media Streamer & Local Format-Shifting Engine
//               Enhance your viewing experience with a clean, privacy-focused client-side video interface.
//               UVP is an open-source browser enhancement tool engineered to replace bloated, resource-heavy web players with an isolated, hardware-accelerated **Native Overlay Player**. It provides full accessibility support, native controls, smooth Picture-in-Picture, and automated local media remuxing for publicly accessible web streams.
// @author	 Dragon.Magic (404Emily404)
// @license      PolyForm Strict License 1.0.0
// @copyright    © 2026 Dragon.Magic (404Emily404)
// @match        *://*/*
// @exclude      *://facebook.com/*
// @exclude      *://*.facebook.com/*
// @exclude      *://instagram.com/*
// @exclude      *://*.instagram.com/*
// @exclude      *://tiktok.com/*
// @exclude      *://*.tiktok.com/*
// @exclude      *://twitch.tv/*
// @exclude      *://*.twitch.tv/*
// @exclude      *://netflix.com/*
// @exclude      *://*.netflix.com/*
// @exclude      *://amazon.com/*
// @exclude      *://*.amazon.com/*
// @exclude      *://primevideo.com/*
// @exclude      *://*.primevideo.com/*
// @exclude      *://disneyplus.com/*
// @exclude      *://*.disneyplus.com/*
// @exclude      *://max.com/*
// @exclude      *://*.max.com/*
// @exclude      *://hulu.com/*
// @exclude      *://*.hulu.com/*
// @exclude      *://paramountplus.com/*
// @exclude      *://*.paramountplus.com/*
// @exclude      *://peacocktv.com/*
// @exclude      *://*.peacocktv.com/*
// @exclude      *://bilibili.com/*
// @exclude      *://*.bilibili.com/*
// @exclude      *://dailymotion.com/*
// @exclude      *://*.dailymotion.com/*
// @exclude      *://vimeo.com/*
// @exclude      *://*.vimeo.com/*
// @exclude      *://onlyfans.com/*
// @exclude      *://*.onlyfans.com/*
// @noframes
// @run-at       document-start
// @require      https://cdn.jsdelivr.net/npm/hls.js@1.7.1/dist/hls.min.js#sha384=X6qxWXYhVZFp6V31bNDBz4eOoPnZloPbOdTcnhnvRJY2+2pDMrO7R4/1mXfJ9VXY
// @require      https://cdn.jsdelivr.net/npm/dashjs@5.2.1/dist/modern/umd/dash.all.min.js#sha384=NwbBGevMmVf2Lv50ZqQWLZ0dLH69dxVHYeS+8t54klP9odovQ2+Ms0J4SWfKzPkr
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_download
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_getResourceText
// @grant        GM_getResourceURL
// @grant        GM_addStyle
// @grant        GM_log
// @grant        GM_setClipboard
// @grant        GM_openInTab
// @grant        GM.openInTab
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addElement
// @grant        GM.addElement
// @grant        window.onurlchange
// @connect      *
// @downloadURL https://update.greasyfork.org/scripts/591828/UVP%20Ultra%20Video%20Player%20v501.user.js
// @updateURL https://update.greasyfork.org/scripts/591828/UVP%20Ultra%20Video%20Player%20v501.meta.js
// ==/UserScript==
 
(function () {
  'use strict';

  // Sandboxed frames / about:blank guard — prevents execution and CSP errors in unprivileged iframes
  if (typeof window !== 'undefined' && window.location) {
    try {
      const proto = window.location.protocol || '';
      if (proto === 'about:' || proto === 'javascript:' || proto === 'blob:') return;
      if (typeof window.top !== 'undefined' && window.top !== null && window.self !== window.top) {
        if (window.location.href === 'about:blank' || (!window.location.hostname && !window.location.host)) return;
      }
    } catch (e) { return; }
  }

  // ==================== MODULE REGISTRY ====================
  const UVP = {
    Config: {},
    Utils: {},
    State: {},
    Network: {},
    Extractors: {},
    Download: {},
    Overlay: {},
    Boot: {},
    StateMachine: {},
    Events: {},
    Cancel: {},
    Muxer: {},
    MPD: {}
  };
 
  // ==================== STATE MACHINE ====================
  UVP.StateMachine = {
    state: 'IDLE',

    STATES: {
      IDLE: 'IDLE',
      PLAYING: 'PLAYING',
      DOWNLOADING: 'DOWNLOADING',
      RECOVERING: 'RECOVERING',
      FAILED: 'FAILED'
    },

    TRANSITIONS: {
      IDLE: ['PLAYING', 'DOWNLOADING', 'FAILED'],
      PLAYING: ['DOWNLOADING', 'RECOVERING', 'IDLE', 'FAILED'],
      DOWNLOADING: ['PLAYING', 'IDLE', 'FAILED'],
      RECOVERING: ['PLAYING', 'IDLE', 'FAILED'],
      FAILED: ['IDLE', 'PLAYING', 'DOWNLOADING']
    },

    transition: function(newState, context) {
      const oldState = this.state;
      if (oldState === newState) return oldState;
      const allowed = this.TRANSITIONS[oldState] || [];
      if (!allowed.includes(newState)) {
        if (DEBUG) console.warn('[UVP] Invalid state transition:', oldState, '->', newState, context);
        return oldState;
      }
      this.state = newState;
      if (DEBUG) console.log('[UVP] State:', oldState, '->', newState, context);
      return newState;
    },

    getState: function() { return this.state; },
    is: function(state) { return this.state === state; },
    can: function(newState) { return (this.TRANSITIONS[this.state] || []).includes(newState); }
  };

  // ==================== EVENT BUS ====================
  UVP.Events = {
    _listeners: {},
    on: function(event, handler) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(handler);
      return () => this.off(event, handler);
    },
    off: function(event, handler) {
      if (!this._listeners[event]) return;
      this._listeners[event] = this._listeners[event].filter(h => h !== handler);
    },
    emit: function(event, payload) {
      if (!this._listeners[event]) return;
      this._listeners[event].slice().forEach(h => {
        try { h(payload); } catch (e) { if (DEBUG) console.warn('[UVP] Event handler error for ' + event + ':', e); }
      });
    }
  };

  // ==================== CANCELLATION SCOPES ====================
  UVP.Cancel = {
    _counter: 0,
    _current: null,
    createScope: function() {
      // Abort any previous scope and run the same cleanup path a direct cancel would.
      this.cancelCurrent();
      this._counter++;
      const scope = {
        token: this._counter,
        aborted: false,
        _hooks: [],
        onAbort: function(fn) {
          if (this.aborted) { try { fn(); } catch (e) {} return () => {}; }
          this._hooks.push(fn);
          return () => {
            const idx = this._hooks.indexOf(fn);
            if (idx >= 0) this._hooks.splice(idx, 1);
          };
        },
        abort: function() {
          if (this.aborted) return;
          this.aborted = true;
          this._hooks.slice().forEach(fn => { try { fn(); } catch (e) {} });
        },
        check: function() { return !this.aborted; }
      };
      this._current = scope;
      return scope;
    },
    current: function() { return this._current; },
    cancelCurrent: function() {
      if (this._current) {
        const canceledScope = this._current;
        const canceledJob = currentDownloadJob;
        this._current.abort();
        this._current = null;
        UVP.Events.emit('download:cancel', { job: canceledJob, scope: canceledScope });
        return true;
      }
      return false;
    },
    isCurrent: function(scope) {
      return scope && !scope.aborted && scope === this._current;
    }
  };

  let DEBUG = false; // toggled at runtime via the "UVP: Toggle debug logging" menu command

  // ==================== ADGUARD DETECTION ====================
  // AdGuard's Userscript Module supports standard GM_ and GM4 APIs (GM_xmlhttpRequest,
  // GM_registerMenuCommand, GM_addElement, GM_openInTab, GM_notification, ADG_policyApi,
  // window.onurlchange, etc.). GM_download is not supported in AdGuard, so media downloads
  // utilize the high-performance in-memory / blob download engine. Defined BEFORE CONFIG so
  // the mutation below runs.
  UVP.Utils.isAdGuard = function() {
    try {
      const gmInfo = (typeof GM_info !== 'undefined' && GM_info) || ((typeof GM === 'object' && GM && GM.info) || null);
      if (gmInfo && gmInfo.scriptHandler && /adguard/i.test(gmInfo.scriptHandler)) return true;
    } catch (e) {}
    try {
      if (typeof GM === 'object' && GM && typeof GM.registerMenuCommand === 'function' && typeof GM_download === 'undefined') return true;
    } catch (e) {}
    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow && unsafeWindow.adguard) return true;
    } catch (e) {}
    return false;
  };
  // Runtime detection result: must evaluate after CONFIG initialization (TDZ guard).
  UVP.isAdGuardDetected = UVP.Utils.isAdGuard();

  const CONFIG = {
    showButton: true,
    buttonLabel: '',
    loopPlayback: true,
    rescanIntervalMs: 1000,
    minVideoWidth: 80,
    playerTtlMs: 5 * 60 * 1000,
    dlStallMs: 45 * 1000,
    segTimeoutMs: 20000,          // caller timeout for HLS key/init/segment fetches (the stall watchdog + hard backstop inside requestCrossOriginWithRetry operate beneath it)
    stallWatchdogMs: 30000,       // abort+retry a transfer only when NO bytes arrive for this long; flowing transfers are never total-time killed
    hardTimeoutBackstopMs: 600000, // absolute max transfer duration (safety backstop; the stall watchdog is the operative guard)
    retryMaxDelayMs: 30000,       // clamp for retry delays (Retry-After headers can be huge)
    manifestTimeoutMs: 10000,    // shorter timeout for manifest/master playlist fetches (CDN tokens expire)
    mp4TimeoutMs: 120000,
    stallThresholdSec: 8,
    maxConcurrentDownloads: 5,
    segMaxRetries: 3,
    retryBaseMs: 1000,             // base delay for network retries
    retryMultiplier: 1.5,          // exponential backoff multiplier
    retryJitterMs: 500,            // random jitter added to retry delay
    buttonLoadDelayMs: 1500, // delay initial button so website autoplay starts first
    mp4PreferManual: false,        // true = skip GM_download, go straight to right-click save
    mp4AllowBlobFallback: false,   // true = as a last resort, pull the whole file into RAM (automated)
    maxRecoveryAttempts: 5,
    observerDebounceMs: 800,        // MutationObserver debounce for site extractors
    scrollDebounceMs: 500,         // hide button while scrolling, then reposition
    saveJobMetaThrottleMs: 2000,   // throttle sessionStorage writes during HLS download
    rgTokenTtlMs: 23 * 60 * 60 * 1000, // RedGifs temporary token expiry (~23h)
    recoveryDelaysMs: [300, 700, 1200, 2000, 3000, 5000, 8000], // progressive backoff between recovery attempts
    // Timing & lifecycle constants
    resumeDelayMs: 500,           // pageshow / resume / visibility resume delay
    overlayRestoreDelayMs: 800,   // delay before restoring overlay from sessionStorage
    hlsFatalErrorRecoveryDelayMs: 300, // delay before recovery after fatal HLS error
    recoveryHardResetDelayMs: 150, // delay before reattaching video after hard reset
    seekHandlerTimeoutMs: 15000,  // pending seek handler cleanup timeout
    blobRevokeDelayMs: 10000,     // URL.revokeObjectURL delay after blob download
    siteExtractInitialDelayMs: 500, // initial extraction delay after DOM ready
    ytExtractDebounceMs: 800,     // YouTube page mutation debounce
    ytFmtTtlMs: 30 * 60 * 1000,   // YouTube format cache TTL (SPA route freshness window)
    hlsRecoveryWindowMs: 5000,    // min interval between instant fatal HLS.js recovery attempts (per hls.js docs)
    hlsMaxRecoveries: 3,          // max instant recoveries per window before escalating to overlay hard recovery
    playbackStartHighest: true,   // start HLS at the highest available level; DASH always uses bandwidth-estimated ABR startup
    maxManifestRetries: 3,        // max alternate same-host m3u8 URLs tried when the primary fails to parse
    perHostConcurrency: 4,        // per-host connection cap — OVH/S3 gateways reset bursts of simultaneous segment requests
    gmDownloadWatchdogMs: 20000,  // GM_download shim that never fires callbacks is aborted after this window; built-in engine takes over
    // S3-compatible cloud storage gateways (OVH/Scaleway): bounded concurrency and Range-resume for large segments
    s3HostRe: /(^|\.)(s3[\.-]|scw\.cloud)|cloud\.ovh\.net|ovh\.net/i,
    manifestStallMs: 10000,       // stall-abort threshold for manifest-class fetches (timeoutMs <= manifestTimeoutMs)
    segRangeResumeMaxBytes: 536870912, // 512MB cap on the Range-resume partial stash per retrying segment
    // DASH adaptive playback: client-generated MPD (SegmentBase byte ranges) played by dash.js for synced native ABR.
    dashSeekGraceMs: 30000,      // normal grace period during unbuffered seeks
    dashSeekMaxGraceMs: 45000,   // absolute cap even while progress events continue
    dashProgressExtendMs: 8000,  // progress must remain this recent to extend beyond normal grace
    dashErrorDedupMs: 2000,      // window for deduplicating identical dash.js error events
    dashTransientRecoveryDelayMs: 2500, // watchdog cadence for transient fragment/sidx/network errors
    // Decode overload is distinct from a network stall: currentTime can advance
    // from the audio clock while the compositor drops video frames. Require a
    // healthy runway and several samples before changing a user's quality.
    decodeDropRatioThreshold: 0.20,
    decodeDropMinFrames: 15,
    decodeDropWarmupSamples: 5,
    decodeDropStreakSamples: 3,
    decodeDropMinRunwaySec: 3,
    decodeDropCooldownMs: 15000,
    // 4K cold-start guard: ladders whose TOP level exceeds this bitrate
    // (2160p ≈ 25-45Mbps; first segment ≈ 100MB on PMV Haven) do NOT get a
    // forced top startLevel — hls.js ABR picks a sustainable start level and
    // climbs to the top within a few fragments. A forced 4K cold start cannot
    // finish buffering inside any sane stall window, and the recovery loop
    // destroyed the partial download forever (the /video/ page load failure).
    hlsColdStartMaxBitrate: 20000000,
    // While the FIRST hls.js segment is still downloading into an empty
    // buffer and fragments keep flowing, the stall monitor and recovery defer
    // instead of resetting (a reset would throw away the partial download).
    hlsStartupBufferGraceMs: 20000,
    // First-click readiness gate (YouTube): @require'd hls.js/dashjs bundles
    // inject with the userscript at document-start and delay the interception
    // wrappers (~600ms under AdGuard), so an immediate button click can race
    // the InnerTube client ladder and the n-sig solver — the overlay opens
    // against missing or still-locked formats and stalls (the click-right-
    // after-load failure). Bounded waits below close that race; on timeout
    // the original behavior applies.
    playFormatWaitMs: 10000,   // max wait for the videoId-keyed format map to become current
    playDecipherWaitMs: 6000,  // max wait for the chosen URL's n-param to be deciphered
  };

  // Environment adaptations - MUST run after CONFIG is initialized (TDZ).
  // When GM_download is unavailable (AdGuard, Greasemonkey 4, etc.), auto-enable
  // the blob engine fallback so downloads proceed seamlessly in memory.
  if (UVP.isAdGuardDetected || typeof GM_download === 'undefined') {
    CONFIG.mp4AllowBlobFallback = true;
    if (DEBUG) console.log('[UVP] Non-GM_download environment detected - auto-enabling MP4 blob engine');
  }
 
 
  const state = {
    overlay: null, video: null, audio: null, hls: null, overlayUrl: null, targetAudioUrl: null,
    overlayIsLive: false,      // true while the overlay plays a live stream (YouTube HLS manifest)
    buttonDismissed: false, targetVideo: null, syncInterval: null,
    isDownloading: false, wasPaused: false, downloadPercent: 0, downloadText: 'Save',
    recoveryTimer: null, healthTimer: null, lastVideoTime: 0, stallCount: 0,
    pendingSeekHandler: null, buttonSyncFrame: null, buttonUpdateFrame: null,
    recoveryAttempts: 0,
    sitePlayerFailed: false,
    backgroundWasPlaying: false,
    backgroundPauseCaptured: false,
    suppressPlaybackStateEvents: false,
    videoErrorHandler: null,
    videoPlayHandler: null,
    videoPauseHandler: null,
    targetWasMuted: false,
    targetAudioSaved: false,
    buttonRescanInterval: null,  // Interval ID for button rescan
    saveStateInterval: null,    // periodic player state save while overlay is open
    escHandler: null,           // Esc-to-close keydown listener while overlay is open
    // DASH session state: dash.js player instance and generated MPD blob URL (single element governs both tracks).
    dashPlayer: null,
    dashMpdUrl: null,
    dashMpdOwned: false,
    dashActivity: null,
    dashFailover: null,
    overlayGeneration: 0,
    decodeMetrics: null,
    decodeDowngradeAt: 0,
    decodeDowngradeExhaustedUrl: null,
    isDetachedPip: false,
    isMiniPlayer: false,
    _activePlaybackSource: null,
    _activePoster: null,
    _activeRgId: null,
    buttonTargetVideo: null,
    buttonHiddenByScroll: false,
  };
 
  let currentDownloadJob = null;
  let currentDownloadScope = null;
  let resumeInProgress = false;
  let pauseIntruderHandler = null;
  const lastPointer = { x: -1, y: -1, at: 0 };
  let pointerUpdateTimer = null;
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pointermove', (e) => {
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
      lastPointer.at = Date.now();
      if (!pointerUpdateTimer && UVP.Overlay && UVP.Overlay.updateButtonPosition) {
        pointerUpdateTimer = requestAnimationFrame(() => {
          pointerUpdateTimer = null;
          if (!state.overlay && !state.buttonHiddenByScroll) UVP.Overlay.updateButtonPosition();
        });
      }
    }, { passive: true });
  }

  // Intercept exit events transitioning into the native play button.
  // Sites like RedGifs listen to mouseleave/mouseout to deactivate feed cards/tiles
  // and unmount preview videos. Moving the mouse onto the UVP button sitting over
  // the card must not trigger card deactivation or video resets.
  if (typeof document !== 'undefined' && document.addEventListener) {
    const onHoverExitToButton = (e) => {
      const btn = document.getElementById('uvp-native-btn');
      if (!btn || btn.style.display === 'none') return;
      const rel = e.relatedTarget;
      if (rel && (rel === btn || btn.contains(rel))) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener('mouseout', onHoverExitToButton, true);
    document.addEventListener('mouseleave', onHoverExitToButton, true);
    document.addEventListener('pointerout', onHoverExitToButton, true);
    document.addEventListener('pointerleave', onHoverExitToButton, true);
  }
 
  UVP.Utils.resolveSafeUrl = function(r, b) { try { return new URL(r, b).href; } catch (e) { return r; } }

  // Recursively search both light DOM and all open shadowRoot trees for <video> elements
  UVP.Utils.findAllVideos = function(root) {
    root = root || document;
    const results = [];
    const seen = new Set();
    const walker = (node) => {
      if (!node) return;
      if (node.tagName === "VIDEO" && node !== state.video) {
        if (!seen.has(node)) { seen.add(node); results.push(node); }
      }
      if (node.shadowRoot) walker(node.shadowRoot);
      let child = node.firstElementChild;
      while (child) {
        walker(child);
        child = child.nextElementSibling;
      }
    };
    if (root.querySelectorAll) {
      try { root.querySelectorAll("video").forEach(v => { if (v !== state.video) { seen.add(v); results.push(v); } }); } catch (e) {}
    }
    try { walker(root); } catch (e) {}
    return results;
  };
 
  // ==================== UNIVERSAL TRUSTED TYPES POLICY ====================
  // Handles Chrome/Edge Trusted Types enforcement on sites like YouTube
  // (require-trusted-types-for 'script'). Integrates AdGuard's ADG_policyApi and
  // standard Trusted Types to wrap evaluated strings in TrustedScript / TrustedScriptURL / TrustedHTML.
  const UVP_TT = (() => {
    let policy = null;
    let initialized = false;
    const realmPolicies = typeof WeakMap === 'function' ? new WeakMap() : null;

    const getAdgPolicy = () => {
      try {
        if (typeof ADG_policyApi !== 'undefined' && ADG_policyApi) return ADG_policyApi;
      } catch (e) {}
      try {
        if (typeof unsafeWindow !== 'undefined' && unsafeWindow && unsafeWindow.ADG_policyApi) return unsafeWindow.ADG_policyApi;
      } catch (e) {}
      return null;
    };

    const factoryFor = (realm) => {
      try {
        if (realm && realm.trustedTypes && typeof realm.trustedTypes.createPolicy === 'function') return realm.trustedTypes;
      } catch (e) {}
      return null;
    };

    const getFactory = () => {
      try {
        if (typeof unsafeWindow !== 'undefined' && unsafeWindow) {
          const factory = factoryFor(unsafeWindow);
          if (factory) return factory;
        }
      } catch (e) {}
      try {
        const factory = factoryFor(typeof globalThis !== 'undefined' ? globalThis : window);
        if (factory) return factory;
      } catch (e) {}
      return null;
    };

    const candidateNames = ['uvp_trusted_policy', 'goog#html', 'polymer-html-inline', 'default', 'tampermonkey'];
    const rules = {
      createScript: (s) => s,
      createScriptURL: (u) => u,
      createHTML: (h) => h,
    };
    const createPolicy = (factory) => {
      if (!factory) return null;
      if (realmPolicies) {
        try { const cached = realmPolicies.get(factory); if (cached) return cached; } catch (e) {}
      }
      let created = null;
      for (const name of candidateNames) {
        try { created = factory.createPolicy(name, rules); if (created) break; } catch (e) {}
      }
      if (!created) { try { created = factory.defaultPolicy || null; } catch (e) {} }
      if (created && realmPolicies) { try { realmPolicies.set(factory, created); } catch (e) {} }
      return created;
    };

    const init = () => {
      if (initialized) return;
      initialized = true;
      policy = createPolicy(getFactory());
    };

    const scriptFor = (realm, code, allowAdg) => {
      if (allowAdg) {
        const adg = getAdgPolicy();
        if (adg && typeof adg.createScript === 'function') {
          try { return adg.createScript(code); } catch (e) {}
        }
      }
      const realmPolicy = createPolicy(factoryFor(realm));
      if (realmPolicy && typeof realmPolicy.createScript === 'function') {
        try { return realmPolicy.createScript(code); } catch (e) {}
      }
      return code;
    };

    const isTrustedScriptFor = (realm, value, allowAdg) => {
      const factory = factoryFor(realm);
      if (!factory) return true;
      try { if (typeof factory.isScript === 'function') return factory.isScript(value); } catch (e) {}
      if (allowAdg) {
        const adg = getAdgPolicy();
        try { if (adg && typeof adg.isScript === 'function') return adg.isScript(value); } catch (e) {}
      }
      return typeof value !== 'string';
    };

    return {
      script: (code) => {
        const adg = getAdgPolicy();
        if (adg && typeof adg.createScript === 'function') {
          try { return adg.createScript(code); } catch (e) {}
        }
        init();
        if (policy && typeof policy.createScript === 'function') {
          try { return policy.createScript(code); } catch (e) {}
        }
        return code;
      },
      scriptFor,
      isTrustedScriptFor,
      hasFactory: (realm) => !!factoryFor(realm),
      hasAdg: () => {
        const adg = getAdgPolicy();
        return !!(adg && adg.isSupported !== false && typeof adg.createScript === 'function');
      },
      scriptURL: (url) => {
        const adg = getAdgPolicy();
        if (adg && typeof adg.createScriptURL === 'function') {
          try { return adg.createScriptURL(url); } catch (e) {}
        }
        init();
        if (policy && typeof policy.createScriptURL === 'function') {
          try { return policy.createScriptURL(url); } catch (e) {}
        }
        return url;
      },
      html: (html) => {
        const adg = getAdgPolicy();
        if (adg && typeof adg.createHTML === 'function') {
          try { return adg.createHTML(html); } catch (e) {}
        }
        init();
        if (policy && typeof policy.createHTML === 'function') {
          try { return policy.createHTML(html); } catch (e) {}
        }
        return html;
      }
    };
  })();

  UVP.Utils.safeNewFunction = function(...args) {
    const body = args.pop() || '';
    const params = args.join(', ');
    const wrappedCode = '(function(' + params + ') {\n' + body + '\n})';
    const sandboxRealm = typeof globalThis !== 'undefined' ? globalThis : window;
    const pageRealm = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : null;
    const errors = [];
    const acceptFunction = (value) => typeof value === 'function' ? value : null;

    // Keep each TrustedScript paired with the eval function from the same
    // realm. A TrustedScript produced in the userscript isolated world is not
    // valid for YouTube's page-world eval (and vice versa).
    const tryRealm = (realm, allowAdg) => {
      if (!realm || typeof realm.eval !== 'function') return null;
      const value = UVP_TT.scriptFor(realm, wrappedCode, allowAdg);
      if (!UVP_TT.isTrustedScriptFor(realm, value, allowAdg)) return null;
      try { return acceptFunction(realm.eval.call(realm, value)); }
      catch (e) { errors.push(e); return null; }
    };
    let fn = tryRealm(sandboxRealm, true);
    if (fn) return fn;
    if (pageRealm && pageRealm !== sandboxRealm) {
      fn = tryRealm(pageRealm, false);
      if (fn) return fn;
    }

    // Raw Function is only a compatibility fallback when neither realm has
    // Trusted Types. Chromium's Function constructor does not reliably accept
    // TrustedScript and emits the misleading secondary violation seen here.
    const ttPresent = UVP_TT.hasFactory(sandboxRealm) || UVP_TT.hasFactory(pageRealm) || UVP_TT.hasAdg();
    if (!ttPresent) {
      try { return new Function(...args, body); } catch (e) { errors.push(e); }
    }
    const last = errors[errors.length - 1];
    throw new Error('UVP dynamic evaluation blocked by Trusted Types' + (last && last.message ? ': ' + last.message : ''));
  };

  // ==================== SAFE CALL HELPERS ====================
  UVP.Utils.safeCall = function(fn, name) {
    try { return fn(); } catch (e) { if (DEBUG) console.warn('[UVP] ' + name + ' failed:', e); }
  };
  UVP.Utils.safeAwait = async function(promise, name) {
    try { return await promise; } catch (e) { if (DEBUG) console.warn('[UVP] ' + name + ' failed:', e); }
  };

  // Balanced brace-matching parser for object literals (handles nested braces, strings, and escapes).
  UVP.Utils.matchBrace = function(str, openIdx) {
    let depth = 0, inStr = false, strChar = '', esc = false;
    for (let i = openIdx; i < str.length; i++) {
      const c = str[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === strChar) inStr = false;
      } else {
        // Template literals count too: a backtick string containing an
        // unbalanced { or } desynced depth counting (flashvars/initials/
        // ytInitialPlayerResponse parsing). `${...}` interpolation braces are
        // almost always balanced within the expression, so treating the whole
        // literal as opaque is the safer approximation.
        if (c === '"' || c === "'" || c === '`') { inStr = true; strChar = c; }
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return str.slice(openIdx, i + 1); }
      }
    }
    return null;
  };

  // ==================== NETWORK INTERCEPTION ====================
  const capturedUrls = new Set();
  // Protocol metadata preserves extension-less manifest classification learned
  // from response Content-Type headers or structured page data.
  const capturedUrlKinds = new Map(); // URL -> dash|hls|fragment|direct|unknown
  // JSON-LD VideoObject URLs (contentUrl/embedUrl): authoritative server-rendered markup.
  const jsonLdUrls = new Set();
  let staleJsonLdUrls = new Set(); // Tracks JSON-LD URLs from the previous SPA route to detect stale DOM
  let _urlCache = null;       // Cached extractAllUrls result per extraction cycle
  let _inlineScripts = null;  // Cached inline script elements per extraction cycle
  UVP.Utils.invalidateUrlCache = function() { _urlCache = null; }
  UVP.Utils.invalidateInlineScriptCache = function() { _inlineScripts = null; }
  UVP.Utils.getInlineScripts = function() {
    if (!_inlineScripts) _inlineScripts = Array.from(document.querySelectorAll('script:not([src])'));
    return _inlineScripts;
  }

  // ==================== CURRENT-VIDEO AFFINITY ====================
  // On multi-video pages (playlists, feeds) the captured URL pool holds MANY
  // videos' streams (API JSON responses list every entry), so pure resolution
  // ranking replays one fixed "winner" regardless of what the user is
  // watching (PMV Haven playlist bug: switching videos replayed the same
  // first-picked video). The network interceptors record the media URL the
  // SITE's own player fetched LAST — on blob: players (hls.js/dash.js MSE)
  // this is the only reliable identity signal, since the <video> src is
  // opaque. URLs sharing the anchor's video token (or its directory) belong
  // to the current video and outrank everything else at pick time.
  const lastInterceptedMedia = { url: null, at: 0 };
  UVP.Utils.noteInterceptedMedia = function(url) {
    if (!url || typeof url !== 'string' || !/^https?:/i.test(url)) return;
    // Anchor on manifests + direct media only: fragments (.ts/.m4s) carry no
    // stable per-video identity (and .ts segments are not captured at all).
    if (!/\.(m3u8|mpd|mp4|webm|m4v)([?#]|$)/i.test(url)) return;
    lastInterceptedMedia.url = url;
    lastInterceptedMedia.at = Date.now();
  };
  // Derive { token, dir } from the anchor. token = basename minus extension
  // minus a trailing resolution suffix, when it looks video-specific
  // (master/index/playlist/manifest names are directory-level identity only).
  UVP.Utils.currentVideoAffinity = function() {
    const anchor = lastInterceptedMedia.url;
    if (!anchor) return null;
    let token = null, dir = null;
    try {
      const u = new URL(anchor, location.href);
      const segs = u.pathname.split('/').filter(Boolean);
      if (segs.length >= 2) dir = segs.slice(0, -1).join('/');
      const base = (segs[segs.length - 1] || '').replace(/\.[a-z0-9]+$/i, '');
      const stripped = base.replace(/[-_](?:2160|1440|1080|720|480|360|240)p?$/i, '');
      if (stripped.length >= 6 && !/^(?:master|index|playlist|manifest)$/i.test(stripped)) token = stripped;
    } catch (e) {}
    return (token || dir) ? { token: token || null, dir: dir || null } : null;
  };
  // Affinity tier for one URL: 0 = same video token, 1 = same directory,
  // 2 = unrelated (or no anchor). Tier 2 everywhere when no anchor exists, so
  // composite sorts degenerate to the original behavior.
  UVP.Utils.currentVideoAffinityTier = function(u) {
    const aff = UVP.Utils.currentVideoAffinity();
    if (!aff || typeof u !== 'string') return 2;
    if (aff.token && u.indexOf(aff.token) !== -1) return 0;
    if (aff.dir) {
      try {
        const segs = new URL(u, location.href).pathname.split('/').filter(Boolean);
        if (segs.length >= 2 && segs.slice(0, -1).join('/') === aff.dir) return 1;
      } catch (e) {}
    }
    return 2;
  };
  // Narrow a URL pool to the CURRENT video when the anchor matches anything:
  // returns only tier-0/1 URLs (same video token or same directory). This is
  // a FILTER, not a reorder — downstream pickers scan the pool FROM THE END
  // (recency) and across format classes (mp4-before-m3u8), so reordering let
  // other entries' master.m3u8s/MP4s win anyway (the PMV Haven playlist
  // regression: ?index=5 played the first video because the site's anchor was
  // its <dir>/master.m3u8 — token-less, dir-level identity — while the
  // from-end master scan escaped the tier ordering and hit another entry's
  // master.m3u8). Returns the ORIGINAL pool when no anchor exists or nothing
  // matches (zero behavior change on single-video pages and anchor-less
  // pools), so callers can use it as a transparent pre-pass.
  UVP.Utils.applyCurrentVideoAffinity = function(pool) {
    if (!Array.isArray(pool) || pool.length < 2) return pool;
    const matched = pool.filter(u => UVP.Utils.currentVideoAffinityTier(u) < 2);
    return matched.length ? matched : pool;
  }
  // Segment-flow heartbeat for the hls.js cold-start guard: the interceptors
  // stamp every .ts/.m4s segment fetch so the stall monitor and recovery can
  // distinguish "first segment still downloading" (progress — defer) from a
  // dead stream (no fetches — recover). Timestamps only; no pool pollution.
  const lastFragmentFetch = { at: 0 };
  UVP.Utils.noteFragmentActivity = function(url) {
    if (!url || typeof url !== 'string' || !/\.(ts|m4s)([?#]|$)/i.test(url)) return;
    lastFragmentFetch.at = Date.now();
  };
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
    if (url && /api\.redgifs\.com/i.test(url) && !url.includes('auth/temporary')) { try { const response = await origFetch.apply(this, args); const clone = response.clone(); clone.text().then(txt => UVP.Extractors.captureRgApiData(txt)).catch(() => {}); return response; } catch (e) { throw e; } }
    if (url && /pornhub.*\/video\/get_media/i.test(url)) { try { const response = await origFetch.apply(this, args); const clone = response.clone(); clone.json().then(data => { if (Array.isArray(data)) { data.forEach(m => { if (m.videoUrl) UVP.Utils.captureUrl(m.videoUrl); }); } }).catch(() => {}); return response; } catch (e) { throw e; }
    }
    if (url && /\/youtubei\/v1\/player/i.test(url)) {
      const requestId = getYtRequestVideoId(args[1] && args[1].body);
      const requestGeneration = ytRouteGeneration;
      try {
        const response = await origFetch.apply(this, args);
        const clone = response.clone();
        clone.json().then(data => {
          if (!isCurrentYtResponse(requestId, requestGeneration, data) || !data || !data.streamingData) return;
          UVP.Extractors.processYtStreamingData(data.streamingData, data.videoDetails);
          if (data.assets && data.assets.js && requestGeneration === ytRouteGeneration) ytPlayerData.playerJsUrl = data.assets.js;
          UVP.Extractors.ensureYtNDeciphered(requestGeneration);
        }).catch(() => {});
        return response;
      } catch (e) { throw e; }
    }
    if (url && /\/i\/api\/graphql\//i.test(url) && UVP.Extractors.isX()) { try { const response = await origFetch.apply(this, args); const clone = response.clone(); clone.json().then(data => { if (data) UVP.Extractors.scanXMedia(data); }).catch(() => {}); return response; } catch (e) { throw e; } }
    if (url && /\.(mp4|m3u8|mpd|m4s|m4v|webm)([/?#]|$)/i.test(url)) { UVP.Utils.captureUrl(url); UVP.Utils.noteInterceptedMedia(url); if (url.includes('redgifs.com') && url.includes('-mobile.mp4')) UVP.Utils.captureUrl(url.replace(/-mobile\.mp4/i, '.mp4')); }
    if (url && /\.(ts|m4s)([?#]|$)/i.test(url)) UVP.Utils.noteFragmentActivity(url);
    try { const response = await origFetch.apply(this, args); if (response && response.url && response.headers) { const ct = response.headers.get('content-type') || ''; const responseKind = UVP.Utils.classifyMediaUrl(response.url, ct); if (responseKind !== 'unknown') { UVP.Utils.captureUrl(response.url, null, responseKind); UVP.Utils.noteInterceptedMedia(response.url); } // Generic JSON response scanner: on sites without a dedicated extractor,
      // scan same-origin JSON API responses for embedded video URLs. Many SPAs
      // (React/Vue/Svelte) serve video URLs inside JSON API responses that
      // never pass through the URL pattern or content-type checks above. The
      // site-specific handlers (YouTube, X.com, etc.) already return
      // early before reaching this code, so this only runs on generic sites.
      if (ct.includes('application/json') && response.ok && url) {
        try {
          const reqHost = new URL(url, location.href).hostname;
          if (UVP.Utils.sameSiteHost(reqHost, location.hostname)) {
            const clone = response.clone();
            clone.text().then(txt => {
              if (txt.length > 500000) return;
              const m = txt.match(/https?:\/\/[^\s"'<>{}]+?\.(?:mp4|m3u8|mpd|webm|m4v)(?:[?#][^\s"'<>{}]*)?/gi);
              if (m) for (const u of m) {
                const cleaned = u.replace(/\\u0026/gi, '&').replace(/&amp;/gi, '&').replace(/\\\//g, '/').replace(/[\\]+$/, '');
                UVP.Utils.captureUrl(cleaned);
              }
            }).catch(() => {});
          }
        } catch (e) {}
      }
 } return response; } catch (e) { throw e; }
  };
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (url && /\.(mp4|m3u8|mpd|m4s|m4v|webm)([/?#]|$)/i.test(url)) { UVP.Utils.captureUrl(url); UVP.Utils.noteInterceptedMedia(url); }
    if (url && /\.(ts|m4s)([?#]|$)/i.test(url)) UVP.Utils.noteFragmentActivity(url);
    if (this._uvp_media_listener) { this.removeEventListener('load', this._uvp_media_listener); this._uvp_media_listener = null; }
    this._uvp_media_url = url ? UVP.Utils.resolveSafeUrl(url, location.href) : null;
    // Remove stale load listeners from a previous send() on a reused XHR.
    if (this._uvp_rg_listener) { this.removeEventListener('load', this._uvp_rg_listener); this._uvp_rg_listener = null; }
    if (this._uvp_ph_listener) { this.removeEventListener('load', this._uvp_ph_listener); this._uvp_ph_listener = null; }
    if (this._uvp_yt_listener) { this.removeEventListener('load', this._uvp_yt_listener); this._uvp_yt_listener = null; }
    if (this._uvp_x_listener) { this.removeEventListener('load', this._uvp_x_listener); this._uvp_x_listener = null; }
    // Always re-evaluate flags so a reused XHR does not keep stale site flags from a previous URL.
    this._uvp_rg_api = !!(url && /api\.redgifs\.com/i.test(url) && !url.includes('auth/temporary'));
    this._uvp_ph_api = !!(url && /pornhub.*\/video\/get_media/i.test(url));
    this._uvp_yt_api = !!(url && /\/youtubei\/v1\/player/i.test(url));
    this._uvp_x_api = !!(url && /\/i\/api\/graphql\//i.test(url) && UVP.Extractors.isX());
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    const mediaListener = function () {
      try {
        const ct = typeof this.getResponseHeader === 'function' ? (this.getResponseHeader('content-type') || '') : '';
        const finalUrl = this.responseURL || this._uvp_media_url;
        const kind = UVP.Utils.classifyMediaUrl(finalUrl, ct);
        if (kind !== 'unknown') { UVP.Utils.captureUrl(finalUrl, null, kind); UVP.Utils.noteInterceptedMedia(finalUrl); }
      } catch (e) {}
    };
    this._uvp_media_listener = mediaListener;
    this.addEventListener('load', mediaListener);
    const rgListener = this._uvp_rg_api ? function () { try { UVP.Extractors.captureRgApiData(this.responseText); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } } : null;
    if (rgListener) { this._uvp_rg_listener = rgListener; this.addEventListener('load', rgListener); }
    const phListener = this._uvp_ph_api ? function () { try { const data = JSON.parse(this.responseText); if (Array.isArray(data)) data.forEach(m => { if (m.videoUrl) UVP.Utils.captureUrl(m.videoUrl); }); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } } : null;
    if (phListener) { this._uvp_ph_listener = phListener; this.addEventListener('load', phListener); }
    const ytRequestId = this._uvp_yt_api ? getYtRequestVideoId(args[0]) : null;
    const ytRequestGeneration = this._uvp_yt_api ? ytRouteGeneration : -1;
    const ytListener = this._uvp_yt_api ? function () {
      try {
        const data = JSON.parse(this.responseText);
        if (!isCurrentYtResponse(ytRequestId, ytRequestGeneration, data) || !data || !data.streamingData) return;
        UVP.Extractors.processYtStreamingData(data.streamingData, data.videoDetails);
        if (data.assets && data.assets.js && ytRequestGeneration === ytRouteGeneration) ytPlayerData.playerJsUrl = data.assets.js;
        UVP.Extractors.ensureYtNDeciphered(ytRequestGeneration);
      } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    } : null;
    if (ytListener) { this._uvp_yt_listener = ytListener; this.addEventListener('load', ytListener); }
    const xListener = this._uvp_x_api ? function () { try { const data = JSON.parse(this.responseText); if (data) UVP.Extractors.scanXMedia(data); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } } : null;
    if (xListener) { this._uvp_x_listener = xListener; this.addEventListener('load', xListener); }
    return origSend.apply(this, args);
  };
  const origPushState = history.pushState;
  history.pushState = function (...args) { origPushState.apply(this, args); setTimeout(UVP.Boot.onSpaNav, 50); setTimeout(UVP.Boot.onSpaNav, 300); setTimeout(UVP.Boot.onSpaNav, 1000); };
  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) { origReplaceState.apply(this, args); setTimeout(UVP.Boot.onSpaNav, 50); setTimeout(UVP.Boot.onSpaNav, 300); setTimeout(UVP.Boot.onSpaNav, 1000); };
  window.addEventListener('popstate', () => { setTimeout(UVP.Boot.onSpaNav, 50); setTimeout(UVP.Boot.onSpaNav, 300); setTimeout(UVP.Boot.onSpaNav, 1000); }, { passive: true });
  // AdGuard (CoreLibs 1.19+) and Tampermonkey 4.11+ expose the documented
  // window.onurlchange / 'urlchange' event for SPA navigations. This covers
  // routers that bypass our history.pushState/replaceState patches (e.g. sites
  // keeping a reference to the original functions). Silent no-op elsewhere.
  try {
    if ('onurlchange' in window) {
      if (typeof window.onurlchange === 'undefined') {
        window.onurlchange = () => { setTimeout(UVP.Boot.onSpaNav, 50); setTimeout(UVP.Boot.onSpaNav, 300); };
      } else {
        window.addEventListener('urlchange', () => { setTimeout(UVP.Boot.onSpaNav, 50); setTimeout(UVP.Boot.onSpaNav, 300); }, { passive: true });
      }
    }
  } catch (e) { if (DEBUG) console.warn('[UVP] onurlchange registration failed:', e); }
  let lastSpaUrl = location.href;
  UVP.Boot.onSpaNav = async function() {
    if (location.href === lastSpaUrl) return;
    lastSpaUrl = location.href;
    if (UVP.Extractors.isYouTube()) {
      ytRouteGeneration++;
      state.decodeDowngradeExhaustedUrl = null;
      state.decodeDowngradeAt = 0;
      state.decodeMetrics = null;
      // Player JS and its compiled n-transform belong to the previous route.
      // In-flight work cannot be force-cancelled here, so its generation guard
      // must reject any late result before it touches the current URL maps.
      ytPlayerData.playerJsUrl = null;
      ytNsigCache.playerUrl = null;
      ytNsigCache.func = null;
    }
    // On RedGifs, feed scrolling changes the URL without leaving the page —
    // keep the overlay playing and let the MutationObserver reposition the
    // button onto new videos.  Only the button is reset.
    if (UVP.Extractors.isRedgifs()) {
      capturedUrls.clear();
      capturedUrlKinds.clear();
      jsonLdUrls.clear();
      fmtResMap.clear();
      UVP.Utils.invalidateUrlCache();
      UVP.Utils.invalidateInlineScriptCache();
      state.buttonDismissed = false;
      UVP.Overlay.updateButtonPosition();
      return;
    }
    // For all other sites: cancel any active download — switching videos in
    // the same tab must not carry over the previous video's download state.
    if (state.isDownloading) UVP.Cancel.cancelCurrent();
    // X.com: preserve twimg video URLs across SPA navigation. The timeline's
    // GraphQL responses fire once on initial page load; navigating to a tweet
    // and back doesn't re-fire them, so clearing would permanently lose them
    // (only a full page reload re-triggers GraphQL capture). pickXUrl(mediaId)
    // filters by media ID so stale URLs from other tweets are never selected.
    let _xPreserveUrls = null, _xPreserveRes = null;
    if (UVP.Extractors.isX()) {
      _xPreserveUrls = [...capturedUrls].filter(u => /video\.twimg\.com/i.test(u));
      _xPreserveRes = new Map();
      for (const u of _xPreserveUrls) if (fmtResMap.has(u)) _xPreserveRes.set(u, fmtResMap.get(u));
    }
    capturedUrls.clear();
    capturedUrlKinds.clear();
    staleJsonLdUrls = new Set(jsonLdUrls);
    jsonLdUrls.clear();
    rgUrlMap.clear();
    fmtResMap.clear();
    // The site's last-played media belongs to the PREVIOUS route — dropping
    // the affinity anchor prevents stale-video mis-affinitization after SPA
    // navigation (the new route's player re-anchors within its first manifest
    // fetch).
    lastInterceptedMedia.url = null;
    UVP.Utils.invalidateUrlCache();
    UVP.Utils.invalidateInlineScriptCache();
    if (_xPreserveUrls) { for (const u of _xPreserveUrls) capturedUrls.add(u); }
    if (_xPreserveRes) { for (const [u, r] of _xPreserveRes) fmtResMap.set(u, r); }
    // Close overlay if open — the user is navigating to a new video.
    // Picture-in-Picture preservation guard: if the user popped out the player
    // into native PiP and navigates the site (e.g. clicking a tweet status or thread),
    // do NOT destroy the active PiP session. Hide the overlay container and defer teardown
    // until PiP is closed or a new video is explicitly played.
    const isPipActive = !!(document.pictureInPictureElement && state.video && (
      document.pictureInPictureElement === state.video ||
      document.pictureInPictureElement === state.overlay ||
      (state.overlay && state.overlay.shadowRoot && (
        state.overlay.shadowRoot.contains(document.pictureInPictureElement) ||
        state.overlay.shadowRoot.pictureInPictureElement === state.video
      ))
    ));
    if (state.overlay) {
      if (isPipActive) {
        state.isDetachedPip = true;
        state.overlay.style.display = 'none';
        if (state.syncInterval) { cancelAnimationFrame(state.syncInterval); state.syncInterval = null; }
      } else {
        UVP.Overlay.closeOverlay(true);
      }
    }
    state.buttonDismissed = false;
    // SPA navigation: clear route-scoped pools and invalidate caches
    if (UVP.Extractors.isYouTube()) {
      // Formats are keyed by videoId in ytFmtMap; stale entries are pruned on route change
      if (!UVP.Extractors.ytFormatsCurrent()) {
        ytFmtMap.clear(); ytDecipheredUrls.clear(); state.decodeDowngradeExhaustedUrl = null; state.decodeDowngradeAt = 0; ytPlayerData.isLive = false; ytPlayerData.videoId = null; ytPlayerData.fmtTs = 0;
        setTimeout(UVP.Extractors.extractYouTubeUrls, CONFIG.siteExtractInitialDelayMs);
      }
    }
    if (typeof SPA_NAV_EXTRACTORS !== 'undefined' && Array.isArray(SPA_NAV_EXTRACTORS)) { SPA_NAV_EXTRACTORS.forEach(s => { if (s.test()) setTimeout(s.extract, CONFIG.siteExtractInitialDelayMs); }); }
    // JSON-LD is re-rendered per route by SSR frameworks — re-scan generically.
    setTimeout(() => UVP.Utils.safeCall(UVP.Extractors.extractJsonLdVideoUrls, 'extractJsonLdVideoUrls'), CONFIG.siteExtractInitialDelayMs);
    UVP.Overlay.updateButtonPosition();

  }
  // ==================== STYLES ====================
  UVP.Overlay.injectStyles = function() {
    if (document.getElementById('uvp-native-style')) return;
    const css = `
#uvp-native-btn { all: initial; box-sizing: border-box; position: fixed; z-index: 2147483647; width: 56px; height: 56px; background: rgba(20, 20, 24, .75); color: #fff; border: 2px solid rgba(255,255,255,.4); border-radius: 50%; display: none; align-items: center; justify-content: center; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,.5); transition: transform 0.1s; font-family: system-ui, Roboto, sans-serif; line-height: 1; margin: 0; padding: 0; outline: none; user-select: none; }
#uvp-native-btn::after { content: '▶'; font-size: 24px; margin-left: 4px; }
#uvp-native-btn:active { background: #ff5a5a; border-color: transparent; transform: translate(-50%, -50%) scale(0.95) !important; }
.uvp-overlay { position: fixed; z-index: 2147483646; background: #000; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 30px rgba(0,0,0,.6); border-radius: 4px; overflow: hidden; }
#uvp-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 2147483647; padding: 10px 18px; background: rgba(20,20,24,.9); color: #fff; border: 1px solid rgba(255,255,255,.25); border-radius: 8px; font: 500 13px/1.4 system-ui, Roboto, sans-serif; backdrop-filter: blur(8px); box-shadow: 0 4px 15px rgba(0,0,0,.5); opacity: 0; transition: opacity 0.25s; pointer-events: none; max-width: 80vw; }
#uvp-toast.uvp-toast-show { opacity: 1; }
`;
    const style = document.createElement('style'); style.id = 'uvp-native-style'; style.textContent = css; (document.head || document.documentElement).appendChild(style);
  }

  // ==================== TOAST ====================
  let _toastTimer = null;
  UVP.Overlay.showToast = function(msg, duration) {
    duration = duration || 3000;
    let toast = document.getElementById('uvp-toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'uvp-toast'; document.body.appendChild(toast); }
    toast.textContent = msg;
    toast.classList.add('uvp-toast-show');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { toast.classList.remove('uvp-toast-show'); }, duration);
  }

  // ==================== URL EXTRACTION ====================
  // Comprehensive private/loopback/metadata detection. The WHATWG URL parser
  // already normalizes decimal/octal/hex IPv4 to dotted-quad, so we only need
  // to handle dotted-quad, IPv6 (bracket-stripped), and metadata hostnames.
  UVP.Utils.isPrivateHost = function (hostname) {
    if (!hostname) return true;
    let h = String(hostname).toLowerCase();
    if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1); // strip IPv6 []
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h === 'metadata' || h === 'metadata.google.internal') return true; // GCP metadata
    if (h.includes(':')) {                                     // IPv6
      if (h === '::' || h === '::1') return true;             // unspecified + loopback
      if (/^::ffff:/.test(h)) return true;                    // IPv4-mapped IPv6
      if (/^::\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true; // IPv4-compat IPv6
      if (/^fe[89ab][0-9a-f]*:/.test(h)) return true;          // link-local  fe80::/10
      if (/^f[cd][0-9a-f]*:/.test(h)) return true;             // unique local fc00::/7
    }
    if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(h)) {
      const o = h.split('.').map(Number);
      if (o.some(n => n > 255)) return false;                  // not a real IP; leave to host rules
      if (o[0] === 0) return true;                             // 0.0.0.0/8
      if (o[0] === 10) return true;                            // 10/8
      if (o[0] === 127) return true;                           // 127/8 loopback
      if (o[0] === 169 && o[1] === 254) return true;            // 169.254/16 (AWS/Azure metadata + link-local)
      if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true; // 172.16/12
      if (o[0] === 192 && o[1] === 168) return true;           // 192.168/16
      if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // 100.64/10 CGNAT
      if (o[0] === 192 && o[1] === 0 && o[2] === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
      if (o[0] === 192 && o[1] === 0 && o[2] === 2) return true; // 192.0.2.0/24 TEST-NET-1
      if (o[0] === 192 && o[1] === 88 && o[2] === 99) return true; // 192.88.99.0/24 (6to4 relay, deprecated)
      if (o[0] === 198 && (o[1] === 18 || o[1] === 19)) return true; // 198.18.0.0/15 (benchmarking — commonly abused by local proxies/VPN DNS sinks)
      if (o[0] === 198 && o[1] === 51 && o[2] === 100) return true; // 198.51.100.0/24 TEST-NET-2
      if (o[0] === 203 && o[1] === 0 && o[2] === 113) return true; // 203.0.113.0/24 TEST-NET-3
      if (o[0] >= 224) return true;                              // 224/4 multicast + 240/4 reserved (incl. 255.255.255.255 broadcast)
    }
    return false;
  };
  UVP.Utils.isUsableUrl = function(url) {
    if (!url) return false;
    if (/^(blob|data|javascript|file|about):/i.test(url)) return false;
    let u;
    try { u = new URL(url); } catch (e) { return false; }
    if (!/^https?:$/i.test(u.protocol)) return false;          // hard-require http(s)
    if (u.username || u.password) return false;                // reject user:pass@ URLs
    if (UVP.Utils.isPrivateHost(u.hostname)) return false;
    return true;
  };
  // Application-layer URL validation gate for play/download/extract paths.
  // Returns the validated URL or null so callers can branch cleanly.
  UVP.Utils.assertSafeVideoUrl = function(url) {
    // 8192: long signed CDN URLs (Akamai/CloudFront policy params) can exceed 4KB
    if (typeof url !== 'string' || url.length < 12 || url.length > 8192) return null;
    if (!UVP.Utils.isUsableUrl(url)) return null;
    try { return new URL(url).href; } catch (e) { return null; }
  };
  UVP.Utils.isAudioOnly = function(url, contentType) {
    if (!url && !contentType) return false;
    const ct = String(contentType || '').toLowerCase().split(';')[0].trim();
    if (ct && /^audio\//.test(ct)) return true;
    const u = String(url || '');
    if (/\.(?:m4a|aac|opus|weba|mp3|ogg|flac)(?:[?#]|$)/i.test(u)) return true;
    if (/\/(?:aud|audio)\/(?:mp4a|aac|opus|weba|mp3|ogg)?/i.test(u)) return true;
    if (/(?:^|[-_./])(?:chunklist_\d+_audio|_audio|audio-only|_aud|_a\d+)(?:[-_./?]|$)/i.test(u)) return true;
    return false;
  };
  UVP.Utils.classifyMediaUrl = function(url, contentType) {
    const ct = String(contentType || '').toLowerCase().split(';')[0].trim();
    if (ct === 'application/dash+xml' || ct === 'application/dash') return 'dash';
    if (/mpegurl|vnd\.apple\.mpegurl/.test(ct)) return 'hls';
    if (/\.mpd(?:[?#]|$)/i.test(url || '')) return 'dash';
    if (/\.m3u8(?:[?#]|$)/i.test(url || '')) return 'hls';
    let path = '';
    try { path = new URL(url, location.href).pathname; } catch (e) { path = String(url || '').split(/[?#]/)[0]; }
    const leaf = path.slice(path.lastIndexOf('/') + 1);
    if (/\/vid\/[^\/]+\/0\/0\//i.test(path) || /\/aud\/[^\/]+\/0\/0\//i.test(path)) return 'fragment';
    if (UVP.Utils.isAudioOnly(url, ct)) return 'audio';
    if (/\.m4s$/i.test(leaf) ||
        /^(?:init|initialization)(?:[-_.]|\d|$)/i.test(leaf) ||
        /(?:^|[-_.])(?:segment|seg|chunk|fragment|frag)(?:[-_.]?\d+|[-_.]|$)/i.test(leaf)) return 'fragment';
    if (/\.(?:mp4|m4v|webm)(?:[?#]|$)/i.test(url || '') || /^video\//.test(ct)) return 'direct';
    return 'unknown';
  };
  UVP.Utils.normalizeMediaKind = function(kindOrContentType, url) {
    const value = String(kindOrContentType || '').toLowerCase().trim();
    const aliases = {
      dash: 'dash', 'dash-manifest': 'dash',
      hls: 'hls', 'hls-manifest': 'hls',
      fragment: 'fragment', 'adaptive-fragment': 'fragment',
      direct: 'direct', 'direct-media': 'direct',
      unknown: 'unknown'
    };
    return aliases[value] || UVP.Utils.classifyMediaUrl(url, kindOrContentType);
  };
  UVP.Utils.isDashAssociatedFragment = function(url) {
    if (!url || !/[_-]\d+\.(?:mp4|webm)(?:[?#]|$)/i.test(url)) return false;
    let candidate;
    try { candidate = new URL(url, location.href); } catch (e) { return false; }
    const candidateDir = candidate.pathname.slice(0, candidate.pathname.lastIndexOf('/') + 1);
    for (const [manifestUrl, kind] of capturedUrlKinds) {
      if (kind !== 'dash') continue;
      try {
        const manifest = new URL(manifestUrl, location.href);
        const manifestDir = manifest.pathname.slice(0, manifest.pathname.lastIndexOf('/') + 1);
        if (candidate.origin === manifest.origin && candidateDir === manifestDir) return true;
      } catch (e) {}
    }
    return false;
  };
  UVP.Utils.captureKind = function(url) {
    const stored = capturedUrlKinds.get(url);
    // Content-Type interception may have stored a numeric DASH media segment
    // as direct video before its MPD was observed. Re-evaluate this narrow
    // association dynamically so later manifest capture corrects selection
    // and fallback behaviour without globally treating dated MP4 names as
    // fragments.
    if (stored !== 'dash' && stored !== 'hls' && stored !== 'fragment' && UVP.Utils.isDashAssociatedFragment(url)) {
      capturedUrlKinds.set(url, 'fragment');
      _urlCache = null;
      return 'fragment';
    }
    return stored || UVP.Utils.classifyMediaUrl(url);
  };
  UVP.Utils.isDashManifest = function(url) { return UVP.Utils.captureKind(url) === 'dash'; };
  UVP.Utils.isHlsManifest = function(url) { return UVP.Utils.captureKind(url) === 'hls'; };
  UVP.Utils.isLikelyAdaptiveFragment = function(url) { return UVP.Utils.captureKind(url) === 'fragment'; };
  UVP.Utils.isDirectMedia = function(url) { return UVP.Utils.captureKind(url) === 'direct' && !UVP.Utils.isAudioOnly(url); };

  // Add a URL to capturedUrls, keeping the extractAllUrls() cache coherent.
  // A supplied protocol kind wins over filename inference, which preserves
  // extension-less manifests learned from response Content-Type headers.
  UVP.Utils.addCapturedUrl = function(url, kindOrContentType) {
    if (!url || !UVP.Utils.isUsableUrl(url)) return false;
    const inferred = UVP.Utils.normalizeMediaKind(kindOrContentType, url);
    const prior = capturedUrlKinds.get(url);
    if (inferred !== 'unknown' || !prior) capturedUrlKinds.set(url, inferred);
    if (!capturedUrls.has(url)) { capturedUrls.add(url); _urlCache = null; }
    return true;
  };
  // Resolve + validate + add to capturedUrls in one step. Returns the resolved
  // URL (or null if rejected) so callers that need it for fmtResMap etc. can
  // use the return value. The optional third argument may be a normalized kind
  // or a response/element Content-Type.
  UVP.Utils.captureUrl = function(url, baseUrl, kindOrContentType) {
    const resolved = UVP.Utils.resolveSafeUrl(url, baseUrl || location.href);
    if (UVP.Utils.addCapturedUrl(resolved, kindOrContentType)) return resolved;
    return null;
  };
  const fmtResMap = new Map(); // url -> height (0 if unknown)
  UVP.Utils.parseResLabel = function(s) {
    if (/4k/i.test(s)) return 2160;
    const m = String(s).match(/(\d{3,4})p?/);
    return m ? parseInt(m[1]) : 0;
  }
  UVP.Utils.resOf = function(u) { return fmtResMap.has(u) ? fmtResMap.get(u) : UVP.Utils.guessResolution(u); }
  UVP.Utils.guessResolution = function(url) { const match = url.match(/(2160|1440|1080|720|480|360|240)[pP]?/); return match ? parseInt(match[1]) : 0; }
  UVP.Utils.extractAllUrls = function() {
    if (_urlCache) return _urlCache;
    const candidates = [];
    capturedUrls.forEach(url => candidates.push(url));
    rgUrlMap.forEach(urls => { if (urls.hd) candidates.push(urls.hd); if (urls.sd) candidates.push(urls.sd); });
    // Generic DOM video/source scan: only scan real playable media tags (<video>, <source>).
    // Preview/thumbnail attributes (like data-pvv, data-mzl, data-sfwthumb, data-preview) on <img>/<a>/<div>
    // are thumbnail preview clips for other recommended videos and must NOT be captured as full video streams.
    document.querySelectorAll('video, source, [data-video-url], [data-manifest]').forEach(el => {
      let url = el.currentSrc || el.src || el.getAttribute('src') || el.getAttribute('data-video-url') || el.getAttribute('data-manifest');
      // On XVideos/XNXX, skip MMCDN live-cam banner videos (<video src="*.mmcdn.com/mp4fwap/*">)
      if (url && (UVP.Extractors.isXVideos() || UVP.Extractors.isXHamster()) && /mmcdn\.com/i.test(url)) return;
      if (UVP.Utils.isUsableUrl(url)) {
        url = UVP.Utils.resolveSafeUrl(url, location.href);
        candidates.push(url);
        const typeHint = el.getAttribute && el.getAttribute('type');
        const attrKind = el.getAttribute('data-mpd') ? 'dash' :
          (el.getAttribute('data-hls') ? 'hls' : UVP.Utils.classifyMediaUrl(url, typeHint));
        UVP.Utils.addCapturedUrl(url, attrKind);
        if (url.includes('redgifs.com') && url.includes('-mobile.mp4')) candidates.push(url.replace(/-mobile\.mp4/i, '.mp4'));
      }
      const poster = el.getAttribute && el.getAttribute('poster');
      if (poster && /redgifs\.com/i.test(poster)) UVP.Extractors.deriveRgUrlsFromMedia(poster);
    });
    // Generic inline fallback for manifests embedded in player configuration.
    // Restrict this scan to manifest extensions: broad MP4 scans commonly pick
    // up ad/preload fragments and are already covered by dedicated extractors.
    for (const script of UVP.Utils.getInlineScripts()) {
      const matches = (script.textContent || '').matchAll(/https?:\/\/[^\s"'<>{}]+?\.(?:mpd|m3u8)(?:[?#][^\s"'<>{}]*)?/gi);
      for (const match of matches) {
        let raw = match[0].replace(/\\u0026/gi, '&').replace(/&amp;/gi, '&').replace(/\\\//g, '/').replace(/[\\]+$/, '');
        const resolved = UVP.Utils.captureUrl(raw);
        if (resolved) candidates.push(resolved);
      }
    }
    _urlCache = [...new Set(candidates)].filter(UVP.Utils.isUsableUrl);
    return _urlCache;
  }
  UVP.Utils.pickBestUrl = function(preferFormat, excludeUrl) {
    const allCaptured = UVP.Utils.extractAllUrls().slice();
    // Current-video affinity NARROWS the pool to the site player's current
    // video (token/dir match) before any ranking — filtering, not reordering,
    // because the mp4/firstHls/latestTopLevel paths below scan across the
    // whole pool (from-end, cross-format) and would otherwise escape tier
    // ordering (PMV Haven playlist regression). The composite tier+res sort
    // then prefers token matches over dir matches within the narrowed set.
    // No anchor or no match → original full-pool resolution ranking.
    const all = UVP.Utils.applyCurrentVideoAffinity(allCaptured.filter(u => u !== excludeUrl && !UVP.Utils.isLikelyAdaptiveFragment(u)));
    all.sort((a, b) => UVP.Utils.currentVideoAffinityTier(a) - UVP.Utils.currentVideoAffinityTier(b) || UVP.Utils.resOf(b) - UVP.Utils.resOf(a));
    const manifests = (kind) => allCaptured.filter(u => u !== excludeUrl && UVP.Utils.captureKind(u) === kind);
    const latestTopLevel = (pool, namingRe) => {
      if (!pool.length) return null;
      let anchor = null;
      for (const u of jsonLdUrls) { try { anchor = new URL(u).hostname; break; } catch (e) {} }
      if (!anchor) anchor = location.hostname;
      const scoped = pool.filter((u) => { try { return UVP.Utils.sameSiteHost(new URL(u).hostname, anchor); } catch (e) { return false; } });
      const candidates = UVP.Utils.applyCurrentVideoAffinity(scoped.length ? scoped : pool);
      for (let i = candidates.length - 1; i >= 0; i--) if (namingRe.test(candidates[i])) return candidates[i];
      return candidates[candidates.length - 1] || null;
    };
    const mpd = latestTopLevel(manifests('dash'), /\/(?:manifest|master|index|playlist)\.mpd(?:[?#]|$)/i);
    const hlsManifests = manifests('hls');
    const rgHd = all.find(url => /media\.redgifs\.com\/[^?#]*\.mp4/i.test(url) && !url.includes('-mobile'));
    if (preferFormat && /^mpd$/i.test(preferFormat)) return mpd;
    if (preferFormat && /^m3u8$/i.test(preferFormat)) return latestTopLevel(hlsManifests, /\/(?:master|index|playlist)\.m3u8([?#]|$)/i);
    if (mpd) return mpd;
    if (rgHd) return rgHd;
    const formatRe = preferFormat ? new RegExp('\\.' + preferFormat + '([?#]|$)', 'i') : null;
    const m3u8s = hlsManifests;
    // Host-scoped master playlist naming: prioritizes master/index/playlist manifests.
    // host (a JSON-LD contentUrl host when tagged, else the page host),
    // prefer master/index/playlist naming — the CDN convention for the
    // full-variant top-level playlist. UNSCOPED this rule would hijack
    // picks on multi-CDN pages (tube-site ads ship their own master.m3u8).
    const firstHls = () => {
      let anchor = null;
      for (const u of jsonLdUrls) { try { anchor = new URL(u).hostname; break; } catch (e) {} }
      if (!anchor) anchor = location.hostname;
      const scoped = m3u8s.filter((u) => { try { return UVP.Utils.sameSiteHost(new URL(u).hostname, anchor); } catch (e) { return false; } });
      const pool = UVP.Utils.applyCurrentVideoAffinity(scoped.length ? scoped : m3u8s);
      // Search from the end to prefer the most recently captured master playlist
      // (crucial for SPAs where the network captures a new master.m3u8 but the old one remains in the cache)
      for (let i = pool.length - 1; i >= 0; i--) {
        if (/\/(?:master|index|playlist)\.m3u8([?#]|$)/i.test(pool[i]) && !/_audio|audio-only|_a\d+/i.test(pool[i])) return pool[i];
      }
      for (let i = pool.length - 1; i >= 0; i--) {
        if (/_video|video_|_v\d+/i.test(pool[i])) return pool[i];
      }
      for (let i = pool.length - 1; i >= 0; i--) {
        if (!/_audio|audio-only|_a\d+/i.test(pool[i])) return pool[i];
      }
      return pool[pool.length - 1] || null;
    };
    // (JSON-LD fallback): The strict "JSON-LD wins immediately" rule has been
    // removed. JSON-LD URLs are now just part of the 'all' pool, which is
    // sorted by resolution. The network's live interceptions (if they have a
    // higher resolution) will naturally beat JSON-LD.
    // However, if there are NO resolution markers on any URL (e.g. they are all 0p),
    // or if the user explicitly requests a format, we still use the JSON-LD
    // anchor host to safely pick the master.m3u8 playlist via firstHls().
    if (formatRe) {
      // Explicit format request (download path): route m3u8 through the
      // host-scoped naming preference so the top-level playlist wins.
      if (/^m3u8$/i.test(preferFormat)) { const h = firstHls(); if (h) return h; }
      else { const preferred = all.find((url) => formatRe.test(url)); if (preferred) return preferred; }
    }
    // When no URL has a detectable resolution marker (all resOf=0), prefer HLS —
    // HLS master playlists are typically the full-quality stream, while unmarked
    // MP4s are often previews/thumbnails. When any URL has a resolution marker,
    // keep MP4-first (backward compatible with sites that mark MP4 resolutions).
    const hasResMarker = all.some(url => UVP.Utils.resOf(url) > 0);
    if (!hasResMarker) {
      const hls = firstHls();
      if (hls) return hls;
    }
    const mp4 = all.find(url => /\.mp4([?#]|$)/i.test(url) && !UVP.Utils.isAudioOnly(url) && !UVP.Utils.isLikelyAdaptiveFragment(url));
    if (mp4) return mp4;
    const hls = firstHls();
    if (hls) return hls;
    return all.find(url => !UVP.Utils.isAudioOnly(url) && !UVP.Utils.isLikelyAdaptiveFragment(url)) || all[0] || null;
  }

  UVP.Utils.pickPlaybackFallback = function(excludeUrl) {
    const candidates = UVP.Utils.extractAllUrls().filter(u =>
      u !== excludeUrl &&
      !UVP.Utils.isDashManifest(u) &&
      !UVP.Utils.isLikelyAdaptiveFragment(u) &&
      (UVP.Utils.isHlsManifest(u) || UVP.Utils.isDirectMedia(u))
    );
    if (!candidates.length) return null;
    const hls = candidates.filter(UVP.Utils.isHlsManifest);
    if (hls.length) {
      const chosen = UVP.Utils.pickBestUrl('m3u8', excludeUrl);
      if (chosen && chosen !== excludeUrl) return chosen;
    }
    candidates.sort((a, b) => UVP.Utils.resOf(b) - UVP.Utils.resOf(a));
    return candidates[0] || null;
  };

  // Format preference picker: resolves highest-quality stream matching target extension.
  // — one picker, now with the JSON-LD preference and the host-scoped
  // master/index/playlist tiebreak for every caller. Alias keeps call sites.
  UVP.Utils.pickBestUrlByFormat = function(preferFormat) { return UVP.Utils.pickBestUrl(preferFormat); };

  // Download quality preference, persisted across sessions via GM_setValue.
  // 'max' (default): highest adaptive 1080p/4K video + paired audio track (losslessly remuxed in pure JS).
  // 'muxed': 720p HD combined MP4 with native in-container audio (if present).
  // 'lowest': lowest combined MP4 (360p) with native audio.
  // For HLS streams: 'lowest' picks lowest variant; 'muxed'/'max' picks highest variant.
  UVP.Utils.getDownloadQuality = function() {
    try {
      const q = (typeof GM_getValue === 'function') ? GM_getValue('uvp-dl-quality', 'max') : 'max';
      if (q === 'lowest') return 'lowest';
      if (q === 'muxed' || q === '720p') return 'muxed';
      return 'max';
    } catch (e) { return 'max'; }
  };
  UVP.Utils.setDownloadQuality = function(q) {
    try {
      if (typeof GM_setValue === 'function') {
        const val = (q === 'lowest') ? 'lowest' : ((q === 'muxed' || q === '720p') ? 'muxed' : 'max');
        GM_setValue('uvp-dl-quality', val);
      }
    } catch (e) {}
  };

  // Playback quality preference, persisted across sessions via GM_setValue.
  // 'max' starts HLS at its highest level while hls.js keeps ABR enabled. For
  // YouTube DASH both options use bandwidth-estimated startup and the full
  // representation ladder; 'max' additionally enables decode-overload safety.
  // Toggled from the userscript menu. Default: 'auto' (ABR).
  UVP.Utils.getPlaybackQuality = function() {
    try {
      const q = (typeof GM_getValue === 'function') ? GM_getValue('uvp-play-quality', 'auto') : 'auto';
      return (q === 'max') ? 'max' : 'auto';
    } catch (e) { return 'auto'; }
  };
  UVP.Utils.setPlaybackQuality = function(q) {
    try { if (typeof GM_setValue === 'function') GM_setValue('uvp-play-quality', q === 'auto' ? 'auto' : 'max'); } catch (e) {}
  };

  UVP.Utils.pickByBestResolution = function(filterFn) {
    // Current-video affinity first (tier), then resolution — prevents picking
    // another playlist/feed entry's higher-res stream over the video the user
    // is actually watching. No anchor or no match → pure resolution sort.
    const all = UVP.Utils.applyCurrentVideoAffinity(UVP.Utils.extractAllUrls().filter(filterFn));
    const videoPool = all.filter(u => !/_audio|audio-only|_a\d+/i.test(u));
    const targetPool = videoPool.length ? videoPool : all;
    targetPool.sort((a, b) => UVP.Utils.currentVideoAffinityTier(a) - UVP.Utils.currentVideoAffinityTier(b) || UVP.Utils.resOf(b) - UVP.Utils.resOf(a));
    // Sort strictly by affinity tier and resolution without forcing MP4 ahead of HLS
    // when HLS has higher resolution (e.g. 1080p HLS vs 720p/sd MP4 on XVideos/PHNetwork)
    return targetPool[0] || null;
  }

  // ==================== SITE EXTRACTORS & ADAPTERS ====================

  // ==================== PORNHUB SUPPORT ====================
  UVP.Extractors.isPornhub = function() { return /pornhub(?:premium)?\.(?:com|net|org)/i.test(location.hostname); }
  UVP.Extractors.extractFlashvarsObject = function() {
    const scripts = UVP.Utils.getInlineScripts();
    for (const script of scripts) {
      const text = script.textContent || '';
      const m = text.match(/var\s+flashvars_\d+\s*=\s*(\{)/);
      if (!m) continue;
      const openIdx = m.index + m[0].length - 1; // index of the opening '{'
      const objText = UVP.Utils.matchBrace(text, openIdx);
      if (objText) { try { return JSON.parse(objText); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
    }
    return null;
  }

  UVP.Extractors.extractPornhubUrls = function() {
    if (!UVP.Extractors.isPornhub()) return;
    const flashvars = UVP.Extractors.extractFlashvarsObject();
    if (flashvars && Array.isArray(flashvars.mediaDefinitions)) {
      for (const def of flashvars.mediaDefinitions) {
        if (def && def.videoUrl && typeof def.videoUrl === 'string') {
          // Capture media definitions and /video/get_media endpoints for MP4 fallback resolution.
          if (/\.mp4|\.m3u8/i.test(def.videoUrl) || /\/video\/get_media/i.test(def.videoUrl)) {
            const resolved = UVP.Utils.captureUrl(def.videoUrl);
            // Record the variant's flashvars quality so the generic resolution
            // ranking can order the per-variant m3u8 masters. The URL heuristic
            // (/1080P_/) usually infers this too, but the quality field is
            // authoritative and covers URLs without a resolution token.
            // def.quality is an ARRAY for the get_media endpoint — parseInt([])
            // is NaN, so those are skipped safely.
            if (resolved && def.quality != null) {
              const q = parseInt(def.quality);
              if (q > 0) fmtResMap.set(resolved, q);
            }
          }
        }
      }
    }
    // Fallbacks for older page shapes: qualityItems / mediastring / media_* / quality_* vars.
    const scripts = UVP.Utils.getInlineScripts();
    for (const script of scripts) {
      const text = script.textContent || '';
      const qualityItemsMatch = text.match(/var\s+qualityItems_\d+\s*=\s*(\[.+?\]);/s);
      if (qualityItemsMatch && qualityItemsMatch[1]) {
        try { const items = JSON.parse(qualityItemsMatch[1]); if (Array.isArray(items)) { for (const item of items) { if (item && item.url) UVP.Utils.captureUrl(item.url); } } } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
      }
      const mediaMatch = text.match(/var\s+\w*mediastring\w*\s*=\s*['"]([^'"]+)['"]/);
      if (mediaMatch && mediaMatch[1]) UVP.Utils.captureUrl(mediaMatch[1]);
      const mediaVarMatches = text.matchAll(/var\s+(?:media|quality)_\d+\s*=\s*['"]([^'"]+)['"]/g);
      for (const m of mediaVarMatches) { if (m[1] && /https?:\/\//i.test(m[1])) UVP.Utils.captureUrl(m[1]); }
    }
  }

  // ==================== SpankBang Support ====================
UVP.Extractors.isSpankBang = function() {
  return /spankbang\.(?:com|party|net|org|pro)/i.test(location.hostname);
}

// Parse both legacy inline `stream_url_<id> = "url"` assignments and modern
// inline `stream_data = { ... }` dictionaries (SpankBang's primary stream sources).
UVP.Extractors.extractSpankBangUrls = function() {
  if (!UVP.Extractors.isSpankBang()) return;
  const scripts = UVP.Utils.getInlineScripts();
  for (const script of scripts) {
    const text = script.textContent || '';
    // 1. Modern stream_data object scan: stream_data = { '720p': ['https://...'], 'm3u8': ['https://...'], 'main': [...] }
    const sdMatch = text.match(/var\s+stream_data\s*=\s*(\{)/);
    if (sdMatch) {
      const openIdx = sdMatch.index + sdMatch[0].length - 1;
      const objText = UVP.Utils.matchBrace(text, openIdx);
      if (objText) {
        try {
          // Normalize single quotes and trailing commas in JavaScript object literal for parsing
          const jsonStr = objText
            .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
            .replace(/,\s*([}\]])/g, '$1');
          const data = JSON.parse(jsonStr);
          if (data && typeof data === 'object') {
            for (const [key, val] of Object.entries(data)) {
              const urls = Array.isArray(val) ? val : [val];
              for (const u of urls) {
                if (typeof u === 'string' && /^https?:\/\//i.test(u)) {
                  const resolved = UVP.Utils.captureUrl(u);
                  if (resolved) {
                    const res = UVP.Utils.parseResLabel(key);
                    if (res > 0) fmtResMap.set(resolved, res);
                  }
                }
              }
            }
          }
        } catch (e) {
          // Fallback regex scan inside the stream_data block if JSON parsing fails
          const streamUrlRe = /['"](?:m3u8_)?([0-9]+p|4k)['"]\s*:\s*\[\s*['"](https?:\/\/[^'"]+)['"]/gi;
          let sm;
          while ((sm = streamUrlRe.exec(objText))) {
            const label = sm[1];
            const u = sm[2];
            const resolved = UVP.Utils.captureUrl(u);
            if (resolved) fmtResMap.set(resolved, UVP.Utils.parseResLabel(label));
          }
        }
      }
    }

    // 2. Legacy stream_url_<id> regex scan
    const re = /stream_url_([^\s=]+)\s*=\s*(['"])((?:(?!\2).)+)\2/g;
    let m;
    while ((m = re.exec(text))) {
      const label = m[1];        // e.g. "240p", "720p", "4k"
      const u     = m[3];        // the URL
      if (!u) continue;
      const resolved = UVP.Utils.captureUrl(u);
      if (resolved) fmtResMap.set(resolved, UVP.Utils.parseResLabel(label)); // see §2
    }
  }
}

  // ==================== REDGIFS SUPPORT ====================
  const rgUrlMap = new Map();
  const rgToken = { value: null, expires: 0 };
  UVP.Extractors.isRedgifs = function() { return /redgifs\.com|gifdeliverynetwork\.com/i.test(location.hostname); }
  UVP.Extractors.sanitizeRgId = function(id) { if (!id) return null; return id.replace(/\.(mp4|m4s|webm|webp|jpg|jpeg|png|gif)$/i, '').replace(/-(silent|mobile|large|small|poster)$/i, '').toLowerCase(); }
  UVP.Extractors.getRgIdFromUrl = function(url) { if (!url) return null; const m = url.match(/(?:redgifs\.com|gifdeliverynetwork\.com)\/(?:watch|ifr)\/([^/?#]+)/i); return m ? UVP.Extractors.sanitizeRgId(m[1]) : null; }
  UVP.Extractors.getRgIdFromElement = function(el) {
    if (!el) return null;
    if (el.dataset && el.dataset.rgId) return el.dataset.rgId;
    const feedEl = el.closest ? el.closest('[data-feed-item-id]') : null;
    if (feedEl) { const id = UVP.Extractors.sanitizeRgId(feedEl.getAttribute('data-feed-item-id')); if (id) { if (el.dataset) el.dataset.rgId = id; return id; } }
    if (el.id && el.id.startsWith('gif_')) { const id = UVP.Extractors.sanitizeRgId(el.id.replace('gif_', '')); if (id) { if (el.dataset) el.dataset.rgId = id; return id; } }
    const gifContainer = el.closest ? el.closest('[id^="gif_"]') : null;
    if (gifContainer && gifContainer.id.startsWith('gif_')) { const id = UVP.Extractors.sanitizeRgId(gifContainer.id.replace('gif_', '')); if (id) { if (el.dataset) el.dataset.rgId = id; return id; } }
    if (el.tagName === 'VIDEO' || (el.querySelector && el.querySelector('video'))) {
      const video = el.tagName === 'VIDEO' ? el : el.querySelector('video');
      if (video) {
        const src = video.currentSrc || video.src || '';
        if (src && !src.startsWith('blob:')) { const m = src.match(/\/([^/]+?)(?:-mobile|-sd|-hd|\.mp4|\.m4s|\.webp|\.jpg|\.gif)?(?:[?#]|$)/i); if (m && m[1] && m[1].length > 5) { const id = UVP.Extractors.sanitizeRgId(m[1]); if (id) { if (el.dataset) el.dataset.rgId = id; return id; } } }
        if (video.poster) { const m = video.poster.match(/\/([^/]+?)(?:-mobile|-poster|-sd|-hd)?\.(?:jpg|webp)$/i); if (m && m[1] && m[1].length > 5) { const id = UVP.Extractors.sanitizeRgId(m[1]); if (id) { if (el.dataset) el.dataset.rgId = id; return id; } } }
      }
    }
    if (location.pathname.includes('/watch/')) { const id = UVP.Extractors.getRgIdFromUrl(location.href); if (id) { if (el.dataset) el.dataset.rgId = id; return id; } }
    const watchLink = el.closest ? el.closest('a[href*="/watch/"]') : null;
    if (watchLink) { const id = UVP.Extractors.getRgIdFromUrl(watchLink.href); if (id) { if (el.dataset) el.dataset.rgId = id; return id; } }
    return null;
  }
  UVP.Extractors.deriveRgUrlsFromMedia = function(url) { if (!url || !/redgifs\.com/i.test(url)) return; const base = url.replace(/-(?:mobile|poster|silent|sd|hd)\.(?:jpg|webp|mp4|m4s|webm)$/i, '').replace(/\.(?:jpg|webp|mp4|m4s|webm)$/i, ''); if (base && /media\.redgifs\.com|thumbs\d?\.redgifs\.com|thcf/i.test(base)) { UVP.Utils.addCapturedUrl(`${base}.mp4`); UVP.Utils.addCapturedUrl(`${base}-mobile.mp4`); } }
  UVP.Extractors.getRgToken = async function() {
    if (rgToken.value && Date.now() < rgToken.expires) return rgToken.value;
    try {
      const res = await origFetch('https://api.redgifs.com/v2/auth/temporary').then(r => r.json());
      if (res && res.token) { rgToken.value = res.token; rgToken.expires = Date.now() + CONFIG.rgTokenTtlMs; return res.token; }
    } catch (e) {}
    try {
      const res = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({ method: 'GET', url: 'https://api.redgifs.com/v2/auth/temporary', headers: { 'Referer': 'https://www.redgifs.com/', 'Origin': 'https://www.redgifs.com' }, onload: (r) => { try { resolve(JSON.parse(r.response)); } catch (e) { reject(e); } }, onerror: reject, ontimeout: () => reject(new Error('token timeout')), timeout: 10000 });
      });
      if (res && res.token) { rgToken.value = res.token; rgToken.expires = Date.now() + CONFIG.rgTokenTtlMs; return res.token; }
    } catch (e) { console.warn('[UVP] RedGifs token fetch failed:', e); }
    return null;
  };
  UVP.Extractors.fetchRgUrls = async function(videoId, _depth) {
    _depth = _depth || 0;
    if (!videoId) return null;
    if (rgUrlMap.has(videoId)) return rgUrlMap.get(videoId);
    const token = await UVP.Extractors.getRgToken();
    if (!token) return null;
    try {
      const res = await origFetch(`https://api.redgifs.com/v2/gifs/${videoId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => { if (r.status === 401) { rgToken.value = null; throw new Error('401'); } return r.json(); });
      if (res && res.gif && res.gif.urls) {
        const urls = { hd: res.gif.urls.hd || null, sd: res.gif.urls.sd || null, gif: res.gif.urls.gif || null };
        rgUrlMap.set(videoId, urls);
        UVP.Utils.addCapturedUrl(urls.hd);
        UVP.Utils.addCapturedUrl(urls.sd);
        return urls;
      }
    } catch (e) {
      if (e.message === '401' && _depth < 2) { rgToken.value = null; return UVP.Extractors.fetchRgUrls(videoId, _depth + 1); }
    }
    try {
      const res = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({ method: 'GET', url: `https://api.redgifs.com/v2/gifs/${videoId}`, headers: { 'Authorization': `Bearer ${token}`, 'Referer': 'https://www.redgifs.com/', 'Origin': 'https://www.redgifs.com' }, onload: (r) => { if (r.status === 401) { rgToken.value = null; reject(new Error('401')); } else { try { resolve(JSON.parse(r.response)); } catch (e) { reject(e); } } }, onerror: reject, ontimeout: () => reject(new Error('timeout')), timeout: 15000 });
      });
      if (res && res.gif && res.gif.urls) {
        const urls = { hd: res.gif.urls.hd || null, sd: res.gif.urls.sd || null, gif: res.gif.urls.gif || null };
        rgUrlMap.set(videoId, urls);
        UVP.Utils.addCapturedUrl(urls.hd);
        UVP.Utils.addCapturedUrl(urls.sd);
        return urls;
      }
    } catch (e) {
      if (e.message === '401' && _depth < 2) { rgToken.value = null; return UVP.Extractors.fetchRgUrls(videoId, _depth + 1); }
    }
    return null;
  };
  UVP.Extractors.captureRgApiData = function(jsonText) { try { const data = JSON.parse(jsonText); if (data.gif && data.gif.urls) { const id = UVP.Extractors.sanitizeRgId(data.gif.id || ''); if (id) { const urls = { hd: data.gif.urls.hd || null, sd: data.gif.urls.sd || null, gif: data.gif.urls.gif || null }; rgUrlMap.set(id, urls); UVP.Utils.addCapturedUrl(urls.hd); UVP.Utils.addCapturedUrl(urls.sd); } } if (data.gifs && Array.isArray(data.gifs)) { data.gifs.forEach(g => { if (g.urls) { const id = UVP.Extractors.sanitizeRgId(g.id || ''); if (id) { const urls = { hd: g.urls.hd || null, sd: g.urls.sd || null, gif: g.urls.gif || null }; rgUrlMap.set(id, urls); UVP.Utils.addCapturedUrl(urls.hd); UVP.Utils.addCapturedUrl(urls.sd); } } }); } } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }

  // ==================== XVIDEOS EXTRACTOR ====================
  UVP.Extractors.isXVideos = function() { return /(?:xvideos|xnxx)\.com/i.test(location.hostname); };

  UVP.Extractors.extractXVideosUrls = function() {
    if (!UVP.Extractors.isXVideos()) return;
    const scripts = UVP.Utils.getInlineScripts();
    for (const script of scripts) {
      const text = script.textContent || '';
      // Parses html5player.setVideoUrlHigh/Low/HLS('...')
      const re = /html5player\.(?:setVideoHLS|setVideoUrl(?:High|Low))\(['"]([^'"]+)['"]\)/g;
      let m;
      while ((m = re.exec(text))) {
        const u = m[1];
        if (u) {
          const resolved = UVP.Utils.captureUrl(u);
          if (resolved) {
          if (/hls/i.test(m[0])) fmtResMap.set(resolved, 1080);
          else if (/high/i.test(m[0])) fmtResMap.set(resolved, 720);
          else if (/low/i.test(m[0])) fmtResMap.set(resolved, 360);
          }
        }
      }
    }
  }

  // ==================== PH NETWORK EXTRACTOR (YouPorn, RedTube, Tube8) ====================
  UVP.Extractors.isPHNetwork = function() { return /(?:youporn\.com|redtube\.com|tube8\.com|thumbzilla\.com)/i.test(location.hostname); };

  UVP.Extractors.extractPHNetworkUrls = function() {
    if (!UVP.Extractors.isPHNetwork()) return;
    // Scans for ANY JSON object in the page containing mediaDefinitions
    const scripts = UVP.Utils.getInlineScripts();
    for (const script of scripts) {
      const text = script.textContent || '';
      let idx = text.indexOf('mediaDefinitions');
      while (idx !== -1) {
        let braceIdx = idx;
        while (braceIdx > 0 && text[braceIdx] !== '{') braceIdx--;
        const objText = UVP.Utils.matchBrace(text, braceIdx);
        if (objText) {
          try {
            const obj = JSON.parse(objText);
            if (obj && Array.isArray(obj.mediaDefinitions)) {
              for (const def of obj.mediaDefinitions) {
                if (def && def.videoUrl && typeof def.videoUrl === 'string' && /\.mp4|\.m3u8/i.test(def.videoUrl)) {
                  const resolved = UVP.Utils.captureUrl(def.videoUrl);
                  if (resolved) fmtResMap.set(resolved, parseInt(def.quality) || 0);
                }
              }
            }
          } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
        }
        idx = text.indexOf('mediaDefinitions', idx + 1);
      }
    }
  }

  // ==================== EPORNER EXTRACTOR ====================
  // Port of yt-dlp's encode_base_n(num, 36) — converts an integer to a
  // base-36 string using digits 0-9a-z (same as Number.toString(36)).
  UVP.Extractors.encodeBase36 = function(num) {
    if (num === 0) return '0';
    return num.toString(36);
  }

  // Port of yt-dlp's calc_hash: splits a 32-char hex string into 4 groups
  // of 8 hex chars, converts each to an integer, encodes in base-36, and
  // concatenates the results. Reverse-engineered from eporner's vjs.js.
  UVP.Extractors.epornerCalcHash = function(hexHash) {
    let result = '';
    for (let lb = 0; lb < 32; lb += 8) {
      result += UVP.Extractors.encodeBase36(parseInt(hexHash.substr(lb, 8), 16));
    }
    return result;
  }

  // Eporner: extracts video ID and hash from inline scripts, querying /xhr/video/{vid} for source URLs.
  UVP.Extractors.isEporner = function() { return /eporner\.com/i.test(location.hostname); };

  UVP.Extractors.extractEpornerUrls = async function() {
    if (!UVP.Extractors.isEporner()) return;

    // Avoid redundant API calls if we already have eporner URLs
    if ([...capturedUrls].some(u => /eporner|gvideo/i.test(u))) return;

    // Poke the site's video player to force it to request the HLS stream,
    // which our network interceptor will then catch. Eporner blocks direct
    // MP4 playback in custom video tags (403 Forbidden), so we need the HLS.
    const siteVideo = document.querySelector('video');
    if (siteVideo && siteVideo.paused) {
      try {
        siteVideo.muted = true;
        const playPromise = siteVideo.play();
        if (playPromise && playPromise.catch) playPromise.catch(() => {});
        setTimeout(() => { try { siteVideo.pause(); } catch (e) {} }, 150);
      } catch (e) { if (DEBUG) console.warn('[UVP] Failed to poke Eporner video:', e); }
    }

    // Extract vid and hash from inline scripts (EP.video.player config)
    const scripts = UVP.Utils.getInlineScripts();
    let vid = null, vidHash = null;
    for (const script of scripts) {
      const text = script.textContent || '';
      if (!vid) {
        const m = text.match(/EP\.video\.player\.vid\s*=\s*['"]([^'"]+)['"]/);
        if (m) vid = m[1];
      }
      if (!vidHash) {
        const m = text.match(/hash\s*[:=]\s*['"]([0-9a-f]{32})['"]/i);
        if (m) vidHash = m[1];
      }
      if (vid && vidHash) break;
    }

    // Fallback: extract vid from URL (video-XXXX / hd-porn/XXXX / embed/XXXX)
    if (!vid) {
      const m = location.pathname.match(/(?:video-|hd-porn\/|embed\/)(\w+)/);
      if (m) vid = m[1];
    }

    // Primary path: call the XHR video API with computed hash
    if (vid && vidHash) {
      const calcHash = UVP.Extractors.epornerCalcHash(vidHash);
      const apiHost = location.host || 'www.eporner.com';
      const apiUrl = `https://${apiHost}/xhr/video/${vid}?hash=${calcHash}&device=generic&domain=${apiHost}&fallback=false`;
      try {
        let resData = null;
        if (typeof fetch === 'function') {
          const resp = await fetch(apiUrl, { headers: { 'Origin': location.origin, 'Referer': location.href } });
          if (resp.ok) resData = await resp.json();
        } else {
          resData = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: 'GET', url: apiUrl,
              headers: { 'Origin': location.origin, 'Referer': location.href },
              onload: r => { try { resolve(JSON.parse(r.responseText || r.response)); } catch (e) { reject(e); } },
              onerror: reject, ontimeout: () => reject(new Error('timeout')), timeout: 15000
            });
          });
        }
        if (resData && resData.available !== false && resData.sources) {
          // MP4 sources: format_id (e.g. "1080p") → { src, type }
          if (resData.sources.mp4 && typeof resData.sources.mp4 === 'object') {
            for (const [formatId, fmt] of Object.entries(resData.sources.mp4)) {
              if (fmt && typeof fmt === 'object' && fmt.src && /^https?:\/\//i.test(fmt.src)) {
                const u = UVP.Utils.captureUrl(fmt.src);
                if (u) fmtResMap.set(u, UVP.Utils.parseResLabel(formatId));
              }
            }
          }
          // HLS sources
          if (resData.sources.hls && typeof resData.sources.hls === 'object') {
            for (const fmt of Object.values(resData.sources.hls)) {
              if (fmt && typeof fmt === 'object' && fmt.src && /^https?:\/\//i.test(fmt.src)) {
                UVP.Utils.captureUrl(fmt.src);
              }
            }
          }
        }
      } catch (e) {
        console.warn('[UVP] Eporner XHR API failed:', e);
      }
    }

    // Fallback: parse contentUrl from JSON-LD structured data
    if ([...capturedUrls].every(u => !/eporner|gvideo/i.test(u))) {
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of ldScripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data && data.contentUrl && /^https?:\/\//i.test(data.contentUrl)) {
            const u = UVP.Utils.captureUrl(data.contentUrl);
            if (u && data.height) fmtResMap.set(u, parseInt(data.height) || 0);
          }
        } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
      }
    }
  }

  // Pornhub URL selection: respects user quality mode ('max' selects top variant; 'auto' preserves site default).
  // the recovery replay to the site-default variant instead of looping on a
  // dead URL.
  UVP.Extractors.pickPornhubUrl = function() {
    const fv = UVP.Extractors.extractFlashvarsObject();
    if (fv && Array.isArray(fv.mediaDefinitions)) {
      const wantMax = UVP.Utils.getPlaybackQuality() !== 'auto';
      const hls = fv.mediaDefinitions.filter(d => d && d.format === 'hls' && typeof d.videoUrl === 'string' && d.videoUrl);
      if (hls.length) {
        if (!wantMax) {
          const def = hls.find(d => d.defaultQuality === true);
          if (def) return UVP.Utils.resolveSafeUrl(def.videoUrl, location.href);
        }
        hls.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
        return UVP.Utils.resolveSafeUrl(hls[0].videoUrl, location.href);
      }
      const mp4 = fv.mediaDefinitions.filter(d => d && d.format === 'mp4' && typeof d.videoUrl === 'string' && /\.mp4/i.test(d.videoUrl));
      if (mp4.length) {
        mp4.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
        return UVP.Utils.resolveSafeUrl(mp4[0].videoUrl, location.href);
      }
    }
    return null;
  }

  // Recovery companion for max-mode picks: given the URL that just failed
  // during a recovery replay, return a lower variant to downgrade to — or null
  // to keep replaying the same URL. Downgrades ONLY when the failed URL is the
  // top-ranked pick: if a safe (defaultQuality or mid-tier) variant failed,
  // replaying it is still correct. If the failed top pick IS the site-default
  // variant, the alt!==failed guard in the caller makes this a no-op.
  UVP.Extractors.pickPornhubRecoveryUrl = function(failedUrl) {
    try {
      if (!failedUrl) return null;
      const fv = UVP.Extractors.extractFlashvarsObject();
      if (!fv || !Array.isArray(fv.mediaDefinitions)) return null;
      const sorted = fv.mediaDefinitions
        .filter(d => d && d.format === 'hls' && typeof d.videoUrl === 'string' && d.videoUrl)
        .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
      if (sorted.length < 2) return null;
      const failedIdx = sorted.findIndex(d => UVP.Utils.resolveSafeUrl(d.videoUrl, location.href) === failedUrl);
      if (failedIdx !== 0) return null;
      const def = sorted.find(d => d.defaultQuality === true);
      const alt = def || sorted[1];
      return alt ? UVP.Utils.resolveSafeUrl(alt.videoUrl, location.href) : null;
    } catch (e) { if (DEBUG) console.warn('[UVP] pickPornhubRecoveryUrl failed:', e); return null; }
  }

  // Pornhub /video/get_media resolver: fetches direct MP4 fallback array for HLS-priority videos.
  UVP.Extractors.resolvePornhubGetMedia = async function(getMediaUrl) {
    if (!UVP.Utils.isUsableUrl(getMediaUrl)) return null;
    try {
      const res = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET', url: getMediaUrl,
          headers: { 'Origin': location.origin, 'Referer': location.href },
          onload: r => { try { resolve(JSON.parse(r.response)); } catch (e) { reject(e); } },
          onerror: reject, ontimeout: () => reject(new Error('timeout')), timeout: 15000
        });
      });
      if (Array.isArray(res)) {
        const mp4s = res.filter(m => m && m.videoUrl && /\.mp4/i.test(m.videoUrl));
        if (mp4s.length) {
          mp4s.sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
          return UVP.Utils.resolveSafeUrl(mp4s[0].videoUrl, location.href);
        }
      }
    } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    return null;
  }
  UVP.Extractors.resolvePornhubGetMediaFallback = async function() {
    const gm = [...capturedUrls].find(u => /\/video\/get_media/i.test(u));
    if (!gm) return null;
    return await UVP.Extractors.resolvePornhubGetMedia(gm);
  }
 // Stage 2: POST to /api/videos/stream with the data-streamkey to get a JSON
  // response of {format_id: videoUrl} pairs. Used when stream_url_ vars are absent.
  UVP.Extractors.fetchSpankBangStreamApi = async function() {
    if (!UVP.Extractors.isSpankBang()) return null;
    const streamKeyEl = document.querySelector('[data-streamkey]');
    if (!streamKeyEl) return null;
    const streamKey = streamKeyEl.getAttribute('data-streamkey');
    if (!streamKey) return null;
    try {
      const res = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'POST',
          url: 'https://spankbang.com/api/videos/stream',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': location.href,
            'X-Requested-With': 'XMLHttpRequest',
          },
          data: `id=${encodeURIComponent(streamKey)}&data=0`,
          onload: r => { try { resolve(JSON.parse(r.response)); } catch (e) { reject(e); } },
          onerror: reject, ontimeout: () => reject(new Error('timeout')), timeout: 15000
        });
      });
      if (res && typeof res === 'object') {
        const urls = [];
        for (const [formatId, formatUrl] of Object.entries(res)) {
          let url = Array.isArray(formatUrl) ? formatUrl[0] : formatUrl;
          if (typeof url === 'string' && url) {
            url = UVP.Utils.resolveSafeUrl(url, location.href);
            UVP.Utils.addCapturedUrl(url);
            urls.push({ formatId, url });
          }
        }
        return urls;
      }
    } catch (e) { console.warn('[UVP] SpankBang stream API failed:', e); }
    return null;
  }


  // ==================== XHAMSTER SUPPORT ====================
  UVP.Extractors.isXHamster = function() {
    return /(?:xhamster\.(?:com|one|desi)|xhms\.pro|xhamster\d+\.(?:com|desi)|xhday\.com|xhvid\.com)/i.test(location.hostname);
  }

  // Port of yt-dlp's _ByteGenerator PRNG (7 algorithm variants) for xHamster
  // URL deobfuscation. Each call to next() advances the state and returns a byte.
  UVP.Extractors.xhamByteGen = function(algoId, seed) {
    let s = seed | 0;
    const algos = {
      1: () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return s; },
      2: () => { s = (s ^ (s << 13)) | 0; s = (s ^ (s >>> 17)) | 0; s = (s ^ (s << 5)) | 0; return s; },
      3: () => { s = (s + 0x9e3779b9) | 0; s = (s ^ (s >>> 16)) | 0; s = Math.imul(s, 0x85ebca77) | 0; s = (s ^ (s >>> 13)) | 0; s = Math.imul(s, 0xc2b2ae3d) | 0; return (s ^ (s >>> 16)) | 0; },
      4: () => { s = (s + 0x6d2b79f5) | 0; s = ((s << 7) | (s >>> 25)) | 0; s = (s + 0x9e3779b9) | 0; s = (s ^ (s >>> 11)) | 0; return Math.imul(s, 0x27d4eb2d) | 0; },
      5: () => { s = (s ^ (s << 7)) | 0; s = (s ^ (s >>> 9)) | 0; s = (s ^ (s << 8)) | 0; s = (s + 0xa5a5a5a5) | 0; return s; },
      6: () => { s = (Math.imul(s, 0x2c9277b5) + 0xac564b05) | 0; const s2 = (s ^ (s >>> 18)) | 0; const shift = (s >>> 27) & 31; return (s2 >>> shift) | 0; },
      7: () => { s = (s + 0x9e3779b9) | 0; let e = (s ^ (s << 5)) | 0; e = Math.imul(e, 0x7feb352d) | 0; e = (e ^ (e >>> 15)) | 0; return Math.imul(e, 0x846ca68b) | 0; },
    };
    const algo = algos[algoId];
    if (!algo) return null;
    return { next: () => algo() & 0xFF };
  }

  UVP.Extractors.decipherXHamsterHex = function(hexString) {
    const clean = hexString.replace(/^0x/i, '');
    if (clean.length < 12 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
    if (bytes.length < 6) return null;
    const gen = UVP.Extractors.xhamByteGen(bytes[0], new DataView(bytes.buffer).getInt32(1, true));
    if (!gen) return null;
    let result = '';
    for (let i = 5; i < bytes.length; i++) result += String.fromCharCode(bytes[i] ^ gen.next());
    return result;
  }

  // Deciphers a full-hex string or a URL with a hex path segment.
  // Returns null for non-hex URLs (matching yt-dlp — unsupported URL formats are skipped).
  UVP.Extractors.decipherXHamsterUrl = function(formatUrl) {
    if (!formatUrl || typeof formatUrl !== 'string') return null;
    if (/^[0-9a-fA-F]{12,}$/.test(formatUrl)) return UVP.Extractors.decipherXHamsterHex(formatUrl);
    if (!/^https?:\/\//i.test(formatUrl)) return null;
    try {
      const url = new URL(formatUrl);
      const m = url.pathname.match(/^\/([0-9a-fA-F]{12,})([/,].+)$/);
      if (m) {
        const d = UVP.Extractors.decipherXHamsterHex(m[1]);
        if (d) { url.pathname = '/' + d + m[2]; return url.href; }
      }
      return null; // yt-dlp returns None for unsupported URL formats
    } catch (e) { return null; }
  }

  UVP.Extractors.extractXHamsterInitials = function() {
    // Primary: access page globals directly (most reliable — already executed)
    try {
      const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      if (w && w.initials && Object.getPrototypeOf(w.initials) === Object.prototype) return w.initials;
    } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    // Fallback: parse from inline scripts
    const scripts = UVP.Utils.getInlineScripts();
    for (const script of scripts) {
      const text = script.textContent || '';
      const m = text.match(/window\.initials\s*=\s*(\{)/);
      if (!m) continue;
      const objText = UVP.Utils.matchBrace(text, m.index + m[0].length - 1);
      if (objText) { try { return JSON.parse(objText); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
    }
    return null;
  }

  UVP.Extractors.extractXHamsterUrls = function() {
    if (!UVP.Extractors.isXHamster()) return;
    const initials = UVP.Extractors.extractXHamsterInitials();
    if (!initials) return;
    // videoModel.sources — plain URLs (no deciphering needed)
    const video = initials.videoModel;
    if (video && video.sources && typeof video.sources === 'object') {
      for (const [formatId, formatsDict] of Object.entries(video.sources)) {
        if (formatId === 'download' || typeof formatsDict !== 'object') continue;
        for (const url of Object.values(formatsDict)) {
          if (typeof url === 'string' && /^https?:\/\//i.test(url)) UVP.Utils.captureUrl(url);
        }
      }
    }
    // xplayerSettings.sources — may be hex-obfuscated, need deciphering
    const xp = initials.xplayerSettings;
    if (xp && xp.sources && typeof xp.sources === 'object') {
      const hls = xp.sources.hls;
      if (hls && typeof hls === 'object') {
        // Handle new structure: { av1: { url: ... }, h264: { url: ... } }
        // as well as old structure: { url: ..., fallback: ... }
        const scanHlsObj = (obj) => {
          for (const key of ['url', 'fallback']) {
            if (obj[key] && typeof obj[key] === 'string') {
              const d = UVP.Extractors.decipherXHamsterUrl(obj[key]);
              if (d && /^https?:\/\//i.test(d)) UVP.Utils.captureUrl(d);
            }
          }
        };
        if (hls.url || hls.fallback) {
          scanHlsObj(hls);
        } else {
          for (const codec of Object.values(hls)) {
            if (codec && typeof codec === 'object') scanHlsObj(codec);
          }
        }
      }
      // xplayerSettings.sources.standard intentionally skipped — yt-dlp marks these
      // with __needs_testing: "HTTP formats return Wrong key error even when deciphered
      // by site JS". Only videoModel.sources (plain MP4) and xplayerSettings.sources.hls
      // (deciphered HLS) produce playable URLs.
    }
  }


  // ==================== X / TWITTER SUPPORT ====================
  // X.com (formerly Twitter) serves video via MSE (Media Source Extensions),
  // so <video>.src is always blob: — invisible to all existing extraction
  // layers. Video URLs live inside GraphQL API response bodies
  // (tweetResult > legacy > extended_entities > media > video_info >
  // variants[]) and are never fetched through the page's patched fetch/XHR
  // as .mp4/.m3u8 URLs. Two complementary capture paths:
  //   1. GraphQL response interception (fetch + XHR) — catches already-loaded
  //      tweet data (timeline, embedded tweets)
  //   2. Syndication API (cdn.syndication.twimg.com/tweet-result) — proactive,
  //      no auth required, gets ALL variants. Ported from yt-dlp's Twitter
  //      extractor, which uses this as the guest/no-auth fallback.
  UVP.Extractors.isX = function() { return /(?:^|\.)(twitter|x)\.com$/i.test(location.hostname); }

  // Extract tweet ID from URL: x.com/<user>/status/<id> or
  // twitter.com/i/web/status/<id>
  UVP.Extractors.getXTweetId = function() {
    const m = location.pathname.match(/\/status(?:es)?\/(\d+)/);
    return m ? m[1] : null;
  }

  // Extract media ID from a <video> poster URL. X.com poster URLs follow
  // these patterns:
  //   pbs.twimg.com/ext_tw_video_thumb/<media_id>/pu/img/<hash>.jpg
  //   pbs.twimg.com/amplify_video_thumb/<media_id>/img/<hash>.jpg
  // The video URLs share the same media ID:
  //   video.twimg.com/ext_tw_video/<media_id>/pu/vid/.../...mp4
  //   video.twimg.com/ext_tw_video/<media_id>/pu/pl/...m3u8
  //   video.twimg.com/amplify_video/<media_id>/vid/...mp4
  UVP.Extractors.getXMediaIdFromPoster = function(posterUrl) {
    if (!posterUrl) return null;
    const m = posterUrl.match(/\/(?:ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\/(\d+)/);
    return m ? m[1] : null;
  }

  // Find the tweet ID from the DOM context of a video element. On the
  // timeline, each tweet is wrapped in an <article> that contains links
  // like /<user>/status/<id>. Walk up from the video to find such a link.
  UVP.Extractors.getXTweetIdFromElement = function(video) {
    if (!video) return null;
    let el = video;
    for (let i = 0; i < 15 && el; i++) {
      const link = el.querySelector ? el.querySelector('a[href*="/status/"]') : null;
      if (link) {
        const m = link.href.match(/\/status\/(\d+)/);
        if (m) return m[1];
      }
      el = el.parentElement;
    }
    return null;
  }

  // Recursively scan a JSON object for video_info.variants[] — works on
  // both GraphQL responses and syndication API responses.
  UVP.Extractors.scanXMedia = function(obj, depth) {
    depth = depth || 0;
    if (!obj || typeof obj !== 'object' || depth > 64) return;
    if (Array.isArray(obj)) { for (const item of obj) UVP.Extractors.scanXMedia(item, depth + 1); return; }
    // Found a media object with video_info
    if (obj.video_info && Array.isArray(obj.video_info.variants)) {
      for (const v of obj.video_info.variants) {
        if (v.url && /\.(mp4|m3u8)([?#]|$)/i.test(v.url)) {
          const resolved = UVP.Utils.captureUrl(v.url);
          if (resolved) {
            // Bitrate-based resolution: the API gives bitrate in bps
            // (e.g. 2176000). Map to fmtResMap for the generic picker.
            if (v.bitrate && v.bitrate > 0) fmtResMap.set(resolved, Math.round(v.bitrate / 1000));
            // Also try dimensions from URL: /<w>x<h>/ pattern
            const dim = v.url.match(/\/(\d+)x(\d+)\//);
            if (dim && dim[2]) fmtResMap.set(resolved, parseInt(dim[2]));
          }
        }
      }
    }
    for (const val of Object.values(obj)) {
      if (typeof val === 'object') UVP.Extractors.scanXMedia(val, depth + 1);
    }
  }

  // Syndication token: ported from yt-dlp's _generate_syndication_token.
  // ((Number(twid) / 1e15) * Math.PI).toString(36).replace(/[0.]/g, '')
  UVP.Extractors.xSyndicationToken = function(twid) {
    return ((Number(twid) / 1e15) * Math.PI).toString(36).replace(/[0.]/g, '');
  }

  // Proactive fetch via the public syndication API — no auth/cookies needed.
  // Returns the raw tweet result JSON or null.
  UVP.Extractors.fetchXSyndication = async function(tweetId) {
    if (!tweetId) return null;
    const token = UVP.Extractors.xSyndicationToken(tweetId);
    const apiUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}`;
    try {
      const res = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: apiUrl,
          headers: { 'User-Agent': 'Googlebot' },
          onload: (r) => {
            if (r.status >= 200 && r.status < 300) {
              try { resolve(JSON.parse(r.response)); } catch (e) { reject(e); }
            } else { reject(new Error('HTTP ' + r.status)); }
          },
          onerror: reject,
          ontimeout: () => reject(new Error('timeout')),
          timeout: 15000
        });
      });
      if (res) {
        // Syndication response has mediaDetails[] (or quoted_tweet.mediaDetails[])
        UVP.Extractors.scanXMedia(res);
        return res;
      }
    } catch (e) { if (DEBUG) console.warn('[UVP] X syndication fetch failed:', e); }
    return null;
  }

  // Orchestrate extraction: GraphQL-captured URLs first, then syndication API.
  UVP.Extractors.extractXUrls = async function() {
    if (!UVP.Extractors.isX()) return;
    // On tweet pages, proactively fetch via syndication API so URLs are
    // ready before the user clicks. On non-tweet pages (timeline), GraphQL
    // interception handles capture — nothing to do proactively.
    const tweetId = UVP.Extractors.getXTweetId();
    if (tweetId) await UVP.Extractors.fetchXSyndication(tweetId);
  }

  // X-aware picker: prefer highest-bitrate MP4, fallback HLS.
  // Optional mediaId filters to URLs for a specific tweet's video (timeline
  // has URLs from many tweets mixed in capturedUrls).
  UVP.Extractors.pickXUrl = function(mediaId) {
    let all = UVP.Utils.extractAllUrls().filter(u => /video\.twimg\.com/i.test(u));
    if (!all.length) return null;
    if (mediaId) {
      const scoped = all.filter(u => u.includes('/' + mediaId + '/'));
      if (scoped.length) all = scoped;
      else return null; // Media ID was targeted — do not fall back to an unrelated tweet's video
    }
    // Filter out audio tracks and adaptive fragments from direct video picks
    const videoOnly = all.filter(u => !UVP.Utils.isAudioOnly(u) && !UVP.Utils.isLikelyAdaptiveFragment(u));
    // Prefer standalone MP4 (direct play, downloadable)
    const mp4s = videoOnly.filter(u => /\.mp4([?#]|$)/i.test(u) && !/\/vid\/[^\/]+\/0\/0\//i.test(u));
    if (mp4s.length) {
      mp4s.sort((a, b) => UVP.Utils.resOf(b) - UVP.Utils.resOf(a));
      return mp4s[0];
    }
    // Fallback to master HLS playlist
    const hls = all.filter(u => /\.m3u8([?#]|$)/i.test(u) && !UVP.Utils.isAudioOnly(u));
    if (hls.length) {
      for (let i = hls.length - 1; i >= 0; i--) {
        if (/\/pl\/(?:master|[a-zA-Z0-9_-]+)\.m3u8/i.test(hls[i]) && !/\/pl\/(?:avc1|mp4a)\//i.test(hls[i])) {
          return hls[i];
        }
      }
      hls.sort((a, b) => UVP.Utils.resOf(b) - UVP.Utils.resOf(a));
      return hls[0];
    }
    return null;
  }

   // ==================== GENERIC JSON-LD VIDEOOBJECT EXTRACTOR ====================
  // Mirrors yt-dlp's generic extractor: many sites server-render their stream
  // URL into schema.org VideoObject structured data (contentUrl / embedUrl).
  // This works even when the site player runs on a blob: URL and the stream
  // URL never passes through fetch/XHR interception (e.g. PMV Haven, whose
  // Nuxt payload ships  https://.../master.m3u8  as JSON-LD contentUrl).
  // Handles top-level arrays and @graph wrappers per the schema.org spec.
  UVP.Extractors.scanJsonLdVideoObject = function(obj) {
    if (!obj || typeof obj !== 'object') return;
    const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
    if (!types.some(t => typeof t === 'string' && /VideoObject/i.test(t))) return;
    for (const key of ['contentUrl', 'embedUrl', 'contentURL', 'embedURL']) {
      const u = obj[key];
      if (typeof u === 'string' && /\.(m3u8|mpd|mp4|webm|m4v)([?#]|$)/i.test(u)) {
        // SPA Stale DOM guard: if the framework failed to remove the previous
        // video's JSON-LD tag, ignore it so it doesn't hijack the new video.
        if (staleJsonLdUrls.has(u) || staleJsonLdUrls.has(UVP.Utils.resolveSafeUrl(u, location.href))) {
          if (DEBUG) console.warn('[UVP] Ignoring stale JSON-LD URL from previous SPA route:', u);
          continue;
        }
        const resolved = UVP.Utils.captureUrl(u);
        if (resolved) {
          jsonLdUrls.add(resolved); // Tag authoritative JSON-LD VideoObject URLs
          if (obj.height) fmtResMap.set(resolved, parseInt(obj.height) || 0);
        }
      }
    }
  }
  UVP.Extractors.extractJsonLdVideoUrls = function() {
    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const roots = Array.isArray(data) ? data : [data];
        for (const root of roots) {
          if (!root || typeof root !== 'object') continue;
          const graph = Array.isArray(root['@graph']) ? root['@graph'] : [root];
          for (const node of graph) UVP.Extractors.scanJsonLdVideoObject(node);
        }
      } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    }
  }

  // ==================== PMV HAVEN SUPPORT ====================
  // Nuxt/Vue SPA: the site player runs hls.js on a blob: URL, but the master
  // playlist is server-rendered into JSON-LD VideoObject.contentUrl
  // (pmvhavencloud.s3.*.io.cloud.ovh.net/<id>/master.m3u8 — verified publicly
  // fetchable, variants up to 2160p). resolveToMediaPlaylist then walks the
  // variant ladder for downloads, and the overlay starts at the top level.
  UVP.Extractors.isPMVHaven = function() { return /pmvhaven\.com/i.test(location.hostname); }
  UVP.Extractors.extractPMVHavenUrls = function() {
    if (!UVP.Extractors.isPMVHaven()) return;
    UVP.Utils.safeCall(UVP.Extractors.extractJsonLdVideoUrls, 'extractJsonLdVideoUrls');
    if ([...capturedUrls].some(u => /\.m3u8([?#]|$)/i.test(u))) return;
    // Fallback: scan inline Nuxt payload scripts for direct stream URLs
    const scripts = UVP.Utils.getInlineScripts();
    for (const script of scripts) {
      const text = script.textContent || '';
      const matches = text.matchAll(/https?:\/\/[^\s"'\\<>]+?\.(?:m3u8|mpd|mp4)(?:[?#][^\s"'\\<>]*)?/gi);
      for (const m of matches) UVP.Utils.captureUrl(m[0]);
    }
  }
  // Generic VideoObject extractor: maps structured schema markup across supported sites
  // pickBestUrl: the JSON-LD contentUrl tag (pmvhavencloud.../master.m3u8 is
  // server-rendered for this video) now drives the preference on every site,
  // and it keeps working if PMV Haven migrates CDNs (the old
  // pmvhaven|ovh hostRe would not). extractPMVHavenUrls (the Nuxt
  // inline-payload scan above) remains as cheap insurance for pages
  // where JSON-LD is absent.



  // ==================== YOUTUBE SUPPORT ====================
  // Uses the Innertube player API with JS-less clients (visionos, tv) that
  // return pre-signed URLs without PO tokens or n-parameter challenges.
  // Falls back to inline ytInitialPlayerResponse parsing.
  // Progressive formats (itag 18=360p, 22=720p) combine video+audio in one MP4.
  UVP.Extractors.isYouTube = function() { return /(?:^|\.)youtube\.com$|(?:^|\.)youtu\.be$/i.test(location.hostname); }

  UVP.Extractors.getYtVideoId = function() {
    const valid = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    try {
      const u = new URL(location.href);
      const queryId = valid(u.searchParams.get('v'));
      if (queryId) return queryId;
      const parts = u.pathname.split('/').filter(Boolean);
      if (/^(?:embed|shorts|live)$/i.test(parts[0] || '')) return valid(parts[1]);
      if (/^youtu\.be$/i.test(u.hostname)) return valid(parts[0]);
    } catch (e) { if (DEBUG) console.warn('[UVP] YouTube URL parse failed:', e); }
    // Fallback for unusual URL-like location objects supplied by userscript hosts.
    const m = String(location.href).match(/(?:[?&]v=|\/embed\/|\/shorts\/|\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[&#/?]|$)/i);
    return m ? valid(m[1]) : null;
  }

  const ytFmtMap = new Map(); // url -> { itag, height, mimeType, hasN, bitrate, fps, isHls?, isLive? }
  const ytPlayerData = { playerJsUrl: null, isLive: false, videoId: null, fmtTs: 0 }; // Active player metadata (videoId, isLive, freshness timestamp)
  let ytRouteGeneration = 0;
  let ytGateLog = []; // Diagnostic log of per-client playabilityStatus outcomes
  const getYtRequestVideoId = (body) => {
    if (!body) return null;
    try {
      const value = typeof body === 'string' ? JSON.parse(body) : body;
      return value && typeof value.videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(value.videoId) ? value.videoId : null;
    } catch (e) { return null; }
  };
  const isCurrentYtResponse = (requestId, requestGeneration, data) => {
    if (!requestId || requestId !== UVP.Extractors.getYtVideoId()) return false;
    if (requestGeneration !== ytRouteGeneration) return false;
    return !data || !data.videoDetails || !data.videoDetails.videoId || data.videoDetails.videoId === requestId;
  };
  let _ytExtracting = null;   // concurrency lock — the in-flight extraction promise
  let _ytExtractingId = null; // videoId the in-flight extraction belongs to (staleness key)
  let _ytExtractingGeneration = -1;
  const ytDecipheredUrls = new Set(); // Tracks URLs already deciphered to prevent redundant double-transform

  // Freshness gate: true when ytFmtMap holds fresh formats for current videoId.
  UVP.Extractors.ytHasDurableLiveManifest = function() {
    if (!ytPlayerData.isLive) return false;
    for (const info of ytFmtMap.values()) {
      if (info && info.isLive && (info.isHls || info.isDash)) return true;
    }
    return false;
  };
  UVP.Extractors.ytNeedsLiveManifestWalk = function() {
    return ytPlayerData.isLive && !UVP.Extractors.ytHasDurableLiveManifest();
  };
  UVP.Extractors.ytFormatsCurrent = function() {
    if (ytFmtMap.size === 0) return false;
    const vid = UVP.Extractors.getYtVideoId();
    if (!vid || ytPlayerData.videoId !== vid) return false;
    if ((Date.now() - (ytPlayerData.fmtTs || 0)) >= CONFIG.ytFmtTtlMs) return false;
    // SABR/adaptive URLs are only a short live window. They are not a durable
    // current result until a client supplies HLS or DASH manifest metadata.
    if (ytPlayerData.isLive && !UVP.Extractors.ytHasDurableLiveManifest()) return false;
    return true;
  };

  // InnerTube client profiles (synced with yt-dlp): priority order for format acquisition.
  const YT_CLIENTS = [
    // JS-less clients: return pre-signed URLs without PO tokens or n-param
    { clientName: 'VISIONOS', clientVersion: '1.02', clientId: 101,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
      extra: { deviceMake: 'Apple', deviceModel: 'RealityDevice17,1', osName: 'visionOS', osVersion: '26.5.23O471' } },
    // Mobile clients (yt-dlp pattern): bypass n-param throttling, no PO token
    // required. URLs from these clients often don't have the n-parameter
    // challenge, avoiding the need for player JS decipher.
    { clientName: 'ANDROID', clientVersion: '21.26.364', clientId: 3,
      userAgent: 'com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip',
      extra: { androidSdkVersion: 30, osName: 'Android', osVersion: '11' } },
    { clientName: 'IOS', clientVersion: '21.26.4', clientId: 5,
      userAgent: 'com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
      extra: { deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82' } },
  ];
  // Client table exposed for invariant verification and freshness tracking.
  UVP.Extractors.YT_CLIENTS = YT_CLIENTS;

  const ytAudioTrackInfo = (fmt) => {
    const track = fmt && fmt.audioTrack;
    if (!track || typeof track !== 'object') return { audioTrackId: '', audioTrackName: '', audioLanguage: '', audioIsDefault: false, audioIsAutoDubbed: false, audioIsOriginal: false };
    const id = typeof track.id === 'string' ? track.id : '';
    const name = typeof track.displayName === 'string' ? track.displayName : '';
    const dot = id.lastIndexOf('.');
    const language = dot > 0 ? id.slice(0, dot) : '';
    const autoDubbed = track.isAutoDubbed === true;
    const isDefault = track.audioIsDefault === true;
    const descriptive = /(?:^|\s)descriptive(?:\s|$)/i.test(name);
    return {
      audioTrackId: id,
      audioTrackName: name,
      audioLanguage: language,
      audioIsDefault: isDefault,
      audioIsAutoDubbed: autoDubbed,
      audioIsDescriptive: descriptive,
      audioIsOriginal: isDefault || /(?:^|\s)original(?:\s|$)/i.test(name)
    };
  };
  const ytFormatInfo = (fmt, resolved) => ({
    itag: fmt.itag, height: fmt.height || 0, width: fmt.width || 0,
    mimeType: fmt.mimeType || '', hasN: /[?&]n=/.test(resolved),
    bitrate: fmt.bitrate || 0, fps: fmt.fps || 0,
    audioSampleRate: fmt.audioSampleRate || 0,
    initRange: (fmt.initRange && isFinite(fmt.initRange.start) && isFinite(fmt.initRange.end)) ? { start: Number(fmt.initRange.start), end: Number(fmt.initRange.end) } : null,
    indexRange: (fmt.indexRange && isFinite(fmt.indexRange.start) && isFinite(fmt.indexRange.end)) ? { start: Number(fmt.indexRange.start), end: Number(fmt.indexRange.end) } : null,
    approxDurationMs: Number(fmt.approxDurationMs) || 0,
    ...ytAudioTrackInfo(fmt)
  });

  UVP.Extractors.processYtStreamingData = function(sd, videoDetails) {
    if (!sd) return 0;
    const currentVid = UVP.Extractors.getYtVideoId();
    if (videoDetails && videoDetails.videoId && currentVid && videoDetails.videoId !== currentVid) return 0;
    // Record videoId identity and capture timestamp for format caching.
    // and when they were captured. A videoId change also resets the live flag —
    // a stale true from a previous live video falsely blocked saves on the
    // next (non-live) video ("Live streams cannot be saved" bug).
    const _vid = (videoDetails && videoDetails.videoId) || currentVid || null;
    if (_vid && ytPlayerData.videoId !== _vid) {
      ytPlayerData.videoId = _vid;
      ytPlayerData.fmtTs = 0;
      ytPlayerData.isLive = false;
      // A new videoId invalidates every route-scoped URL pool. This branch can
      // run before onSpaNav/observer when a current response wins the race.
      ytFmtMap.clear();
      ytDecipheredUrls.clear();
      fmtResMap.clear();
      state.decodeDowngradeExhaustedUrl = null;
      state.decodeDowngradeAt = 0;
      ytPlayerData.playerJsUrl = null;
      ytNsigCache.playerUrl = null;
      ytNsigCache.func = null;
      UVP.Utils.invalidateUrlCache();
      for (const u of [...capturedUrls]) {
        if (/googlevideo\.com/i.test(u)) {
          capturedUrls.delete(u);
          capturedUrlKinds.delete(u);
        }
      }
    }
    let count = 0;
    for (const fmt of (sd.formats || [])) {
      if (!fmt || !fmt.url || !/^https?:\/\//i.test(fmt.url)) continue;
      const resolved = UVP.Utils.captureUrl(fmt.url);
      if (!resolved) continue;
      // Retain byte ranges (initRange/indexRange) for client-side DASH SegmentBase construction
      // playback (NewPipe manifest model). width/audioSampleRate feed the
      // Representation attributes.
      // InnerTube delivers range values as STRINGS ("741"): isFinite() alone
      // would pass them through and the manifest's byte offsets would
      // string-concatenate into garbage — cast to Number
      // (gemini cross-check F1, BLOCKER).
      ytFmtMap.set(resolved, ytFormatInfo(fmt, resolved));
      fmtResMap.set(resolved, fmt.height || 0);
      count++;
    }
    for (const fmt of (sd.adaptiveFormats || [])) {
      if (!fmt || !fmt.url || !/^https?:\/\//i.test(fmt.url)) continue;
      const resolved = UVP.Utils.captureUrl(fmt.url);
      if (!resolved) continue;
      // Retain byte ranges (initRange/indexRange) for client-side DASH SegmentBase construction
      // playback (NewPipe manifest model). width/audioSampleRate feed the
      // Representation attributes.
      // InnerTube delivers range values as STRINGS ("741"): isFinite() alone
      // would pass them through and the manifest's byte offsets would
      // string-concatenate into garbage — cast to Number
      // (gemini cross-check F1, BLOCKER).
      ytFmtMap.set(resolved, ytFormatInfo(fmt, resolved));
      fmtResMap.set(resolved, fmt.height || 0);
      count++;
    }
    // Live streams: the googlevideo format URLs only serve the current ~5s
    // live window and then expire (the "plays 5 seconds then stops" bug).
    // The HLS manifest is the durable live URL — capture and tag it so
    // pickYouTubeUrl/playVideo route it through hls.js.
    // Non-live HLS manifest fallback: used when direct progressive/adaptive streams are restricted.
    if (sd.hlsManifestUrl && /^https?:\/\//i.test(sd.hlsManifestUrl)) {
      const resolved = UVP.Utils.captureUrl(sd.hlsManifestUrl, null, 'hls');
      if (resolved) {
        ytFmtMap.set(resolved, { itag: 0, height: 0, mimeType: 'application/x-mpegURL', hasN: false, bitrate: 0, fps: 0, isHls: true, isLive: !!(videoDetails && videoDetails.isLive === true) }); // Tag VOD manifests as non-live for picker fallback
        count++;
      }
    }
    if (sd.dashManifestUrl && /^https?:\/\//i.test(sd.dashManifestUrl)) {
      const resolved = UVP.Utils.captureUrl(sd.dashManifestUrl, null, 'dash');
      if (resolved) {
        ytFmtMap.set(resolved, { itag: 0, height: 0, mimeType: 'application/dash+xml', hasN: false, bitrate: 0, fps: 0, isDash: true, isLive: !!(videoDetails && videoDetails.isLive === true) });
        count++;
      }
    }
    if (videoDetails && videoDetails.isLive === true) ytPlayerData.isLive = true;
    if (count > 0) ytPlayerData.fmtTs = Date.now(); // Route freshness timestamp
    return count;
  }

  // Access page globals through unsafeWindow (sandbox-safe)
  function getYtcfg() {
    try {
      const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      if (w && w.ytcfg && typeof w.ytcfg.get === 'function') return w.ytcfg;
    } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    return null;
  }

  function getYtApiKey() {
    const cfg = getYtcfg();
    if (cfg) { try { const k = cfg.get('INNERTUBE_API_KEY'); if (typeof k === 'string' && /^[A-Za-z0-9_-]{20,40}$/.test(k)) return k; } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
    // Fallback: scrape from inline ytcfg.set({..."INNERTUBE_API_KEY":"..."})
    try {
      const scripts = UVP.Utils.getInlineScripts();
      for (const s of scripts) {
        const m = (s.textContent || '').match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
        if (m) return m[1];
      }
    } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    // Well-known public web client key
    return 'AIzaSyAO_FJ2SlqU8Q4STEhlGCjW-1fS_ISjBXA';
  }

  function getYtVisitorData() {
    const cfg = getYtcfg();
    if (cfg) { try { return cfg.get('INNERTUBE_CONTEXT')?.client?.visitorData || null; } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
    return null;
  }

  // WEB player requests require the page signatureTimestamp -
  // without it the API returns UNPLAYABLE "Video unavailable".
  function getYtSts() {
    const cfg = getYtcfg();
    if (cfg) { try { const s = cfg.get('STS'); if (typeof s === 'string' && /^\d+$/.test(s)) return Number(s); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
    return null;
  }
  function getYtClientVersion() {
    const cfg = getYtcfg();
    if (cfg) { try { const v = cfg.get('INNERTUBE_CLIENT_VERSION'); if (typeof v === 'string' && /^\d+\.\d{8}\./.test(v)) return v; } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
    return null;
  }

  async function fetchYtPlayerData(videoId, client) {
    const context = {
      context: { client: { clientName: client.clientName, clientVersion: client.clientVersion, hl: 'en', timeZone: 'UTC', utcOffsetMinutes: 0, ...client.extra } },
      videoId
    };
    const apiKey = getYtApiKey();
    const visitorData = getYtVisitorData();
    const apiUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`;
    const headers = {
      'Content-Type': 'application/json',
      'X-YouTube-Client-Name': String(client.clientId),
      'X-YouTube-Client-Version': client.clientVersion,
    };
    if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;
    const body = JSON.stringify(context);
    const isPlayable = (d) => !!(d && d.playabilityStatus && d.playabilityStatus.status === 'OK');

    // Primary: GM_xmlhttpRequest (can set custom User-Agent) with fast 5s timeout
    let gmData = null;
    try {
      const gmHeaders = { ...headers, 'User-Agent': client.userAgent, 'Origin': 'https://www.youtube.com', 'Referer': 'https://www.youtube.com/' };
      gmData = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'POST', url: apiUrl, headers: gmHeaders, data: body, responseType: 'text',
          onload: (r) => {
            if (r.status >= 200 && r.status < 300) {
              try { resolve(JSON.parse(r.response || r.responseText)); }
              catch (e) { reject(e); }
            } else {
              reject(new Error('HTTP ' + r.status));
            }
          },
          onerror: reject, ontimeout: () => reject(new Error('timeout')), timeout: 5000
        });
      });
    } catch (gmErr) { gmData = null; }

    // Handle non-OK playability responses (bot-gated or stale client):
    // was silently dropped - AdGuard's MV3 background fetch and Tampermonkey's
    // MV3 service worker treat User-Agent as a forbidden header, so the
    // request left with the browser UA and YouTube gated the client. Retry
    // the SAME client via same-origin page fetch (browser UA + visitor
    // header): verified 2026-09-02 that VISIONOS returns OK with direct
    // URLs and ANDROID returns itag 18 through this transport even while
    // the page session itself is bot-gated.
    if (!isPlayable(gmData)) {
      try {
        const fetchFn = (typeof origFetch === 'function') ? origFetch : window.fetch;
        const resp = await fetchFn(apiUrl, { method: 'POST', headers, body, credentials: 'include' });
        if (resp && resp.ok) {
          const data = await resp.json();
          if (isPlayable(data)) return data;
          if (!gmData) return data;
        }
      } catch (fetchErr) {}
    }
    if (gmData) return gmData;
    throw new Error('youtubei player request failed (GM and fetch)');
  }

  UVP.Extractors.extractYouTubeUrls = async function() {
    if (!UVP.Extractors.isYouTube()) return;
    const requestId = UVP.Extractors.getYtVideoId();
    const requestGeneration = ytRouteGeneration;
    const stillCurrentRequest = () => requestGeneration === ytRouteGeneration && requestId === UVP.Extractors.getYtVideoId();
    // Freshness short-circuit: skip client queries if current video formats are already cached
    if (UVP.Extractors.ytFormatsCurrent()) {
      if (ytPlayerData.isLive && UVP.Extractors.ytHasDurableLiveManifest()) return;
      try { await UVP.Extractors.ensureYtNDeciphered(requestGeneration); } catch (e) { if (DEBUG) console.warn('[UVP] YouTube n-sig decipher failed:', e); }
      const hasCleanVideo = [...ytFmtMap.values()].some(info =>
        info && !info.isHls && !info.isDash && (info.hasN === false || info.deciphered === true) &&
        !(info.mimeType && info.mimeType.indexOf('audio/') === 0));
      if (hasCleanVideo) return;
    }
    if (_ytExtracting && _ytExtractingId === requestId && _ytExtractingGeneration === requestGeneration) return _ytExtracting;
    const mine = (async () => {
      const stillCurrent = stillCurrentRequest;
      ytGateLog = [];
      const videoId = requestId;
      if (!videoId) return;

      // Tier 1: Instant In-Memory / Page Globals (0ms - 10ms)
      try {
        const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (w && w.ytInitialPlayerResponse && (!w.ytInitialPlayerResponse.videoDetails || w.ytInitialPlayerResponse.videoDetails.videoId === videoId)) {
          const pr = w.ytInitialPlayerResponse;
          if (pr && pr.playabilityStatus && pr.playabilityStatus.status !== 'OK') ytGateLog.push({ c: 'page', s: pr.playabilityStatus.status });
          if (pr.streamingData) UVP.Extractors.processYtStreamingData(pr.streamingData, pr.videoDetails);
          if (pr.assets && pr.assets.js) ytPlayerData.playerJsUrl = pr.assets.js;
        }
      } catch (e) {}

      // Check inline <script> tags for ytInitialPlayerResponse
      if (ytFmtMap.size === 0 && stillCurrent()) {
        const scripts = UVP.Utils.getInlineScripts();
        for (const script of scripts) {
          const text = script.textContent || '';
          const idx = text.indexOf('ytInitialPlayerResponse');
          if (idx === -1) continue;
          const eqIdx = text.indexOf('=', idx);
          if (eqIdx === -1) continue;
          const braceIdx = text.indexOf('{', eqIdx);
          if (braceIdx === -1) continue;
          const objText = UVP.Utils.matchBrace(text, braceIdx);
          if (!objText) continue;
          let data = null;
          try {
            // Current YouTube player responses are strict JSON. If a stale or
            // unusual inline assignment is not JSON, do not execute page-owned
            // source; the same-origin InnerTube tier below supplies strict JSON.
            try { data = JSON.parse(objText); } catch (jsonErr) { data = null; }
            if (data && data.videoDetails && data.videoDetails.videoId && data.videoDetails.videoId !== videoId) continue;
            UVP.Extractors.processYtStreamingData(data && data.streamingData, data && data.videoDetails);
            if (data && data.assets && data.assets.js) ytPlayerData.playerJsUrl = data.assets.js;
            if (ytFmtMap.size > 0) break;
          } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
        }
      }

      // Tier 2: Same-Origin WEB Client Fetch (~50ms fast-path)
      if (ytFmtMap.size === 0 && stillCurrent()) {
        try {
          const apiKey = getYtApiKey();
          const visitorData = getYtVisitorData();
          const apiUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`;
          const bodyObj = {
            context: { client: { clientName: 'WEB', clientVersion: getYtClientVersion() || '2.20260708.00.00', hl: 'en', timeZone: 'UTC', utcOffsetMinutes: 0 } },
            videoId
          };
          const sts = getYtSts();
          if (sts) bodyObj.playbackContext = { contentPlaybackContext: { signatureTimestamp: sts } };
          const body = JSON.stringify(bodyObj);
          const headers = { 'Content-Type': 'application/json' };
          if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;
          const fetchFn = (typeof origFetch === 'function') ? origFetch : window.fetch;
          const resp = await fetchFn(apiUrl, { method: 'POST', headers, body, credentials: 'include' });
          if (resp && resp.ok) {
            const data = await resp.json();
            if (data && data.playabilityStatus && data.playabilityStatus.status !== 'OK') ytGateLog.push({ c: 'WEB', s: data.playabilityStatus.status });
            if (data && data.streamingData) {
              UVP.Extractors.processYtStreamingData(data.streamingData, data.videoDetails);
              if (data.assets && data.assets.js) ytPlayerData.playerJsUrl = data.assets.js;
            }
          }
        } catch (e) {}
      }

      // Tier 3: InnerTube fallback walk. Live adaptive/SABR URLs are not a
      // completion signal: continue until a durable HLS/DASH manifest arrives.
      if ((ytFmtMap.size === 0 || UVP.Extractors.ytNeedsLiveManifestWalk()) && stillCurrent()) {
        for (const client of YT_CLIENTS) {
          try {
            const data = await fetchYtPlayerData(videoId, client);
            if (!stillCurrent()) return;
            if (data && data.playabilityStatus && data.playabilityStatus.status === 'OK') {
              const count = UVP.Extractors.processYtStreamingData(data.streamingData, data.videoDetails);
              if (count === 0) ytGateLog.push({ c: client.clientName, s: 'OK/0-urls' });
              if (count > 0) {
                if (data.assets && data.assets.js) ytPlayerData.playerJsUrl = data.assets.js;
                const hasMuxed = [...ytFmtMap.values()].some(info => info && (info.itag === 18 || info.itag === 22 || (info.height > 0 && info.audioSampleRate > 0)));
                if (ytPlayerData.isLive ? UVP.Extractors.ytHasDurableLiveManifest() : hasMuxed) break;
              }
            } else {
              const st = data && data.playabilityStatus ? data.playabilityStatus.status : 'NO-STATUS';
              ytGateLog.push({ c: client.clientName, s: st, r: ((data && data.playabilityStatus && data.playabilityStatus.reason) || '').slice(0, 60) });
            }
          } catch (e) { ytGateLog.push({ c: client.clientName, s: 'ERR', r: String((e && e.message) || e).slice(0, 60) }); if (DEBUG) console.warn('[UVP]', e); }
        }
      }

      // Fall back to page ytcfg player JS URL if response omits assets.js:
      // player JS URL from ytcfg so n-deciphering still has a source.
      if (stillCurrent() && !ytPlayerData.playerJsUrl) {
        try {
          const cfg = getYtcfg();
          const p = cfg && cfg.get('PLAYER_JS_URL');
          if (p) ytPlayerData.playerJsUrl = UVP.Utils.resolveSafeUrl(p, 'https://www.youtube.com/');
        } catch (e) {}
      }

      // Decipher the n-parameter challenge on captured googlevideo URLs
      if (stillCurrent() && [...capturedUrls].some(u => /googlevideo\.com/i.test(u) && /[?&]n=/.test(u))) {
        try { await UVP.Extractors.ensureYtNDeciphered(requestGeneration); } catch (e) { if (DEBUG) console.warn('[UVP] YouTube n-sig decipher failed:', e); }
      }
    })();
    _ytExtracting = mine;
    _ytExtractingId = requestId;
    _ytExtractingGeneration = requestGeneration;
    // Identity-guarded unlock: a superseded stale run must NOT clear the lock
    // now owned by the newer video's extraction.
    try { await mine; } finally { if (_ytExtracting === mine) { _ytExtracting = null; _ytExtractingId = null; _ytExtractingGeneration = -1; } }
  }

  // ==================== YOUTUBE FORMAT SELECTOR ====================
  // Unified format selector over videoId-keyed ytFmtMap (yt-dlp ranking model). Pure function.
  const ytIsAudio = (x) => !!(x && x.info && x.info.mimeType && x.info.mimeType.indexOf('audio/') === 0);
  const ytIsBad = (u, info) => !!(info && !ytDecipheredUrls.has(u) && (info.hasN === true || (info.hasN !== false && /[?&]n=/.test(u))));
  const ytVideoCodecRank = (mime) => {
    if (/avc1|avc3|h264/i.test(mime || '')) return 3; // broad hardware support
    if (/vp0?9|vp9/i.test(mime || '')) return 2;
    if (/av01|av1/i.test(mime || '')) return 1; // software decode is common on older devices
    return 0;
  };
  const ytAudioCodecRank = (mime) => {
    if (/mp4a|aac/i.test(mime || '')) return 3;
    if (/opus/i.test(mime || '')) return 2;
    if (/vorbis/i.test(mime || '')) return 1;
    return 0;
  };
  const ytPreferredLanguages = () => {
    const out = [];
    try {
      const langs = (navigator && Array.isArray(navigator.languages)) ? navigator.languages : [];
      for (const lang of langs) if (typeof lang === 'string' && lang && !out.includes(lang.toLowerCase())) out.push(lang.toLowerCase());
      const one = navigator && navigator.language;
      if (typeof one === 'string' && one && !out.includes(one.toLowerCase())) out.push(one.toLowerCase());
    } catch (e) {}
    return out;
  };
  const ytAudioTrackKey = (info) => info && info.audioTrackId ? 'track:' + info.audioTrackId : 'legacy';
  const ytLanguageRank = (info) => {
    const lang = String((info && info.audioLanguage) || '').toLowerCase();
    if (!lang) return 0;
    const prefs = ytPreferredLanguages();
    for (let i = 0; i < prefs.length; i++) {
      if (lang === prefs[i]) return 100 - i;
      if (lang.split('-')[0] === prefs[i].split('-')[0]) return 50 - i;
    }
    return 0;
  };
  const ytAudioTrackRank = (info) => {
    if (!info) return 0;
    if (info.audioIsDefault === true) return 10000;
    if (info.audioIsOriginal === true) return 5000 + ytLanguageRank(info);
    if (info.audioIsAutoDubbed !== true && info.audioIsDescriptive !== true) return 1000 + ytLanguageRank(info);
    return ytLanguageRank(info);
  };
  UVP.Extractors.selectYouTubeAudioTrack = function(entries) {
    const audio = (entries || []).filter(ytIsAudio);
    if (!audio.length) return [];
    const groups = new Map();
    for (const x of audio) {
      const key = ytAudioTrackKey(x.info);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(x);
    }
    // Trackless formats are legacy/single-language fallbacks. When YouTube
    // supplies explicit audioTrack metadata, never let the legacy bucket hide
    // a known default/original track merely because it lacks classification.
    const explicitGroups = [...groups.entries()].filter(([key]) => key !== 'legacy');
    const candidates = explicitGroups.length ? explicitGroups : [...groups.entries()];
    let best = null, bestRank = -Infinity, bestKey = '';
    for (const [key, list] of candidates) {
      const rank = Math.max(...list.map(x => ytAudioTrackRank(x.info)));
      if (!best || rank > bestRank || (rank === bestRank && key < bestKey)) { best = list; bestRank = rank; bestKey = key; }
    }
    return best || [];
  };
  const ytCompareAudioEntries = (a, b) => {
    const ar = ytAudioTrackRank(a.info), br = ytAudioTrackRank(b.info);
    if (ar !== br) return br - ar;
    const ac = ytAudioCodecRank(a.info.mimeType), bc = ytAudioCodecRank(b.info.mimeType);
    return (bc - ac) || ((b.info.bitrate || 0) - (a.info.bitrate || 0)) || String(a.u).localeCompare(String(b.u));
  };
  const ytCompareEntries = (a, b) => {
    const abad = ytIsBad(a.u, a.info) ? 1 : 0, bbad = ytIsBad(b.u, b.info) ? 1 : 0;
    if (abad !== bbad) return abad - bbad;
    const av = ytIsAudio(a) ? 0 : 1, bv = ytIsAudio(b) ? 0 : 1;
    if (av !== bv) return bv - av;
    if (ytIsAudio(a)) return ytCompareAudioEntries(a, b);
    const ah = a.info.height || 0, bh = b.info.height || 0;
    if (ah !== bh) return bh - ah;
    const af = a.info.fps || 0, bf = b.info.fps || 0;
    if (af !== bf) return bf - af;
    const ac = ytVideoCodecRank(a.info.mimeType), bc = ytVideoCodecRank(b.info.mimeType);
    return (bc - ac) || ((b.info.bitrate || 0) - (a.info.bitrate || 0));
  };
  UVP.Extractors.pickYouTubeFormats = function() {
    // Live streams: the tagged HLS manifest is the only durable URL —
    // googlevideo format URLs expire after the ~5s live window. hls.js plays
    // the manifest directly; live manifests carry their own muxed renditions.
    if (ytPlayerData.isLive) {
      // HLS remains the least-risk live route (native/hls.js); DASH is the
      // durable fallback when the current client returns no HLS manifest.
      for (const [u, info] of ytFmtMap) {
        if (info && info.isHls && info.isLive) return { video: u, audio: null, live: true, muxed: false };
      }
      for (const [u, info] of ytFmtMap) {
        if (info && info.isDash && info.isLive) return { video: u, audio: null, live: true, muxed: false };
      }
      return { video: null, audio: null, live: true, muxed: false };
    }
    const entries = [...ytFmtMap.entries()]
      .map(([u, info]) => ({ u, info: info || {} }))
      .filter(x => !x.info.isHls);
    // Allow VOD HLS manifest alone when direct adaptive formats are restricted:
    // VOD HLS manifest alone (all direct formats PO-gated); the !bestVideo
    // fallback below returns it. Falling through with zero entries still
    // yields {video:null} at the end.
    entries.sort(ytCompareEntries);
    const bestVideo = entries.find(x => !ytIsAudio(x) && !ytIsBad(x.u, x.info)) || entries.find(x => !ytIsAudio(x)) || null;
    const audioPool = UVP.Extractors.selectYouTubeAudioTrack(entries).sort(ytCompareAudioEntries);
    const bestAudio = audioPool.find(x => !ytIsBad(x.u, x.info)) || audioPool[0] || null;
    // VOD HLS fallback: plays via hls.js when direct streams are unavailable:
    // returns one alongside its direct formats) plays via hls.js with no PO
    // token and no n-decipher. Use it when no usable progressive/adaptive
    // entry exists (all PO-gated or undecipherable).
    if (!bestVideo) {
      for (const [u, info] of ytFmtMap) {
        if (info && info.isHls && !info.isLive) return { video: u, audio: null, live: false, muxed: false };
      }
    }
    const muxed = !!(bestVideo && (bestVideo.info.itag === 18 || bestVideo.info.itag === 22));
    return { video: bestVideo ? bestVideo.u : null, audio: muxed ? null : (bestAudio ? bestAudio.u : null), live: false, muxed };
  };


  // Thin wrapper for callers that want a single URL (SITES getUrl entry,
  // extractFreshUrl, quality-toggle). Publishes the paired audio onto
  // state.targetAudioUrl: the DASH branch reads it as the audio-pair
  // marker and the save/download paths use it for audio-only pairing.
  // pickYouTubeMuxedUrl selects the progressive fallback when DASH fails.
  UVP.Extractors.pickYouTubeMuxedUrl = function() {
    const isAudio = (info) => !!(info && info.mimeType && info.mimeType.indexOf('audio/') === 0);
    const isBad = (u, info) => !ytDecipheredUrls.has(u) && (info.hasN === true || (info.hasN !== false && /[?&]n=/.test(u)));
    let best = null;
    for (const [u, info] of ytFmtMap) {
      if (!info || info.isHls || isAudio(info) || isBad(u, info)) continue;
      const isProgressive = (info.itag === 18 || info.itag === 22 || (info.height > 0 && info.audioSampleRate > 0));
      if (!isProgressive) continue;
      if (!best || (info.height || 0) > (best.info.height || 0) || ((info.height || 0) === (best.info.height || 0) && (info.bitrate || 0) > (best.info.bitrate || 0))) best = { u, info };
    }
    return best ? best.u : null;
  };

  // Dedicated download format selector honoring user download quality preference:
  // - 'muxed' (default): 720p HD (fast-path progressive itag 22 if present, else adaptive 1080p/720p with client-side muxed sound)
  // - 'max': highest adaptive video stream (1080p/4K) paired with best audio stream
  // - 'lowest': 360p combined MP4 with native in-container audio
  UVP.Extractors.pickYouTubeDownloadUrl = function(quality) {
    const q = quality || UVP.Utils.getDownloadQuality();
    if (ytPlayerData.isLive) {
      for (const [u, info] of ytFmtMap) {
        if (info && info.isHls) return { video: u, audio: null, live: true, muxed: false };
      }
    }
    if (q === 'lowest') {
      let lowest = null;
      for (const [u, info] of ytFmtMap) {
        if (!info || info.isHls || (info.mimeType && info.mimeType.startsWith('audio/'))) continue;
        if (info.itag !== 18 && info.itag !== 22 && !(info.height > 0 && info.audioSampleRate > 0)) continue;
        if (!lowest || (info.height || 0) < (lowest.info.height || 0)) lowest = { u, info };
      }
      if (lowest) return { video: lowest.u, audio: null, muxed: true };
    } else if (q === 'muxed') {
      // Fast path: Only accept itag 22 (720p HD) for progressive single-stream download
      for (const [u, info] of ytFmtMap) {
        if (info && info.itag === 22 && !ytIsBad(u, info)) {
          return { video: u, audio: null, muxed: true };
        }
      }
      // If itag 22 is absent, fall through to adaptive high-res pick so we NEVER degrade to 360p by default!
    }
    const pick = UVP.Extractors.pickYouTubeFormats();
    return { video: pick.video, audio: pick.audio, muxed: pick.muxed };
  };

  UVP.Extractors.pickYouTubeUrl = function() {
    const pick = UVP.Extractors.pickYouTubeFormats();
    state.targetAudioUrl = pick.audio;
    return pick.video;
  };

  // Formats per-client playability summary for diagnostics.
  UVP.Extractors.ytGateSummary = function() {
    if (!ytGateLog.length) return null;
    return ytGateLog.map(g => g.c + ':' + g.s).join(' | ');
  };

  UVP.Extractors.ytFmtInfo = function(url) { return ytFmtMap.get(url) || null; };

  // ==================== YOUTUBE N-PARAM DECIPHER (yt-dlp 2025.06.09 port) ====================
  // googlevideo URLs carry a challenge `n` parameter; requests with an
  // undeciphered n are throttled/403'd. This ports yt-dlp's
  // _extract_n_function_name / _extract_n_function_code / _fixup_n_function_code
  // to build the n-transform from the player JS, then rewrites captured URLs.
  const ytNsigCache = { playerUrl: null, func: null };

  // Same-origin page fetch for base.js before falling back to GM transport.
  // same-origin to www.youtube.com, so a plain fetch has no CORS problem —
  // and it sidesteps AdGuard's GM_xmlhttpRequest shim, which truncates /
  // corrupts large string responses (wrong-shape quirk, see ADGUARD-INSTALL
  // §3/§6). A truncated player JS made getYtNDecipher throw, every URL kept
  // its undeciphered n-param, and YouTube throttled ALL googlevideo traffic
  // to ~50KB/s — the "laggy playback" root cause. GM remains the fallback
  // (and the only path off-YouTube, which cannot happen in practice).
  UVP.Extractors.fetchYtPlayerJs = async function(playerUrl) {
    let jsUrl = playerUrl;
    if (!/^https?:\/\//i.test(jsUrl)) jsUrl = 'https://www.youtube.com' + (jsUrl.startsWith('/') ? '' : '/') + jsUrl;
    if (UVP.Extractors.isYouTube()) {
      try {
        const fetchFn = (typeof origFetch === 'function') ? origFetch : window.fetch;
        const res = await fetchFn(jsUrl, { credentials: 'same-origin' });
        if (res && res.ok) {
          const txt = await res.text();
          if (txt && txt.length > 10000) return txt;
        }
      } catch (e) { if (DEBUG) console.warn('[UVP] Page fetch for player JS failed, falling back to GM:', e); }
    }
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') { reject(new Error('GM_xmlhttpRequest unavailable')); return; }
      GM_xmlhttpRequest({
        method: 'GET', url: jsUrl, timeout: 20000,
        onload: (r) => { if (r.status >= 200 && r.status < 300) resolve(r.responseText || ''); else reject(new Error('HTTP ' + r.status)); },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout'))
      });
    });
  };

  UVP.Extractors.interpretYtGlobalVar = function(jsCode) {
    const re = new RegExp(
      '([\\\'"])use\\s+strict\\1;\\s*var\\s+([a-zA-Z0-9_$]+)\\s*=\\s*' +
      '((?:([\\\'"])(?:(?!\\4).|\\\\.)+\\4\\.split\\(([\\\'"])(?:(?!\\5).)+\\5\\))' +
      '|(\\[\\s*(?:([\\\'"])(?:(?!\\7).|\\\\.)*\\7\\s*,?\\s*)+\\]))[;,]'
    );
    const m = re.exec(jsCode);
    if (!m) return null;
    let list = null;
    try { list = UVP.Utils.safeNewFunction('return (' + m[3] + ')')(); } catch (e) { return null; }
    if (!Array.isArray(list)) return null;
    return { name: m[2], list };
  };

  // ==================== YOUTUBE N-SOLVER ====================

  UVP.Utils.scanJsTopStatements = function(src, s0, e0, onTopStatementEnd) {
    const KW_BEFORE_REGEX = { return: 1, typeof: 1, instanceof: 1, in: 1, of: 1, new: 1, delete: 1, void: 1, throw: 1, case: 1, do: 1, else: 1, yield: 1, await: 1 };
    let i = s0, depth = 0, stmtStart = s0, lastCh = '', lastWord = '';
    const readWord = (j) => { const m = /^[a-zA-Z0-9_$]+/.exec(src.slice(j, j + 12)); return m ? m[0] : ''; };
    // division-vs-regex: a '/' starts a regex unless the previous token is
    // an operand end (identifier/number/')'/']') — the standard heuristic.
    const regexAllowed = () => {
      if (!lastCh) return true;
      if (/[a-zA-Z0-9_$]/.test(lastCh)) return lastWord ? !!KW_BEFORE_REGEX[lastWord] : true;
      return '([{=,:;&|?<!+-*%~^<>'.indexOf(lastCh) >= 0 || lastCh === '}';
    };
    // Statement boundary parser: splits statements at semicolons or closing braces.
    // (i, i) so the closing brace is INCLUDED (the original single-arg form
    // treated the '}' as a separator too, silently dropping it from function
    // declarations — assignment statements escaped via their '};' tail, which
    // is why the live player compiled but synthetic fixtures broke).
    const endStmt = (endEx, nextStart) => { if (endEx > stmtStart) onTopStatementEnd(stmtStart, endEx); stmtStart = nextStart; };
    while (i < e0) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < e0 && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i += 2; while (i < e0 && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
      if (c === '"' || c === "'") {
        i++;
        while (i < e0) { if (src[i] === '\\') i += 2; else if (src[i] === c) { i++; break; } else i++; }
        lastCh = '"'; lastWord = '';
        continue;
      }
      if (c === '`') { // template literal — ${} expressions may nest strings/braces
        i++;
        while (i < e0) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '`') { i++; break; }
          if (src[i] === '$' && src[i + 1] === '{') {
            i += 2; let d = 1;
            while (i < e0 && d > 0) {
              const tc = src[i];
              if (tc === '"' || tc === "'") { i++; while (i < e0) { if (src[i] === '\\') i += 2; else if (src[i] === tc) { i++; break; } else i++; } continue; }
              if (tc === '{') d++;
              else if (tc === '}') d--;
              i++;
            }
            continue;
          }
          i++;
        }
        lastCh = '"'; lastWord = '';
        continue;
      }
      if (c === '/' && regexAllowed()) {
        i++; let inClass = false;
        while (i < e0) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) { i++; break; }
          else if (src[i] === '\n') break; // not a regex after all — defensive bail
          i++;
        }
        while (i < e0 && /[a-z]/i.test(src[i])) i++; // flags
        // gemini G4: lastCh must be '/' (a regex literal is an operand END —
        // the next '/' can only be division). 'r' is an identifier character,
        // so regexAllowed() saw "identifier with no lastWord" => true and a
        // following division slash was misread as a regex start, swallowing
        // everything up to the next slash/newline and desyncing spans.
        lastCh = '/'; lastWord = '';
        continue;
      }
      if (c === '{') { depth++; i++; lastCh = '{'; lastWord = ''; continue; }
      if (c === '}') {
        depth--; i++; lastCh = '}'; lastWord = '';
        if (depth === 0) {
          const head = src.slice(stmtStart, i).replace(/^[;\s]+/, '');
          // gemini G6: async function declarations are unsemicoloned blocks
          // too — without the head match their span swallowed the following
          // statement (including top-level CALLS that the preprocessing
          // exists to drop).
          if (/^(async\s+function\b|function\b|class\b|if\b|for\b|while\b|switch\b|try\b|do\b|else\b)/.test(head)) endStmt(i, i);
        }
        continue;
      }
      if (c === '(' || c === '[') { depth++; i++; lastCh = c; lastWord = ''; continue; }
      if (c === ')' || c === ']') { depth--; i++; lastCh = c; lastWord = ''; continue; }
      if (c === ';' && depth === 0) { endStmt(i, i + 1); i++; lastCh = ';'; lastWord = ''; continue; }
      if (/[a-zA-Z0-9_$]/.test(c)) { const w = readWord(i); lastWord = w; lastCh = w.charAt(0); i += w.length; continue; }
      lastCh = c; lastWord = '';
      i++;
    }
    if (stmtStart < e0) onTopStatementEnd(stmtStart, e0);
  };
  UVP.Utils.splitJsTopStatements = function(src, s0, e0) {
    const spans = [];
    UVP.Utils.scanJsTopStatements(src, s0, e0, (s, e) => spans.push({ s, e }));
    return spans;
  };
  // Regex/template-aware brace matcher (unlike matchBrace, which is for
  // plain object literals — a regex literal containing { or } desyncs it).
  UVP.Utils.matchBraceRegexAware = function(src, openIdx) {
    let i = openIdx, depth = 0, lastCh = '', lastWord = '';
    const KW_BEFORE_REGEX = { return: 1, typeof: 1, instanceof: 1, in: 1, of: 1, new: 1, delete: 1, void: 1, throw: 1, case: 1, do: 1, else: 1, yield: 1, await: 1 };
    const readWord = (j) => { const m = /^[a-zA-Z0-9_$]+/.exec(src.slice(j, j + 12)); return m ? m[0] : ''; };
    const regexAllowed = () => {
      if (!lastCh) return true;
      if (/[a-zA-Z0-9_$]/.test(lastCh)) return lastWord ? !!KW_BEFORE_REGEX[lastWord] : true;
      return '([{=,:;&|?<!+-*%~^<>'.indexOf(lastCh) >= 0 || lastCh === '}';
    };
    while (i < src.length) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
      if (c === '"' || c === "'") { i++; while (i < src.length) { if (src[i] === '\\') i += 2; else if (src[i] === c) { i++; break; } else i++; } lastCh = '"'; lastWord = ''; continue; }
      if (c === '`') {
        i++;
        while (i < src.length) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '`') { i++; break; }
          if (src[i] === '$' && src[i + 1] === '{') { i += 2; let d = 1; while (i < src.length && d > 0) { const tc = src[i]; if (tc === '{') d++; else if (tc === '}') d--; i++; } continue; }
          i++;
        }
        lastCh = '"'; lastWord = '';
        continue;
      }
      if (c === '/' && regexAllowed()) {
        i++; let inClass = false;
        while (i < src.length) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          else if (src[i] === '/' && !inClass) { i++; break; }
          else if (src[i] === '\n') break;
          i++;
        }
        while (i < src.length && /[a-z]/i.test(src[i])) i++;
        lastCh = '/'; lastWord = ''; // gemini G4: '/' = operand end, next '/' is division ('r' was misread as an identifier)
        continue;
      }
      if (c === '{') { depth++; i++; lastCh = '{'; lastWord = ''; continue; }
      if (c === '}') { depth--; i++; lastCh = '}'; lastWord = ''; if (depth === 0) return i - 1; continue; }
      if (/[a-zA-Z0-9_$]/.test(c)) { const w = readWord(i); lastWord = w; lastCh = w.charAt(0); i += w.length; continue; }
      lastCh = c; lastWord = '';
      i++;
    }
    return -1;
  };

  // Preprocess the player for eval (yt-dlp modifyPlayer, textual port):
  // unwrap every top-level IIFE module, keep declarations/assignments
  // (drop top-level calls), drop `var window=this` (yt-dlp splices it) and
  // the inert 'use strict' directive (it sat AFTER a statement in the
  // original, so the original IIFE was sloppy — staying sloppy also lets
  // `eval` remain a shadow parameter), and collect the alr-yes builder
  // candidates (marker must be a DIRECT statement of the function body —
  // nested-marker functions are not the builder).
  UVP.Extractors.preprocessYtPlayerForEval = function(src) {
    if (!src || src.length < 1000) return null;
    const MARKER_RE = /^\s*([a-zA-Z0-9_$]+)\s*\.\s*set\(\s*["']alr["']\s*,\s*["']yes["']\s*\)\s*;?\s*$/;
    const fileSpans = UVP.Utils.splitJsTopStatements(src, 0, src.length);
    const moduleBodies = [];
    for (const sp of fileSpans) {
      const t = src.slice(sp.s, sp.e).trim();
      if (/^\(function\s*\([a-zA-Z0-9_$]*\)\s*\{/.test(t)) {
        // openAbs must be resolved against the RAW span: the trimmed text's
        // offsets shift by any leading whitespace (the live player's IIFE
        // starts directly after the previous ';' so trim is a no-op there,
        // but a newline before it desynced the body scan by one char —
        // everything landed inside the opening brace and no top-level
        // statement was found). An IIFE head contains no '{', so the first
        // '{' at/after the span start IS the body opener.
        const openAbs = src.indexOf('{', sp.s);
        const closeAbs = UVP.Utils.matchBraceRegexAware(src, openAbs);
        if (closeAbs > 0) moduleBodies.push([openAbs + 1, closeAbs]);
      }
    }
    let spans = [];
    for (const mb of moduleBodies) spans = spans.concat(UVP.Utils.splitJsTopStatements(src, mb[0], mb[1]));
    const kept = [];
    const candidates = [];
    for (const sp of spans) {
      const text = src.slice(sp.s, sp.e).trim();
      if (!text) continue;
      if (/^var\s+window\s*=\s*this\s*;?$/.test(text)) continue;
      if (/^["'](use strict|use asm)["'];?$/.test(text)) continue;
      const isDecl = /^(var|let|const|function|class|async\s+function)\b/.test(text);
      // gemini G5: bracketed member assignments (obj[prop]=val — 23 sites in
      // the live player) must be kept; the dot-only shape silently dropped
      // them, so their state never got defined during eval.
      const isAssign = /^([a-zA-Z0-9_$]+(?:\.[a-zA-Z0-9_$]+|\[[^\]]+\])*)\s*=[^=]/.test(text) && !/^([a-zA-Z0-9_$]+(?:\.[a-zA-Z0-9_$]+|\[[^\]]+\])*)\s*=>/.test(text);
      const isLiteral = /^(["'`]|\d|true\b|false\b|null\b|undefined\b)/.test(text);
      if (!(isDecl || isAssign || isLiteral)) continue; // dropped: top-level calls (yt-dlp keeps exactly decls/assignments/literals)
      kept.push(text.charAt(text.length - 1) === ';' || text.charAt(text.length - 1) === '}' ? text : text + ';');
      // candidate: sync function assignment/declaration whose DIRECT body holds the marker
      let m = /^([a-zA-Z0-9_$]+(?:\.[a-zA-Z0-9_$]+)*)\s*=\s*function\s*\([^)]*\)\s*\{/.exec(text);
      let nameExpr = m ? m[1] : null;
      if (!m) {
        m = /^function\s+([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/.exec(text);
        if (m) nameExpr = m[1];
      }
      if (!nameExpr) continue;
      const openIdx = text.indexOf(m[0]) + m[0].length - 1;
      let d = 0, j = openIdx;
      while (j < text.length) { // plain brace match within the statement text
        const ch = text.charAt(j);
        if (ch === '"' || ch === "'" || ch === '`') { const q = ch; j++; while (j < text.length) { if (text.charAt(j) === '\\') j += 2; else if (text.charAt(j) === q) { j++; break; } else j++; } continue; }
        if (ch === '{') d++;
        else if (ch === '}') { d--; if (d === 0) break; }
        j++;
      }
      if (j >= text.length) continue;
      const inner = UVP.Utils.splitJsTopStatements(text, openIdx + 1, j);
      for (const st of inner) {
        if (MARKER_RE.test(text.slice(st.s, st.e))) { candidates.push(nameExpr); break; }
      }
    }
    return { kept, candidates };
  };

  // Deep inert stub: every property is the stub, every call returns it, so
  // the eval'd player boot code can touch no real DOM/network/timer/manager
  // API. Standard builtins (Math/JSON/URL/TextDecoder/…) stay real — the
  // nsig transform is pure string/array math over real primitives.
  UVP.Utils.makeInertStub = function() {
    const fn = function inert() { return proxy; };
    const proxy = new Proxy(fn, {
      get(t, k) {
        if (k === Symbol.toPrimitive) return () => '';
        if (k === Symbol.iterator) return function* () {};
        if (k === 'toString') return () => '';
        if (k === 'valueOf') return () => '';
        if (k === 'length') return 0;
        if (typeof k === 'symbol') return undefined;
        return proxy;
      },
      apply() { return proxy; },
      construct() { return proxy; },
      set() { return true; },
      has() { return true; },
      deleteProperty() { return true; },
      getPrototypeOf() { return null; }
    });
    return proxy;
  };

  // Globals shadowed inside the eval'd player. Everything DOM/network/timer
  // is an inert stub; userscript-manager privileged APIs are undefined
  // (this shadows Tampermonkey's closure bindings too — a Function's own
  // params win over the userscript wrapper's scope); TextDecoder/Encoder/
  // atob/btoa/Proxy/Reflect/WebAssembly pass through real (transform
  // dependencies). `eval` is only a legal parameter name in sloppy mode —
  // which matches the original IIFE (its 'use strict' sat after a
  // statement and was inert).
  UVP.Extractors.YT_NSOLVER_SHADOWS = ['document', 'navigator', 'location', 'XMLHttpRequest', 'fetch', 'setInterval', 'setTimeout', 'clearInterval', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'WebSocket', 'EventSource', 'performance', 'screen', 'history', 'open', 'alert', 'prompt', 'confirm', 'self', 'window', 'globalThis', 'top', 'parent', 'frames', 'eval', 'Function', 'Image', 'indexedDB', 'Notification', 'Worker', 'SharedWorker', 'BroadcastChannel', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'CustomEvent', 'Event', 'addEventListener', 'removeEventListener', 'dispatchEvent', 'onerror', 'onload', 'onunload', 'onbeforeunload', 'atob', 'btoa', 'TextDecoder', 'TextEncoder', 'WebAssembly', 'Proxy', 'Reflect', 'GM', 'GM_xmlhttpRequest', 'GM_download', 'GM_getValue', 'GM_setValue', 'GM_registerMenuCommand', 'GM_info', 'unsafeWindow'];

  UVP.Extractors.makeYtNSolverForBuilder = function(F) {
    return function (n) {
      const url = F('https://youtube.com/watch?v=yt-dlp-wins', 's', undefined);
      url.set('n', n);
      try {
        const proto = Object.getPrototypeOf(url);
        const keys = Object.keys(proto).concat(Object.getOwnPropertyNames(proto));
        for (const key of keys) {
          if (key !== 'constructor' && key !== 'set' && key !== 'get' && key !== 'clone') { try { url[key](); } catch (e) {} break; }
        }
      } catch (e) {}
      const outN = url.get('n');
      return (outN === null || outN === undefined) ? null : String(outN);
    };
  };

  UVP.Extractors.buildYtNSolverFromPlayerJs = function(jsCode) {
    try {
      const pp = UVP.Extractors.preprocessYtPlayerForEval(jsCode);
      return pp ? UVP.Extractors.evalYtNSolverPreprocessed(pp) : null;
    } catch (e) { if (DEBUG) console.warn('[UVP] n-solver preprocess failed:', e && e.message); return null; }
  };
  UVP.Extractors.evalYtNSolverPreprocessed = function(pp) {
    if (!pp || !pp.candidates.length || !pp.kept.length) return null;
    const inert = UVP.Utils.makeInertStub();
    const shadows = UVP.Extractors.YT_NSOLVER_SHADOWS;
    const shadowVals = shadows.map((n) => {
      if (n === 'GM' || n.indexOf('GM_') === 0 || n === 'unsafeWindow') return undefined;
      if (n === 'TextDecoder' || n === 'TextEncoder' || n === 'atob' || n === 'btoa' || n === 'Proxy' || n === 'Reflect' || n === 'WebAssembly') {
        return (typeof globalThis !== 'undefined' && globalThis[n]) || undefined;
      }
      return inert;
    });
    const out = { C: [] };
    // one try/catch per statement: a statement whose dependency lived in a
    // dropped call skips instead of killing every definition after it
    // (var hoisting still declares it — later refs fail soft).
    const isolated = pp.kept.map((t) => 'try{' + t + '}catch(_u){}').join('\n');
    const harvest = pp.candidates.map((c) => '_uvpOut.C.push(' + c + ')').join(';');
    const factory = UVP.Utils.safeNewFunction('g', '_uvpOut', ...shadows, isolated + '\n;' + harvest + ';');
    factory({}, out, ...shadowVals);
    for (const F of out.C) {
      if (typeof F !== 'function') continue;
      const solver = UVP.Extractors.makeYtNSolverForBuilder(F);
      let ok = true;
      try {
        const p1 = solver('abc123');
        if (typeof p1 !== 'string' || p1 === 'abc123' || p1.indexOf('enhanced_except_') === 0) ok = false;
      } catch (e) { ok = false; }
      if (ok) {
        try {
          const p2 = solver('ZagXe2QzOnFj7mP'); // full-length challenge shape
          if (typeof p2 !== 'string' || !p2.length || p2 === 'ZagXe2QzOnFj7mP' || p2.indexOf('enhanced_except_') === 0) ok = false;
        } catch (e) { ok = false; }
      }
      if (ok) return solver;
    }
    return null;
  };

  // Port of yt-dlp _extract_n_function_name.
  UVP.Extractors.extractYtNFunctionName = function(jsCode) {
    // Fast path: the global array holds a '...-_w8_' marker string; the nsig
    // body returns <var>[i] + <arg>. yt-dlp reverse-scans the player JS from
    // that point for the (possibly reversed) function definition.
    const gv = UVP.Extractors.interpretYtGlobalVar(jsCode);
    if (gv) {
      const idx = gv.list.findIndex(v => typeof v === 'string' && /-_w8_$/.test(v));
      if (idx >= 0) {
        const esc = gv.name.replace(/\$/g, '\\$');
        const fwd = new RegExp('\\{\\s*return\\s+' + esc + '\\[' + idx + '\\]\\s*\\+\\s*([a-zA-Z0-9_$]+)\\s*\\}').exec(jsCode);
        if (fwd) {
          const argRev = fwd[1].split('').reverse().join('');
          const reversed = jsCode.slice(0, fwd.index + fwd[0].length).split('').reverse().join('');
          const back = new RegExp('\\{\\s*\\)' + argRev.replace(/\$/g, '\\$') + '\\(\\s*(?:([a-zA-Z0-9_$]+)\\s*noitcnuf\\s*|noitcnuf\\s*=\\s*([a-zA-Z0-9_$]+)(?:\\s+rav)?)[;\\n]').exec(reversed);
          if (back) {
            const name = (back[1] || back[2]).split('').reverse().join('');
            if (name) return { name };
          }
        }
      }
    }
    // Main patterns (yt-dlp). JS regex lacks conditionals, so Python's
    // (?(var)...set(...,(?P=var))) tail is emulated with two ordered patterns:
    // A/B (strict .get("n") / fromCharCode / "nn" call sites) are tried first;
    // the loose var-assignment branch is only accepted when followed by
    // ,<ns>.set("n"|"nn"|x,<sameVar>) — exactly the Python conditional.
    const main = /(?:\.get\("n"\)\)&&\(b=|(?:b=String\.fromCharCode\(110\)|([a-zA-Z0-9_$.]+)&&\(b="nn"\[\+\1\])(?:,[a-zA-Z0-9_$]+\(a\))?,c=a\.(?:get\(b\)|[a-zA-Z0-9_$]+\[b\]\|\|null)\)&&\(c=)([a-zA-Z0-9_$]+)(?:\[(\d+)\])?\([a-zA-Z]\)/.exec(jsCode);
    // Perf: the loose var-assignment scan is a full-file regex — skip it when
    // a strict A/B pattern already matched.
    const mainVar = main ? null : /\b([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+)(?:\[(\d+)\])?\([a-zA-Z]\),[a-zA-Z0-9_$]+\.set\((?:"n+"|[a-zA-Z0-9_$]+),\1\)/.exec(jsCode);
    const chosen = main || mainVar;
    if (chosen) {
      const name = chosen[2];
      const idx = chosen[3] ? parseInt(chosen[3]) : null;
      if (idx === null) return { name };
      // The captured name is an array variable; resolve element idx to the
      // actual n-function name (yt-dlp: json.loads(var <name> = [...])[idx]).
      // Minified players may hold either quoted names ["a","b"] or bare
      // identifiers [fyn] (BNE[0](N) → fyn); resolve both.
      const arrRe = new RegExp('var\\s+' + name.replace(/\$/g, '\\$') + '\\s*=\\s*(\\[([^\\[\\]]*)\\])\\s*[,;]');
      const arrM = arrRe.exec(jsCode);
      if (arrM) {
        const elems = arrM[2].split(',');
        const el = (elems[idx] || '').trim();
        const elM = el.match(/^(?:"([^"]*)"|'([^']*)'|([a-zA-Z0-9_$]+))$/);
        if (elM) {
          const nm = elM[1] || elM[2] || elM[3];
          if (nm) {
            // Bare identifier: confirm it actually names a defined function.
            if (!elM[1] && !elM[2]) {
              const defRe = new RegExp('(?:function\\s+' + nm.replace(/\$/g, '\\$') + '\\s*\\(|\\b' + nm.replace(/\$/g, '\\$') + '\\s*=\\s*function)');
              if (!defRe.test(jsCode)) return { name: null };
            }
            return { name: nm };
          }
        }
      }
      return { name: null };
    }
    // Generic fallback: a function whose body returns <marker>_w8_ + <arg>.
    const generic = /;\s*([a-zA-Z0-9_$]+)\s*=\s*function\([a-zA-Z0-9_$]+\)\s*\{(?:(?!};)[\s\S])+?return\s*(["'])[\w-]+_w8_\2\s*\+\s*[a-zA-Z0-9_$]+/.exec(jsCode);
    if (generic) return { name: generic[1] };
    return null;
  };

  // Port of yt-dlp JSInterpreter.extract_function_code (brace-matched body).
  UVP.Extractors.extractYtNFunctionCode = function(jsCode, funcName) {
    if (!funcName) return null;
    const esc = funcName.replace(/\$/g, '\\$');
    const re = new RegExp('(?:function\\s+' + esc + '\\s*\\(|\\b' + esc + '\\s*=\\s*function\\s*\\()([^)]*)\\)\\s*\\{');
    const m = re.exec(jsCode);
    if (!m) return null;
    const argNames = m[1].split(',').map(s => s.trim()).filter(Boolean);
    const bodyOpen = m.index + m[0].length - 1; // index of the opening '{'
    const body = UVP.Utils.matchBrace(jsCode, bodyOpen);
    if (!body) return null;
    const kwIdx = jsCode.indexOf('function', m.index);
    if (kwIdx === -1 || kwIdx >= bodyOpen) return null;
    // Slice from the `function` keyword so the code is a valid expression.
    return { argNames, funcExpr: jsCode.slice(kwIdx, bodyOpen + body.length) };
  };

  // Port of yt-dlp _fixup_n_function_code: strip the
  // `;if (typeof x === 'undefined') return <arg0>;` workaround statements.
  UVP.Extractors.fixupYtNFunctionCode = function(funcExpr, argNames, gv) {
    if (!argNames || !argNames.length) return funcExpr;
    const arg0 = argNames[0].replace(/\$/g, '\\$');
    let undefPart = '\\d+';
    if (gv && Array.isArray(gv.list)) {
      const undefIdx = gv.list.indexOf('undefined');
      if (undefIdx >= 0) undefPart = gv.name.replace(/\$/g, '\\$') + '\\[' + undefIdx + '\\]';
    }
    const guardRe = new RegExp(';\\s*if\\s*\\(\\s*typeof\\s+[a-zA-Z0-9_$]+\\s*===?\\s*(?:([\'"])undefined\\1|' + undefPart + ')\\s*\\)\\s*return\\s+' + arg0 + '\\s*;', 'g');
    return funcExpr.replace(guardRe, ';');
  };

  function buildYtNFunction(prepend, funcExpr) {
    try {
      const shadow = 'var GM_xmlhttpRequest=undefined,GM_download=undefined,GM_getValue=undefined,GM_setValue=undefined,GM_registerMenuCommand=undefined,GM_info=undefined,unsafeWindow=undefined;';
      const factory = UVP.Utils.safeNewFunction(shadow + (prepend ? prepend + '\n' : '') + 'return (' + funcExpr + ');');
      const fn = factory();
      return (typeof fn === 'function') ? fn : null;
    } catch (e) { if (DEBUG) console.warn('[UVP] n-func eval failed:', e); return null; }
  }

  // Fetch (or restore from cache) the callable n-transform for a player URL.
  UVP.Extractors.getYtNDecipher = async function(expectedGeneration) {
    const generation = (typeof expectedGeneration === 'number') ? expectedGeneration : ytRouteGeneration;
    const playerUrl = ytPlayerData.playerJsUrl;
    const stillCurrent = () => generation === ytRouteGeneration && playerUrl === ytPlayerData.playerJsUrl;
    if (!playerUrl) return null;
    if (ytNsigCache.playerUrl === playerUrl && ytNsigCache.func) return ytNsigCache.func;
    // Preprocessed AST cache: caches extracted decipher function across navigations.
    // ~400ms tokenize. Restores re-run the full eval + sanity probes
    // (sessionStorage is site-writable on its own origin — never trusted
    // blindly, same posture as the v1 funcExpr cache below).
    const cacheKeyV2 = 'uvp-yt-nsig-v2';
    try {
      const cached2 = sessionStorage.getItem(cacheKeyV2);
      if (cached2) {
        const rec2 = JSON.parse(cached2);
        if (rec2 && rec2.playerUrl === playerUrl && Array.isArray(rec2.names) && Array.isArray(rec2.kept)) {
          const solver2 = UVP.Extractors.evalYtNSolverPreprocessed({ kept: rec2.kept, candidates: rec2.names });
          if (solver2) {
            let probe2 = null;
            try { probe2 = solver2('abc123'); } catch (e) {}
            if (typeof probe2 === 'string' && !probe2.endsWith('abc123') && !probe2.startsWith('enhanced_except_') && stillCurrent()) {
              ytNsigCache.playerUrl = playerUrl; ytNsigCache.func = solver2;
              return solver2;
            }
          }
          try { sessionStorage.removeItem(cacheKeyV2); } catch (e) {} // corrupted/tampered — discard
        }
      }
    } catch (e) {}
    const cacheKey = 'uvp-yt-nsig';
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const rec = JSON.parse(cached);
        if (rec && rec.playerUrl === playerUrl && rec.funcExpr) {
          const fn = buildYtNFunction(rec.prepend || '', rec.funcExpr);
          if (fn) {
            let probeOut = null;
            try { probeOut = fn('abc123'); } catch (e) {}
            if (typeof probeOut === 'string' && !probeOut.endsWith('abc123') && !probeOut.startsWith('enhanced_except_')) {
              ytNsigCache.playerUrl = playerUrl; ytNsigCache.func = fn; return fn;
            }
            if (DEBUG) console.warn('[UVP] Cached n-transform failed the sanity probe - discarding cache entry');
            try { sessionStorage.removeItem(cacheKey); } catch (e) {}
          }
        }
      }
    } catch (e) {}
    const jsCode = await UVP.Extractors.fetchYtPlayerJs(playerUrl);
    if (!stillCurrent()) return null;
    if (!jsCode) throw new Error('empty player JS');
    // Structural marker extraction and preprocessed evaluation (mirrors yt-dlp).
    // below are dead on 2026-06+ players: no fromCharCode(110), no "nn"[+]).
    try {
      const pp = UVP.Extractors.preprocessYtPlayerForEval(jsCode);
      if (pp && pp.candidates.length) {
        const solver = UVP.Extractors.evalYtNSolverPreprocessed(pp);
        if (solver) {
          ytNsigCache.playerUrl = playerUrl; ytNsigCache.func = solver;
          try { sessionStorage.setItem(cacheKeyV2, JSON.stringify({ playerUrl, names: pp.candidates, kept: pp.kept })); } catch (e) {}
          console.log('[UVP] n-solver built via structural method (yt-dlp current methodology)');
          return solver;
        }
      }
    } catch (e) { if (DEBUG) console.warn('[UVP] structural n-solver path failed, falling back to legacy patterns:', e && e.message); }
    const nameInfo = UVP.Extractors.extractYtNFunctionName(jsCode);
    if (!nameInfo || !nameInfo.name) throw new Error('n solver not found (structural + legacy patterns both failed)');
    const extracted = UVP.Extractors.extractYtNFunctionCode(jsCode, nameInfo.name);
    if (!extracted) throw new Error('n function code not found');
    const gv = UVP.Extractors.interpretYtGlobalVar(jsCode);
    // yt-dlp fixup: declare the global array the nsig body references, then
    // strip the typeof guard statements.
    const prepend = (gv && Array.isArray(gv.list)) ? 'var ' + gv.name + '=' + JSON.stringify(gv.list) + ';' : '';
    const funcExpr = UVP.Extractors.fixupYtNFunctionCode(extracted.funcExpr, extracted.argNames, gv);
    const fn = buildYtNFunction(prepend, funcExpr);
    if (!fn) throw new Error('n function eval failed');
    // Sanity probe (yt-dlp rejects 'enhanced_except_…' outputs and echo).
    const probeIn = 'abc123';
    const probeOut = fn(probeIn);
    if (typeof probeOut !== 'string' || probeOut.endsWith(probeIn) || probeOut.startsWith('enhanced_except_')) {
      throw new Error('n-transform probe failed: ' + String(probeOut).slice(0, 32));
    }
    ytNsigCache.playerUrl = playerUrl; ytNsigCache.func = fn;
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ playerUrl, prepend, funcExpr })); } catch (e) {}
    return fn;
  };

  // Rewrite every googlevideo URL (captured + adaptive format map) that still has an undeciphered n.
  UVP.Extractors.decipherYtUrlsWithNFn = function(nFn) {
    let fixed = 0;
    const pool = new Set([...capturedUrls, ...ytFmtMap.keys()]);
    for (const u of pool) {
      if (!/googlevideo\.com/i.test(u) || !/[?&]n=/.test(u) || ytDecipheredUrls.has(u)) continue; // Set guard: deciphered URLs still carry n=
      try {
        const url = new URL(u);
        const raw = url.searchParams.get('n');
        if (!raw) continue;
        const dec = nFn(raw);
        if (typeof dec !== 'string' || !dec.length || dec.endsWith(raw) || dec.startsWith('enhanced_except_')) {
          if (DEBUG) console.warn('[UVP] n-transform returned invalid result for', raw);
          continue;
        }
        url.searchParams.set('n', dec);
        const newUrl = url.href;
        if (newUrl !== u) {
          if (capturedUrls.has(u)) {
            const capturedKind = capturedUrlKinds.get(u);
            capturedUrls.delete(u);
            capturedUrls.add(newUrl);
            capturedUrlKinds.delete(u);
            capturedUrlKinds.set(newUrl, capturedKind || UVP.Utils.classifyMediaUrl(newUrl));
            _urlCache = null;
          }
          if (fmtResMap.has(u)) { fmtResMap.set(newUrl, fmtResMap.get(u)); fmtResMap.delete(u); }
          if (ytFmtMap.has(u)) { const info = ytFmtMap.get(u); info.hasN = false; info.deciphered = true; ytFmtMap.delete(u); ytFmtMap.set(newUrl, info); }
          ytDecipheredUrls.add(newUrl); // mark the exact transformed string — sequential ensures must skip it
          fixed++;
        }
      } catch (e) { if (DEBUG) console.warn('[UVP] n-param decipher failed for', u, e); }
    }
    if (fixed) console.log(`[UVP] Deciphered n-param on ${fixed} googlevideo URL(s)`);
    return fixed;
  };

  // ==================== YOUTUBE PLAYER-JS / N-DECIPHER ENSURE ====================
  // The SPA-race freshness gate means the 5-client InnerTube walk is often
  // SKIPPED on navigation (yt-navigate-finish already supplied formats). But
  // yt-navigate-finish player responses frequently LACK assets.js, so
  // ytPlayerData.playerJsUrl could stay null while captured URLs still carry
  // the n-param challenge — undeciphered URLs are throttled/403'd. These
  // closers heal that gap from DOM sources, which work in every userscript
  // sandbox (AdGuard's isolated world included — window.ytcfg is unreachable
  // there, but inline <script> text and the DOM are shared).
  UVP.Extractors.ensureYtPlayerJsUrl = function() {
    if (ytPlayerData.playerJsUrl && /\/s\/player\//.test(ytPlayerData.playerJsUrl)) return ytPlayerData.playerJsUrl;
    // 1) ytcfg (Tampermonkey page world / unsafeWindow)
    const cfg = getYtcfg();
    if (cfg) { try { const u = cfg.get('PLAYER_JS_URL'); if (u && /\/s\/player\//.test(u)) { ytPlayerData.playerJsUrl = u; return u; } } catch (e) {} }
    // 2) Inline ytcfg.set({...}) script text — shared DOM, works under AdGuard
    try {
      for (const s of UVP.Utils.getInlineScripts()) {
        const m = (s.textContent || '').match(/"PLAYER_JS_URL"\s*:\s*"([^"]+)"/);
        if (m) {
          // YouTube's inline ytcfg JSON escapes forward slashes ("\/" and
          // "\u002F") — normalize before the /s/player/ path test or this
          // source silently fails and the n-param decipher never runs.
          const u = m[1].replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/');
          if (/\/s\/player\//.test(u)) { ytPlayerData.playerJsUrl = u; return u; }
        }
      }
    } catch (e) { if (DEBUG) console.warn('[UVP] ensureYtPlayerJsUrl inline scan failed:', e); }
    // 3) Any loaded player script tag
    try {
      const el = document.querySelector('script[src*="/s/player/"]');
      if (el && el.src && /\/s\/player\//.test(el.src)) { ytPlayerData.playerJsUrl = el.src; return el.src; }
    } catch (e) {}
    return null;
  };

  // Fire-and-forget n-param decipher with every failure swallowed: a decipher
  // failure must never break playback/download — no-n URLs (mobile clients)
  // still work, worst case the n-carrying URLs are throttled. In-flight
  // coalescing prevents duplicate player-JS fetches.
  let _ytNsigEnsureInflight = null;
  let _ytNsigEnsureGeneration = -1;
  UVP.Extractors.ensureYtNDeciphered = function(expectedGeneration) {
    const generation = (typeof expectedGeneration === 'number') ? expectedGeneration : ytRouteGeneration;
    if (generation !== ytRouteGeneration) return Promise.resolve(0);
    // ytDecipheredUrls guard: a deciphered URL still carries n= (the value is
    // replaced via searchParams.set, not removed), so the regex alone cannot
    // tell deciphered from pending. Without the exclusion, a sequential ensure
    // (nav-finish + interceptor + extract all fire it) re-transforms already-
    // deciphered n-values into garbage → throttled/403'd URLs.
    const needsIt = [...capturedUrls].some(u => /googlevideo\.com/i.test(u) && /[?&]n=/.test(u) && !ytDecipheredUrls.has(u))
      || [...ytFmtMap.keys()].some(u => /[?&]n=/.test(u) && !ytDecipheredUrls.has(u));
    if (!needsIt) return Promise.resolve(0);
    if (_ytNsigEnsureInflight && _ytNsigEnsureGeneration === generation) return _ytNsigEnsureInflight;
    _ytNsigEnsureGeneration = generation;
    const work = (async () => {
      try {
        if (!ytPlayerData.playerJsUrl) UVP.Extractors.ensureYtPlayerJsUrl();
        const playerUrlAtStart = ytPlayerData.playerJsUrl;
        if (!playerUrlAtStart || generation !== ytRouteGeneration) return 0;
        const nFn = await UVP.Extractors.getYtNDecipher(generation);
        if (generation !== ytRouteGeneration || ytPlayerData.playerJsUrl !== playerUrlAtStart) return 0;
        if (nFn) return UVP.Extractors.decipherYtUrlsWithNFn(nFn) || 0;
        return 0;
      } catch (e) { if (DEBUG) console.warn('[UVP] ensureYtNDeciphered failed:', e); return 0; }
    })();
    _ytNsigEnsureInflight = work;
    work.then(() => {
      if (_ytNsigEnsureInflight === work) { _ytNsigEnsureInflight = null; _ytNsigEnsureGeneration = -1; }
    }, () => {
      if (_ytNsigEnsureInflight === work) { _ytNsigEnsureInflight = null; _ytNsigEnsureGeneration = -1; }
    });
    return work;
  };

  // ==================== INDEXEDDB ====================
  const DB_NAME = 'uvp-dl-store', STORE = 'chunks';
  let dbPromise = null;
  UVP.State.getDB = function() { if (dbPromise) return dbPromise; dbPromise = new Promise((resolve, reject) => { try { const req = indexedDB.open(DB_NAME, 1); req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); } catch (e) { reject(e); } }); dbPromise.catch(() => { dbPromise = null; }); return dbPromise; }
  UVP.State.dbPut = async function(index, data) { const db = await UVP.State.getDB(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(data, index); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
  UVP.State.dbGet = async function(index) { try { const db = await UVP.State.getDB(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get(index); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch (e) { return null; } }
  // Per-job key namespace (`${jobId}:init` / `${jobId}:${index}`). This DB is
  // shared by every SAME-ORIGIN tab — unprefixed integer keys let a second
  // tab's boot cleanup wipe an active download here (and a second download
  // overwrite this one's chunks). All destructive ops are either scoped to a
  // jobId or prune keys whose owning job is not in the cross-tab registry.
  UVP.State.dbClearJob = async function(jobId) {
    if (!jobId) return;
    try {
      const db = await UVP.State.getDB();
      return await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        const lo = jobId + ':';
        tx.objectStore(STORE).delete(IDBKeyRange.bound(lo, lo + '\uffff'));
        tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
      });
    } catch (e) { console.warn('[UVP] IndexedDB job clear failed:', e); }
  }
  // Set of full keys owned by jobId, or null when the store cannot be read.
  UVP.State.getJobKeys = async function(jobId) {
    if (!jobId) return null;
    try {
      const db = await UVP.State.getDB();
      const keys = await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).getAllKeys(IDBKeyRange.bound(jobId + ':', jobId + ':\uffff'));
        r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
      });
      return new Set(keys);
    } catch (e) { console.warn('[UVP] IndexedDB key listing failed:', e); return null; }
  }

  // Cross-tab active-job registry (localStorage is shared per origin,
  // sessionStorage is not). Downloads heartbeat their jobId while running;
  // orphan cleanup never touches a job another tab still owns. TTL covers
  // crashed tabs (heartbeat is ~2s while segments complete; CONFIG
  // hardTimeoutBackstopMs bounds a single stalled segment).
  const ACTIVE_JOBS_LS = 'uvp-active-dl-jobs';
  const ACTIVE_JOB_PREFIX = 'uvp-active-dl-job:';
  const ACTIVE_JOB_TTL_MS = 3 * 60 * 60 * 1000;
  UVP.State._readActiveJobs = function() {
    try {
      const raw = localStorage.getItem(ACTIVE_JOBS_LS);
      const map = raw ? JSON.parse(raw) : {};
      return (map && typeof map === 'object') ? map : {};
    } catch (e) { return null; } // localStorage blocked (private mode / policy)
  }
  // Individual localStorage keys avoid read-modify-write lost updates between
  // tabs. The legacy aggregate map remains readable for upgrades from 4.3.2.
  UVP.State.registerActiveJob = function(jobId) {
    if (!jobId) return;
    try { localStorage.setItem(ACTIVE_JOB_PREFIX + jobId, String(Date.now())); } catch (e) {}
  }
  UVP.State.unregisterActiveJob = function(jobId) {
    if (!jobId) return;
    try { localStorage.removeItem(ACTIVE_JOB_PREFIX + jobId); } catch (e) {}
  }
  // Pruned Set of live jobIds, or null when the registry is unreadable.
  UVP.State.getActiveJobIds = function() {
    const live = new Set(), now = Date.now();
    try {
      if (typeof localStorage.length === 'number' && typeof localStorage.key === 'function') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || key.indexOf(ACTIVE_JOB_PREFIX) !== 0) continue;
          const jobId = key.slice(ACTIVE_JOB_PREFIX.length);
          const ts = Number(localStorage.getItem(key));
          if (jobId && Number.isFinite(ts) && now - ts < ACTIVE_JOB_TTL_MS) live.add(jobId);
          else if (jobId) { try { localStorage.removeItem(key); } catch (e) {} }
        }
      }
      const legacy = UVP.State._readActiveJobs();
      if (legacy) for (const k of Object.keys(legacy)) {
        const ts = legacy[k];
        if (typeof ts === 'number' && now - ts < ACTIVE_JOB_TTL_MS) live.add(k);
      }
      return live;
    } catch (e) { return null; }
  }
  // Delete every chunk whose job prefix is NOT in the (pruned) active
  // registry — replaces the old unconditional full-store clear. Also purges
  // legacy unprefixed keys from older versions. Skips entirely when the
  // registry is unreadable: guessing "no active jobs" would corrupt a
  // download running in another tab.
  UVP.State.clearOrphanedChunks = async function() {
    const active = UVP.State.getActiveJobIds();
    if (!active) { console.warn('[UVP] Skipping orphan IndexedDB cleanup: active-job registry unreadable'); return; }
    try {
      const db = await UVP.State.getDB();
      const keys = await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).getAllKeys();
        r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
      });
      // Re-read ownership after the IndexedDB key scan. A tab can register a
      // new job while the readonly transaction is in flight; deleting from the
      // first snapshot would be a cross-tab TOCTOU cleanup race.
      const currentActive = UVP.State.getActiveJobIds();
      if (!currentActive) { console.warn('[UVP] Skipping orphan IndexedDB deletion: active-job registry became unreadable'); return; }
      const stale = keys.filter((k) => typeof k !== 'string' || k.indexOf(':') < 0 || !currentActive.has(k.slice(0, k.indexOf(':'))));
      if (!stale.length) return;
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        const os = tx.objectStore(STORE);
        stale.forEach((k) => os.delete(k));
        tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
      });
      console.log(`[UVP] Purged ${stale.length} orphaned download chunk(s) from IndexedDB`);
    } catch (e) { console.warn('[UVP] Orphan chunk cleanup failed:', e); }
  }

  // Track pending fire-and-forget orphan sweeps so downloadHLS/resumeDownload
  // can await them (same-tab serialization; cross-tab safety comes from the
  // jobId namespace above).
  let _pendingDbClear = null;
  UVP.State.scheduleDbClear = function() { _pendingDbClear = UVP.State.clearOrphanedChunks().catch(() => {}); return _pendingDbClear; }
  UVP.State.awaitPendingDbClear = async function() { if (_pendingDbClear) { const p = _pendingDbClear; _pendingDbClear = null; await p; } }
 
  // Clears active download chunks from IndexedDB, sessionStorage, and memory state.
  UVP.Download.cleanupDownload = async function(job) {
    const target = (job && job.jobId ? job : null) || currentDownloadJob;
    if (!target) {
      if (!job) { currentDownloadJob = null; currentDownloadScope = null; state.isDownloading = false; resumeInProgress = false; try { sessionStorage.removeItem('uvp-dl-job'); } catch (e) {} }
      return;
    }
    const sameJob = (a, b) => !!a && !!b && (a === b || (a.jobId && b.jobId && a.jobId === b.jobId));
    const ownsGlobalState = target === currentDownloadJob;
    // Abort the target's writable first. This await is an ownership boundary:
    // another download may start while the browser closes the old writable.
    if (target.fileWritable) { try { await target.fileWritable.abort(new Error('cleanup')); } catch (e) {} target.fileWritable = null; target.fileHandle = null; }
    // Re-check ownership for both explicit and implicit cleanup calls. A
    // no-argument cleanup can still be racing a replacement job that started
    // while abort() was awaiting; it must not clear the replacement's state.
    const stillOwnsGlobalState = target === currentDownloadJob;
    // Always release the old target's own storage, but never delete a namespace
    // reused by a replacement/resume job.
    if (target.jobId && (!currentDownloadJob || !sameJob(target, currentDownloadJob))) {
      try { UVP.State.unregisterActiveJob(target.jobId); await UVP.State.dbClearJob(target.jobId); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    }
    if (!ownsGlobalState || !stillOwnsGlobalState) return;
    currentDownloadJob = null;
    currentDownloadScope = null;
    state.isDownloading = false;
    resumeInProgress = false;
    try { sessionStorage.removeItem('uvp-dl-job'); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    try {
      if (target.jobId) { UVP.State.unregisterActiveJob(target.jobId); await UVP.State.dbClearJob(target.jobId); }
      else await UVP.State.clearOrphanedChunks();
    } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
  }
  UVP.Download.cleanupDownloadIfCurrent = async function(job) {
    if (!job || !job.scope || !UVP.Cancel.isCurrent(job.scope)) return;
    await UVP.Download.cleanupDownload(job);
  }
  UVP.Download.cleanupDownloadForScope = async function(scope) {
    if (!scope || currentDownloadScope !== scope || !UVP.Cancel.isCurrent(scope)) return;
    const job = currentDownloadJob;
    if (job && job.scope !== scope) return;
    await UVP.Download.cleanupDownload(job || null);
  }
  // Set by maybeResumeDownload around its internal scope swap: the emitted
  // download:cancel must NOT nuke the meta/IndexedDB data the imminent
  // resume depends on.
  UVP.Download._skipCancelCleanup = false;
  // Abort an in-flight streaming writable (cancel/error path). Without this a
  // cancelled or failed streaming download leaves the File System Access
  // writable open - the browser holds the partial file until the tab closes.
  UVP.Download.abortJobWritable = async function(job) {
    if (job && job.fileWritable) { try { await job.fileWritable.abort(new Error('download aborted')); } catch (e) {} job.fileWritable = null; job.fileHandle = null; }
  }
 
  // Detect manual page reload to suppress unwanted session auto-restore.
  UVP.Utils.isPageReload = function() {
    try {
      const nav = performance.getEntriesByType('navigation');
      if (nav.length > 0) return nav[0].type === 'reload';
      if (performance.navigation) return performance.navigation.type === 1; // legacy fallback
    } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    return false;
  }
 
  // ==================== PAGE-CONTEXT TRANSPORT (fallback) ====================
  // fetch()-based transport used when the userscript-manager transport
  // (GM_xmlhttpRequest) fails at the network level. The site's own player
  // loads the same segments from the page, so CDNs backing it (e.g. the OVH
  // S3 gateway pmvhavencloud.s3.*.io.cloud.ovh.net) have CORS configured for
  // this origin — the page transport succeeds where GM bursts were reset.
  // Forbidden headers (Referer/Origin/User-Agent/Cookie) are skipped; the
  // browser sets them itself.
  UVP.Network.gmErrorText = function(err) {
    if (!err) return 'unknown';
    if (typeof err === 'string') return err;
    // Tampermonkey reports network failures in err.error (e.g. "net::ERR_CONNECTION_RESET"),
    // Violentmonkey uses err.message — extract all known detail slots.
    return err.error || err.details || err.message || (typeof err.status === 'number' ? 'HTTP ' + err.status : 'unknown');
  }
  UVP.Network.acquireHostSlot = function(hostname, maxConcurrent) {
    if (!UVP.Network._hostSemaphores) UVP.Network._hostSemaphores = new Map();
    let sem = UVP.Network._hostSemaphores.get(hostname);
    if (!sem) { sem = { active: 0, waiters: [] }; UVP.Network._hostSemaphores.set(hostname, sem); }
    return new Promise((resolveSlot) => {
      const start = () => {
        if (sem.active < maxConcurrent) {
          sem.active++;
          let released = false;
          resolveSlot(() => {
            if (released) return;
            released = true;
            sem.active--;
            const next = sem.waiters.shift();
            if (next) next();
          });
        } else {
          sem.waiters.push(start);
        }
      };
      start();
    });
  }
  // ==================== COOKIE POLICY ====================
  // GM_xmlhttpRequest forwards cookies for ALL hosts by default, which lets a
  // hostile page bait the script into making credentialed requests to
  // third-party origins (confused-deputy). Policy:
  //   - same-site targets (shared registrable domain): cookies forwarded
  //   - everything else: anonymous - no credentials leave for foreign hosts.
  // NOTE: the registrable-domain match is a heuristic (no full Public Suffix
  // List); two-part TLDs (.co.uk etc.) resolve conservatively to cross-site,
  // which is the safe direction for cookies.
  UVP.Utils.sameSiteHost = function(hostA, hostB) {
    if (!hostA || !hostB) return false;
    const norm = (h) => String(h).toLowerCase().replace(/^www\./, '');
    const a = norm(hostA), b = norm(hostB);
    if (a === b) return true;
    return a.endsWith('.' + b) || b.endsWith('.' + a);
  };
  // GM transport gate: forward the browser's cookies only where justified.
  UVP.Utils.needsTargetCookies = function(targetUrl) {
    // String guard: new URL(null, base) coerces null to the relative path
    // "null" and would resolve to the page's own (cookie-forwarding) host.
    if (typeof targetUrl !== 'string' || !targetUrl) return false;
    let targetHost = null;
    try { targetHost = new URL(targetUrl, location.href).hostname; } catch (e) { return false; }
    if (!targetHost) return false;
    return UVP.Utils.sameSiteHost(targetHost, location.hostname);
  };
  UVP.Network.requestPageContext = function(url, type = 'text', extraHeaders = {}, onProgress, scope) {
    if (!UVP.Utils.isUsableUrl(url)) return Promise.reject(new Error('blocked non-public target: ' + url));
    if (typeof fetch !== 'function') return Promise.reject(new Error('page transport unavailable (no fetch)'));
    return new Promise((resolve, reject) => {
      const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
      let unhook = () => {};
      if (scope) unhook = scope.onAbort(() => { if (ctrl) { try { ctrl.abort(); } catch (e) {} } });
      // Stall watchdog: abort the transfer when NO bytes arrive for
      // CONFIG.stallWatchdogMs (mirrors the GM-path watchdog).
      let stalled = false;
      let lastProgressAt = Date.now();
      const watchdog = setInterval(() => {
        if (Date.now() - lastProgressAt > CONFIG.stallWatchdogMs) {
          stalled = true;
          clearInterval(watchdog);
          if (ctrl) { try { ctrl.abort(); } catch (e) {} }
        }
      }, 2500);
      const headers = {};
      for (const k of Object.keys(extraHeaders || {})) {
        if (/^(referer|origin|user-agent|cookie|host|content-length|connection)$/i.test(k)) continue;
        headers[k] = extraHeaders[k];
      }
      fetch(url, { method: 'GET', headers, credentials: 'same-origin', signal: ctrl ? ctrl.signal : undefined })
        .then((res) => {
          if (scope && !scope.check()) throw new Error(`request cancelled: ${url}`);
          if (!res.ok) { const e = new Error(`HTTP ${res.status} from ${url} (page transport)`); e.status = res.status; throw e; }
          if (!res.body || typeof res.body.getReader !== 'function') {
            const p = (type === 'arraybuffer') ? res.arrayBuffer() : (type === 'blob') ? res.blob() : res.text();
            return p.then((out) => { clearInterval(watchdog); try { unhook(); } catch (e) {} return out; });
          }
          const total = parseInt(res.headers.get('content-length') || '0', 10) || 0;
          const reader = res.body.getReader();
          const chunks = [];
          let loaded = 0;
          const readAll = () => reader.read().then(({ done, value }) => {
            if (scope && !scope.check()) throw new Error(`request cancelled: ${url}`);
            if (done) {
              clearInterval(watchdog);
              try { unhook(); } catch (e) {}
              if (type === 'blob') return new Blob(chunks);
              const merged = new Uint8Array(loaded);
              let off = 0;
              for (const c of chunks) { merged.set(c, off); off += c.length; }
              if (type === 'arraybuffer') return merged.buffer;
              return new TextDecoder('utf-8').decode(merged);
            }
            chunks.push(value);
            loaded += value.length;
            lastProgressAt = Date.now();
            if (onProgress) { try { onProgress(loaded, total); } catch (e) {} }
            return readAll();
          });
          return readAll();
        })
        .catch((e) => {
          clearInterval(watchdog);
          try { unhook(); } catch (e2) {}
          if (stalled) reject(new Error(`stalled (no bytes for ${CONFIG.stallWatchdogMs}ms, page transport): ${url}`));
          else reject(e);
        });
    });
  }

  // Streaming page-context transport: like requestPageContext but hands each
  // chunk to onChunk instead of buffering the whole body in memory. Used by
  // the MP4 stream-save engine (showSaveFilePicker) and the HLS Range-resume
  // segment path so multi-hundred-MB payloads never double-buffer in RAM.
  // Resolves {bytes, status}; rejects on non-2xx (err.status).
  // onChunk signature: (chunk: Uint8Array, loaded: number, total: number, status: number).
  UVP.Network.streamPageContext = function(url, onChunk, extraHeaders = {}, scope, onResponse) {
    if (!UVP.Utils.isUsableUrl(url)) return Promise.reject(new Error('blocked non-public target: ' + url));
    if (typeof fetch !== 'function') return Promise.reject(new Error('page transport unavailable (no fetch)'));
    return new Promise((resolve, reject) => {
      const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
      let unhook = () => {};
      if (scope) unhook = scope.onAbort(() => { if (ctrl) { try { ctrl.abort(); } catch (e) {} } });
      let lastProgressAt = Date.now();
      const watchdog = setInterval(() => {
        if (Date.now() - lastProgressAt > CONFIG.stallWatchdogMs) { clearInterval(watchdog); if (ctrl) { try { ctrl.abort(); } catch (e) {} } }
      }, 2500);
      const headers = {};
      for (const k of Object.keys(extraHeaders || {})) {
        if (/^(referer|origin|user-agent|cookie|host|content-length|connection)$/i.test(k)) continue;
        headers[k] = extraHeaders[k];
      }
      fetch(url, { method: 'GET', headers, credentials: 'same-origin', signal: ctrl ? ctrl.signal : undefined })
        .then((res) => {
          if (scope && !scope.check()) throw new Error(`request cancelled: ${url}`);
          if (!res.ok) { const e = new Error(`HTTP ${res.status} from ${url} (page stream)`); e.status = res.status; throw e; }
          if (onResponse) onResponse(res);
          if (!res.body || typeof res.body.getReader !== 'function') {
            // No streaming support - reject so the caller falls back to the buffered engine.
            const e = new Error('streaming unsupported by page transport'); e.noStream = true; throw e;
          }
          const total = parseInt(res.headers.get('content-length') || '0', 10) || 0;
          const reader = res.body.getReader();
          let loaded = 0;
          const readAll = () => reader.read().then(async ({ done, value }) => {
            if (scope && !scope.check()) throw new Error(`request cancelled: ${url}`);
            if (done) { clearInterval(watchdog); try { unhook(); } catch (e) {} resolve({ bytes: loaded, status: res.status }); return; }
            loaded += value.byteLength;
            lastProgressAt = Date.now();
            // status is passed through so Range-resume callers can detect a
            // server that ignored the Range header (200 = full body restart).
            // The callback's return promise IS the backpressure signal: the
            // reader is not pulled again until the consumer (e.g. a disk
            // write) has caught up — this caps memory at ~1 chunk in flight.
            // Re-throw wrapper: copy the original error's custom props
            // (stashCap, status, rangeRejected, …) onto the new error —
            // Error#message/#stack are non-enumerable so they stay untouched,
            // and the wrapper message is preserved. Callers key retry logic
            // off these flags (e.g. runPageTransportResumable's stash reset).
            if (onChunk) {
              try { await onChunk(value, loaded, total, res.status); }
              catch (e) {
                const wrapped = Object.assign(new Error('onChunk failed: ' + (e && e.message)), { writeFailed: true });
                if (e && typeof e === 'object') {
                  for (const k of Object.keys(e)) {
                    if (k === 'message' || k === 'stack') continue;
                    try { wrapped[k] = e[k]; } catch (e2) {}
                  }
                }
                throw wrapped;
              }
            }
            return readAll();
          });
          return readAll();
        })
        .catch((e) => {
          clearInterval(watchdog);
          try { unhook(); } catch (e2) {}
          reject(e);
        });
    });
  }

  // ==================== RESILIENT DOWNLOAD ENGINE ====================
  UVP.Network.requestCrossOriginWithRetry = function(url, type = 'text', onProgress, extraHeaders = {}, retries = 3, timeoutMs = 0, scope) {
    if (!UVP.Utils.isUsableUrl(url)) {
      return Promise.reject(new Error('blocked non-public target: ' + url));
    }
    // Cookie policy: GM_xmlhttpRequest forwards HttpOnly session cookies by default (anonymous:false).

    function validateResponse(response) {
      // Validate response: accept ArrayBuffer and ArrayBufferView (AdGuard compatibility).
      const isBuf = (v) => v instanceof ArrayBuffer || (v && v.buffer instanceof ArrayBuffer && typeof v.byteLength === 'number');
      if (type === 'arraybuffer') return isBuf(response) && response.byteLength > 0;
      if (type === 'text') return typeof response === 'string';
      if (type === 'blob') return response instanceof Blob && response.size > 0;
      return true;
    }

    // Parse server Retry-After header (seconds or HTTP date).
    function retryAfterFromHeaders(headersStr) {
      if (!headersStr) return 0;
      const sec = headersStr.match(/retry-after\s*:\s*(\d+)/i);
      if (sec) return parseInt(sec[1]);
      const date = headersStr.match(/retry-after\s*:\s*([^\r\n]+)/i);
      if (date) { const t = Date.parse(date[1].trim()); if (!isNaN(t)) return Math.max(0, Math.round((t - Date.now()) / 1000)); }
      return 0;
    }

    function retryDelay(attempt, retryAfterSec) {
      if (retryAfterSec > 0) return Math.min(retryAfterSec * 1000 + Math.random() * CONFIG.retryJitterMs, CONFIG.retryMaxDelayMs);
      return Math.min(CONFIG.retryBaseMs * Math.pow(CONFIG.retryMultiplier, attempt - 1) + Math.random() * CONFIG.retryJitterMs, CONFIG.retryMaxDelayMs);
    }
    function isRetryableStatus(status) {
      // 429 Too Many Requests, 5xx server errors, and status 0 (network/cors blocked) are transient.
      // All other 4xx are client errors and should fail fast.
      return status === 429 || status >= 500 || status === 0;
    }

    return new Promise((resolve, reject) => {
      let attempt = 0;
      let settled = false;
      let retryPending = false;
      let unhook = () => {};
      let gmHandle = null;   // B: in-flight request handle — aborted on cancel
      let watchdog = null;   // A: stall watchdog (no-bytes abort + retry)
      let lastProgressAt = 0;
      // Transport fallback: on GM network failure, fallback to page-context fetch with CORS.
      let usePageTransport = false;
      // S3 gateway fallback: strip custom Origin/Referer on retry while preserving caller headers.
      let stripCustomHeaders = false;
      // Partial chunk resume: stash bytes and resume via Range: bytes=N- header on disconnect.
      let partialChunks = [];
      let partialBytes = 0;
      const resetPartial = () => { partialChunks = []; partialBytes = 0; };
      // Per-host concurrency limiter to avoid gateway resets.
      let host = 'global';
      try { host = (new URL(url).hostname || 'global'); } catch (e) {}
      // Per-host transport memoization across segments.
      if (!UVP.Network._hostPageTransport) UVP.Network._hostPageTransport = new Set();
      if (!UVP.Network._hostStrippedHeaders) UVP.Network._hostStrippedHeaders = new Set();
      usePageTransport = UVP.Network._hostPageTransport.has(host);
      stripCustomHeaders = UVP.Network._hostStrippedHeaders.has(host);
      let hostSlot = null;
      const releaseSlot = () => { if (hostSlot) { const s = hostSlot; hostSlot = null; try { s(); } catch (e) {} } };
      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        if (watchdog) { clearInterval(watchdog); watchdog = null; }
        releaseSlot();
        try { unhook(); } catch (e) {}
        fn(value);
      };
      const abortHandle = () => {
        if (gmHandle && typeof gmHandle.abort === 'function') { try { gmHandle.abort(); } catch (e) {} }
        gmHandle = null;
      };
      const cancel = () => {
        // Explicit abort on cancel to prevent socket starvation.
        abortHandle();
        settle(reject, new Error(`request cancelled: ${url}`));
      };
      const scheduleRetry = (err) => {
        if (retryPending) return; // guard against double-schedule (e.g. onerror after watchdog abort)
        // Release connection slot during backoff delay.
        releaseSlot();
        if (attempt <= retries) {
          retryPending = true;
          setTimeout(() => { retryPending = false; execute(); }, retryDelay(attempt, err && err.retryAfterSec));
        } else {
          settle(reject, err);
        }
      };
      const runPageTransport = () => {
        // Transport routing: stream segments and binary media through low-overhead page fetch
        // Range-resume streaming path; text manifests keep the plain path.
        if (type === 'arraybuffer' && typeof fetch === 'function') { runPageTransportResumable(); return; }
        UVP.Network.requestPageContext(url, type, extraHeaders, (loaded, total) => {
          if (scope && !scope.check()) { cancel(); return; }
          lastProgressAt = Date.now();
          if (onProgress) onProgress(loaded, total);
        }, scope).then((response) => {
          if (scope && !scope.check()) { cancel(); return; }
          if (validateResponse(response)) { settle(resolve, response); return; }
          scheduleRetry(new Error(`invalid or empty ${type} response from ${url} (page transport)`));
        }).catch((err) => {
          if (scope && !scope.check()) { cancel(); return; }
          // HTTP status errors from the page transport surface with .status —
          // apply the same retryable/fail-fast policy as the GM path.
          if (err && typeof err.status === 'number' && !isRetryableStatus(err.status)) {
            settle(reject, new Error(`HTTP ${err.status} from ${url}`));
            return;
          }
          scheduleRetry(err);
        });
      };
      // Range-resumable page transport: streams arraybuffer payloads directly to prevent double-buffering
      // chunks into partialChunks; on retry the next attempt continues from
      // the stashed offset (Range: bytes=N-). 206 appends, 200 restarts.
      const runPageTransportResumable = () => {
        // BYTERANGE segments carry an explicit file-relative Range in
        // extraHeaders - it must win; partial resume never applies to them.
        const hasExplicitRange = extraHeaders && Object.keys(extraHeaders).some(k => /^range$/i.test(k));
        if (hasExplicitRange) resetPartial();
        const headers = { ...extraHeaders };
        const baseAtStart = partialBytes;
        if (baseAtStart > 0) headers['Range'] = `bytes=${baseAtStart}-`;
        let rangeStage = baseAtStart > 0 ? 'pending' : 'full'; // pending: awaiting 206/200 verdict
        UVP.Network.streamPageContext(url, (chunk, loaded, total, status) => {
          if (status === 200 && rangeStage === 'pending') {
            // Server ignored the Range header and sent the FULL body - the
            // stashed bytes would duplicate the start of this stream.
            resetPartial();
            rangeStage = 'full';
          } else if (status === 206) {
            rangeStage = 'resumed';
          }
          partialChunks.push(chunk);
          partialBytes += chunk.byteLength;
          if (partialBytes > CONFIG.segRangeResumeMaxBytes) {
            const e = new Error('Range-resume stash cap exceeded'); e.stashCap = true; throw e;
          }
          lastProgressAt = Date.now();
          if (onProgress) { try { onProgress(partialBytes, total > 0 ? total + (rangeStage === 'resumed' ? baseAtStart : 0) : 0); } catch (e) {} }
        }, headers, scope).then(() => {
          if (scope && !scope.check()) { cancel(); return; }
          if (partialBytes === 0) { scheduleRetry(new Error(`empty page-transport response from ${url}`)); return; }
          const merged = new Uint8Array(partialBytes);
          let off = 0;
          for (const c of partialChunks) { merged.set(c, off); off += c.byteLength; }
          resetPartial();
          settle(resolve, merged.buffer);
        }).catch((err) => {
          if (scope && !scope.check()) { cancel(); return; }
          if (err && err.stashCap) { resetPartial(); scheduleRetry(err); return; }
          if (err && typeof err.status === 'number' && !isRetryableStatus(err.status)) {
            // 403/400 on a ranged request: drop the stash and take one clean
            // full-body attempt before failing (mirrors yt-dlp's restart).
            if (partialBytes > 0) { resetPartial(); scheduleRetry(err); return; }
            settle(reject, new Error(`HTTP ${err.status} from ${url}`));
            return;
          }
          scheduleRetry(err);
        });
      };
      const runAttempt = () => {
        // Transport selection: GM first (privileged, cookie-forwarding); after
        // a GM network-level failure — or when no GM transport exists — use
        // the page-context fetch transport for the remaining attempts.
        if (usePageTransport || (UVP.Network._gmTypeFailed && UVP.Network._gmTypeFailed[type]) || typeof GM_xmlhttpRequest !== 'function') { runPageTransport(); return; }
        const opts = {
          method: 'GET', url, responseType: type,
          // Forward cookies only for same-site targets - the only hosts whose
          // streams actually require session cookies. Every other cross-site
          // target is fetched anonymously, so a hostile page cannot bait the
          // script into making credentialed requests to third-party origins it
          // could not read itself (CORS). Managers without anonymous support
          // ignore the flag and keep the old behaviour.
          anonymous: UVP.Utils.needsTargetCookies(url) ? false : true,
          // Fallback retry: strip custom headers if cross-origin gateway rejects them
          // gateways (OVH) reject/throttle requests with custom Origin/Referer.
          headers: { ...(stripCustomHeaders ? {} : { "Origin": location.origin, "Referer": location.href }), ...extraHeaders },
          onload: (res) => {
            if (scope && !scope.check()) { cancel(); return; }
            if (res.status >= 200 && res.status < 300) {
              const response = res.response;
              if (validateResponse(response)) { settle(resolve, response); }
              else {
                // GM shim answered 2xx but returned the wrong shape (responseType
                // unsupported). Memoize per-type so every FUTURE request skips GM
                // for this type immediately, and finish this transfer's remaining
                // attempts on the page transport instead of burning all retries.
                if (!UVP.Network._gmTypeFailed) UVP.Network._gmTypeFailed = {};
                if (!UVP.Network._gmTypeFailed[type]) {
                  UVP.Network._gmTypeFailed[type] = true;
                  console.warn(`[UVP] GM responseType "${type}" returned invalid data - memoizing page-transport fallback`);
                }
                usePageTransport = true;
                scheduleRetry(new Error(`invalid or empty ${type} response from ${url}`));
              }
            } else if (isRetryableStatus(res.status)) {
              // Status 0 = the GM transport couldn't complete at all — retry
              // via the page-context transport instead.
              if (res.status === 0) { usePageTransport = true; UVP.Network._hostPageTransport.add(host); }
              const err = new Error(`HTTP ${res.status} from ${url}`);
              err.retryAfterSec = retryAfterFromHeaders(res.responseHeaders);
              scheduleRetry(err);
            } else {
              // Header sanitization: S3 gateways reject requests carrying unrecognized headers
              // Origin/Referer (400/403). Strip them and retry once before
              // failing - extraHeaders (Range/auth) are always preserved.
              if (!stripCustomHeaders) {
                stripCustomHeaders = true;
                UVP.Network._hostStrippedHeaders.add(host); // Cache header stripping requirement per host
                if (DEBUG) console.warn(`[UVP] HTTP ${res.status} from ${url} - retrying without custom Origin/Referer`);
                scheduleRetry(new Error(`HTTP ${res.status} from ${url} (header-strip retry)`));
                return;
              }
              settle(reject, new Error(`HTTP ${res.status} from ${url}`));
            }
          },
          onerror: (err) => {
            if (scope && !scope.check()) { cancel(); return; }
            // GM transport failed at the network level — subsequent attempts
            // use the page-context transport (the site's own player loads
            // these URLs from the page, so CDN CORS permits the page origin).
            usePageTransport = true;
            stripCustomHeaders = true; // Drop custom headers for remaining retries
            // Cache failure mode: subsequent segment requests bypass failing transport directly
            UVP.Network._hostPageTransport.add(host);
            UVP.Network._hostStrippedHeaders.add(host);
            scheduleRetry(new Error(`network error for ${url}: ${UVP.Network.gmErrorText(err)} — switching to page transport`));
          },
          onprogress: (e) => {
            if (scope && !scope.check()) { cancel(); return; }
            lastProgressAt = Date.now(); // A: any bytes reset the stall clock
            if (onProgress) onProgress(e.loaded, e.total);
          }
        };
        if (timeoutMs > 0) {
          // A: GM's total-time cap is a distant backstop only; the stall
          // watchdog governs the real timeout so large-but-flowing transfers
          // (e.g. 40MB HLS segments) are never killed mid-flight.
          opts.timeout = Math.max(timeoutMs, CONFIG.hardTimeoutBackstopMs);
          opts.ontimeout = () => {
            if (scope && !scope.check()) { cancel(); return; }
            scheduleRetry(new Error(`timeout requesting ${url}`));
          };
        }
        // A synchronous throw from the manager's GM shim (e.g. AdGuard's
        // Userscript Module) must never leak the held per-host slot or kill
        // the retry chain with an unhandled rejection — fall back to the
        // page transport instead.
        try {
          const gmResult = GM_xmlhttpRequest(opts);
          gmHandle = (gmResult && typeof gmResult.abort === 'function') ? gmResult : null;
          if (gmResult && typeof gmResult.catch === 'function') {
            gmResult.catch(() => {}); // suppress internal rejection — handled by onload/onerror callbacks
          }
        } catch (gmThrow) {
          usePageTransport = true;
          scheduleRetry(new Error(`GM transport threw for ${url}: ${UVP.Network.gmErrorText(gmThrow)} — switching to page transport`));
          return;
        }
        // A: abort + retry when no bytes arrive for the stall threshold.
        // Manifest-class calls (timeoutMs <= manifestTimeoutMs) fast-fail at
        // manifestStallMs - a 30s-stalled manifest request ground the whole
        // Parsing phase (PMV Haven) through retry cycles for minutes.
        const stallMs = (timeoutMs > 0 && timeoutMs <= CONFIG.manifestTimeoutMs) ? CONFIG.manifestStallMs : CONFIG.stallWatchdogMs;
        if (watchdog) clearInterval(watchdog);
        watchdog = setInterval(() => {
          if (settled || retryPending) { if (watchdog) { clearInterval(watchdog); watchdog = null; } return; }
          if (Date.now() - lastProgressAt > stallMs) {
            if (scope && !scope.check()) { cancel(); return; }
            abortHandle();
            scheduleRetry(new Error(`stalled (no bytes for ${stallMs}ms): ${url}`));
          }
        }, 2500);
      };
      const execute = () => {
        if (scope && !scope.check()) { cancel(); return; }
        attempt++;
        lastProgressAt = Date.now();
        // Gate every ATTEMPT behind the per-host connection cap. The slot is
        // held only while a transfer is in flight — released during backoff
        // (scheduleRetry) and on settle — so a stuck transfer or a throwing
        // GM shim can never starve the whole per-host queue.
        // Concurrency clamp: throttles burst requests to rate-limited storage gateways
        // halve concurrency for them (PMV Haven 4K: 14 x ~100MB segments).
        const s3ish = CONFIG.s3HostRe && CONFIG.s3HostRe.test(host);
        const maxConc = s3ish ? Math.min(2, CONFIG.perHostConcurrency) : CONFIG.perHostConcurrency;
        UVP.Network.acquireHostSlot(host, maxConc).then((slot) => {
          if (settled) { try { slot(); } catch (e) {} return; }
          hostSlot = slot;
          try { runAttempt(); }
          catch (attemptThrow) {
            releaseSlot();
            scheduleRetry(new Error(`attempt threw for ${url}: ${UVP.Network.gmErrorText(attemptThrow)}`));
          }
        }, () => { hostSlot = null; try { runAttempt(); } catch (e) { releaseSlot(); scheduleRetry(new Error(`attempt threw for ${url}: ${e}`)); } });
      };
      if (scope) unhook = scope.onAbort(cancel);
      execute();
    });
  }
 
  // Validate that a fetched playlist is really M3U8 content. CDNs frequently
  // answer dead/expired/signed-out URLs with HTTP 200 + an HTML/XML error
  // page, which used to flow into parseSegments and die with the cryptic
  // "No valid segments found" error. Detect that here with a clear message.
  UVP.Download.assertM3u8Manifest = function(manifest, url) {
    if (typeof manifest === 'string' && /#EXTM3U/.test(manifest)) return;
    const preview = String(manifest || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    throw new Error(`not a valid M3U8 playlist (HTTP 200 body: "${preview}${preview.length >= 60 ? '…' : ''}") from ${url}`);
  }

  // Resolves master playlist to media playlist, recording variant renditions for fallback.
  UVP.Download.resolveToMediaPlaylist = async function(m3u8Url, scope, onPhase) {
    // Progress callback: updates UI with sub-phase status indicators
    // a frozen "Parsing..." while the manifest chain grinds (PMV Haven).
    onPhase = onPhase || (() => {});
    let manifest;
    onPhase('Fetching manifest...');
    try { manifest = await UVP.Network.requestCrossOriginWithRetry(m3u8Url, 'text', null, {}, 3, CONFIG.manifestTimeoutMs, scope); }
    catch (e) {
      // Security domain check: restricts fallback URLs to the same origin as master playlist
      // silently switching to a different video captured by network interception
      // Prefer an HLS URL for the fallback to avoid silently switching to a
      // low-quality MP4 when the original m3u8 fetch fails. Only accept .m3u8.
      const freshUrl = UVP.Utils.pickBestUrlByFormat('m3u8');
      if (freshUrl && freshUrl !== m3u8Url && /\.m3u8([?#]|$)/i.test(freshUrl)) {
        try {
          const origHost = new URL(m3u8Url).hostname;
          const freshHost = new URL(freshUrl).hostname;
          if (origHost === freshHost || freshHost.endsWith('.' + origHost) || origHost.endsWith('.' + freshHost)) {
            onPhase('Retrying manifest (fresh URL)...');
            m3u8Url = freshUrl; manifest = await UVP.Network.requestCrossOriginWithRetry(m3u8Url, 'text', null, {}, 3, CONFIG.manifestTimeoutMs, scope);
          } else { throw e; }
        } catch (urlErr) { throw e; }
      } else { throw e; }
    }
    UVP.Download.assertM3u8Manifest(manifest, m3u8Url);
    let variants = [];
    let chosenBw = 0; // Bandwidth bitrate of selected variant for progress estimation
    let loopCount = 0;
    // Download quality preference: 'best' (default) or 'lowest' — set via the
    // userscript menu ("UVP: Toggle download quality"), persisted with GM_setValue.
    const dlQuality = UVP.Utils.getDownloadQuality();
    while (manifest.includes('#EXT-X-STREAM-INF') && loopCount < 3) {
      if (scope && !scope.check()) throw new Error('cancelled');
      onPhase('Selecting quality...');
      const lines = manifest.split('\n');
      let bestUrl = '', maxRes = 0, maxBw = 0, minRes = 0, minBw = 0;
      variants = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
          const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/); const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/);
          const bw = bwMatch ? parseInt(bwMatch[1]) : 0; const res = resMatch ? parseInt(resMatch[1]) : 0;
          let j = i + 1; while (j < lines.length && (lines[j].trim() === '' || lines[j].startsWith('#'))) j++;
          if (j < lines.length) {
            const varUrl = UVP.Utils.resolveSafeUrl(lines[j].trim(), m3u8Url);
            variants.push({ url: varUrl, res, bw });
            if (dlQuality === 'lowest') {
              // Follow the lowest-resolution variant chain (res must be known;
              // ties broken by lowest bandwidth).
              if (res > 0 && (minRes === 0 || res < minRes || (res === minRes && bw < minBw))) { minRes = res; minBw = bw; bestUrl = varUrl; }
            } else if (res > maxRes || (res === maxRes && bw > maxBw)) { maxRes = res; maxBw = bw; bestUrl = varUrl; }
          }
        }
      }
      if (bestUrl) { chosenBw = (dlQuality === 'lowest' ? minBw : maxBw); m3u8Url = bestUrl; manifest = await UVP.Network.requestCrossOriginWithRetry(m3u8Url, 'text', null, {}, 3, CONFIG.manifestTimeoutMs, scope); UVP.Download.assertM3u8Manifest(manifest, m3u8Url); } else break;
      loopCount++;
    }
    variants.sort((a, b) => b.res - a.res || b.bw - a.bw);
    // Selected variant bandwidth feeds byte-based progress estimation
    return { mediaUrl: m3u8Url, manifest, variants: variants.map(v => v.url), bandwidth: chosenBw || 0 };
  }
 
  UVP.Utils.ivFromHex = function(value) {
    const clean = String(value || '').replace(/^0x/i, '');
    if (!/^[0-9a-f]{32}$/i.test(clean)) return null;
    return new Uint8Array(clean.match(/../g).map(part => parseInt(part, 16)));
  }
 
  UVP.Utils.ivFromSequence = function(sequence) {
    const iv = new Uint8Array(16);
    const view = new DataView(iv.buffer);
    const high = Math.floor(sequence / 0x100000000);
    const low = sequence >>> 0;
    view.setUint32(8, high, false);
    view.setUint32(12, low, false);
    return iv;
  }
 
  UVP.Utils.parseHlsAttributeList = function(line) {
    const attrs = {};
    const list = line.slice(line.indexOf(':') + 1);
    const matcher = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
    let match;
    while ((match = matcher.exec(list))) {
      const value = match[2].trim();
      attrs[match[1].toUpperCase()] = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    }
    return attrs;
  }
 
  UVP.Utils.parseHlsKeyTag = function(line, mediaUrl) {
    const attrs = UVP.Utils.parseHlsAttributeList(line);
    const method = (attrs.METHOD || '').toUpperCase();
    if (method === 'NONE') return null;
    if (method !== 'AES-128') {
      // SAMPLE-AES / FAIRPLAY implies DRM (FairPlay/Widevine) — make the
      // failure reason explicit instead of a generic "unsupported method".
      if (/SAMPLE-AES|FAIR/i.test(method)) throw new Error(`DRM-protected stream (${method}) cannot be downloaded`);
      throw new Error(`Unsupported HLS encryption method: ${method || 'missing'}`);
    }
    const keyFormat = (attrs.KEYFORMAT || 'identity').toLowerCase();
    if (keyFormat !== 'identity') throw new Error(`Unsupported HLS key format: ${keyFormat}`);
    if (!attrs.URI) throw new Error('AES-128 HLS key is missing URI');
    if (attrs.IV && !UVP.Utils.ivFromHex(attrs.IV)) throw new Error('AES-128 HLS key has an invalid IV; expected 128-bit hex');
    return { uri: UVP.Utils.resolveSafeUrl(attrs.URI, mediaUrl), iv: attrs.IV || null };
  }
 
  UVP.Download.parseSegments = function(manifest, mediaUrl) {
    const lines = manifest.split('\n');
    if (lines.length > 2_000_000) throw new Error('manifest too large'); // DoS guard: pathological m3u8
    const seqMatch = manifest.match(/#EXT-X-MEDIA-SEQUENCE:([0-9]+)/);
    const startSeq = seqMatch ? parseInt(seqMatch[1]) : 0;
    const segments = [];
    let currentOffset = 0;
    let totalDuration = 0; // Total duration sum from EXTINF tags for progress calculation
    let activeKey = null;
    let keyInfo = null;
    let initSegmentUrl = null;
    let initByteRange = null;
    let initKeyInfo = null;
 
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-KEY:')) {
        activeKey = UVP.Utils.parseHlsKeyTag(line, mediaUrl);
        if (activeKey && !keyInfo) keyInfo = activeKey;
        continue;
      }
      if (line.startsWith('#EXT-X-MAP:')) {
        const mapAttrs = UVP.Utils.parseHlsAttributeList(line);
        if (mapAttrs.URI) initSegmentUrl = UVP.Utils.resolveSafeUrl(mapAttrs.URI, mediaUrl);
        if (mapAttrs.BYTERANGE) {
          const parts = mapAttrs.BYTERANGE.split('@');
          if (parts.length === 2) {
            initByteRange = { length: parseInt(parts[0]), offset: parseInt(parts[1]) };
            currentOffset = initByteRange.offset + initByteRange.length;
          } else {
            initByteRange = { length: parseInt(parts[0]), offset: currentOffset };
            currentOffset += initByteRange.length;
          }
        }
        initKeyInfo = activeKey;
        continue;
      }
      if (!line.startsWith('#EXTINF')) continue;
      // EXTINF segment duration (seconds): computes cumulative stream duration
      // byte estimate used for byte-accurate download progress.
      const durMatch = line.match(/^#EXTINF:\s*([0-9.]+)/);
      const segDuration = durMatch ? parseFloat(durMatch[1]) : 0;
 
      let j = i + 1;
      let byteRange = null;
      while (j < lines.length && (lines[j].trim() === '' || lines[j].trim().startsWith('#'))) {
        const betweenLine = lines[j].trim();
        if (betweenLine.startsWith('#EXT-X-KEY:')) {
          activeKey = UVP.Utils.parseHlsKeyTag(betweenLine, mediaUrl);
          if (activeKey && !keyInfo) keyInfo = activeKey;
        }
        if (betweenLine.startsWith('#EXT-X-BYTERANGE:')) {
          const br = betweenLine.slice(betweenLine.indexOf(':') + 1).trim();
          if (br.includes('@')) {
            const parts = br.split('@');
            byteRange = { length: parseInt(parts[0]), offset: parseInt(parts[1]) };
            currentOffset = byteRange.offset + byteRange.length;
          } else {
            byteRange = { length: parseInt(br), offset: currentOffset };
            currentOffset += byteRange.length;
          }
        }
        j++;
      }
      if (j < lines.length) {
        if (segments.length >= 50000) { console.warn('[UVP] manifest segment cap reached, truncating'); break; }
        totalDuration += segDuration;
        segments.push({
          url: UVP.Utils.resolveSafeUrl(lines[j].trim(), mediaUrl),
          byteRange,
          duration: segDuration,
          sequence: startSeq + segments.length,
          keyInfo: activeKey,
        });
      }
    }
 
    const firstKeyInfo = keyInfo || initKeyInfo;
    const isEncrypted = !!firstKeyInfo;
    return {
      segments,
      isEncrypted,
      keyUri: firstKeyInfo ? firstKeyInfo.uri : null,
      ivHex: firstKeyInfo ? firstKeyInfo.iv : null,
      keyInfo: firstKeyInfo,
      startSeq,
      initSegmentUrl,
      initByteRange,
      initKeyInfo,
      totalDuration,
    };
  }
 
  UVP.Download.getHlsCryptoKey = async function(keyCache, keyInfo, scope) {
    if (!keyInfo) return null;
    const cached = keyCache.get(keyInfo.uri);
    if (cached) return cached;
    const pending = UVP.Network.requestCrossOriginWithRetry(keyInfo.uri, 'arraybuffer', null, {}, 3, CONFIG.segTimeoutMs, scope)
      .then(keyData => crypto.subtle.importKey('raw', keyData, 'AES-CBC', false, ['decrypt']));
    keyCache.set(keyInfo.uri, pending);
    try { return await pending; }
    catch (err) { keyCache.delete(keyInfo.uri); throw err; }
  }
 
  UVP.Utils.detectHlsContainer = function(segments, initSegmentUrl) {
    if (initSegmentUrl) return 'mp4'; // fMP4 playlists always have an init segment
    for (const seg of segments) {
      if (/\.ts([?#]|$)/i.test(seg.url)) return 'ts';
      if (/\.(m4s|mp4)([?#]|$)/i.test(seg.url)) return 'mp4';
    }
    return 'mp4';
  }

  UVP.Download.buildJob = async function(m3u8Url, filename, scope, onPhase) {
    const { mediaUrl, manifest, variants, bandwidth } = await UVP.Download.resolveToMediaPlaylist(m3u8Url, scope, onPhase);
    if (scope && !scope.check()) throw new Error('cancelled');
    if (onPhase) onPhase('Reading segments...');
    const parsed = UVP.Download.parseSegments(manifest, mediaUrl);
    if (!parsed.segments.length && !parsed.initSegmentUrl) throw new Error('No valid segments found in manifest stream.');
    if (!/#EXT-X-ENDLIST/.test(manifest)) {
      console.warn('[UVP] Live playlist (no #EXT-X-ENDLIST) — downloading the current snapshot; segment counts may shift between refreshes.');
    }
    if (parsed.segments.length > 50000 && !parsed.initSegmentUrl) throw new Error('segment count exceeds safety cap');
    // crypto.subtle (AES-128 segment decryption) exists only in secure contexts -
    // fail here with a clear message instead of a cryptic per-segment error.
    if (parsed.isEncrypted && !(typeof window !== 'undefined' && window.isSecureContext)) {
      throw new Error('Encrypted (AES-128) HLS requires a secure context (HTTPS) - crypto.subtle is unavailable on insecure pages');
    }
    const container = UVP.Utils.detectHlsContainer(parsed.segments, parsed.initSegmentUrl);
    const finalFilename = filename.replace(/\.[^.]+$/, '') + (container === 'ts' ? '.ts' : '.mp4');
    const keyCache = new Map();
    let key = null;
    if (parsed.keyInfo) {
      try { key = await UVP.Download.getHlsCryptoKey(keyCache, parsed.keyInfo, scope); }
      catch (err) { console.warn('[UVP] AES Key fetch warning:', err); }
    }
    return {
      scope: scope,
      jobId: UVP.Download.newJobId(),
      originalUrl: m3u8Url,
      url: mediaUrl,
      filename: finalFilename,
      container,
      segments: parsed.segments,
      isEncrypted: parsed.isEncrypted,
      key,
      iv: UVP.Utils.ivFromHex(parsed.keyInfo && parsed.keyInfo.iv),
      keyUri: parsed.keyInfo ? parsed.keyInfo.uri : null,
      keyInfo: parsed.keyInfo,
      initKeyInfo: parsed.initKeyInfo,
      keyCache,
      startSeq: parsed.startSeq,
      segSig: UVP.Download.computeSegmentSignature(parsed.segments, parsed.startSeq),
      initSegmentUrl: parsed.initSegmentUrl,
      initByteRange: parsed.initByteRange,
      variants,
      bandwidth: bandwidth || 0,          // Estimated bandwidth for progress calculation
      totalDuration: parsed.totalDuration || 0, // Total stream duration for progress calculation
      completed: new Set()
    };
  }
 
  // Throttled metadata persistence to prevent storage thrashing during downloads
  let _saveJobMetaLast = 0;
  UVP.Download.saveJobMeta = function(job, force) {
    const now = Date.now();
    if (!force && now - _saveJobMetaLast < CONFIG.saveJobMetaThrottleMs) return;
    _saveJobMetaLast = now;
    // Persist download mode (streaming file handle vs. IndexedDB chunk storage)
    // user-picked file, not IndexedDB — persisting the completed-set would
    // poison a later resume (no file handle → gapped merge). Stream-mode
    // meta carries no completed-set; resume does a fresh IndexedDB download.
    const mode = job.fileHandle ? 'stream' : 'idb';
    // Cross-tab heartbeat (throttled with this call): keeps this job's chunks
    // exempt from other tabs' orphan cleanup while the download is alive.
    if (job.jobId) { try { UVP.State.registerActiveJob(job.jobId); } catch (e) {} }
    try { sessionStorage.setItem('uvp-dl-job', JSON.stringify({ url: job.url, originalUrl: job.originalUrl || job.url, filename: job.filename, mode, jobId: job.jobId || null, segSig: job.segSig || null, startSeq: typeof job.startSeq === 'number' ? job.startSeq : null, total: job.segments ? job.segments.length : 0, completed: mode === 'idb' ? [...job.completed] : [] })); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
  }
 
  // Deterministic per-download ID; namespaces every IndexedDB chunk key so
  // concurrent downloads (any tab, same origin) can never clobber each other.
  UVP.Download.newJobId = function() {
    return 'j' + Date.now().toString(36) + 'x' + Math.random().toString(36).slice(2, 8);
  }
  // IndexedDB chunk key helper: `${jobId}:${index}` ('init' for the init segment).
  UVP.Download.segKey = function(job, index) { return job.jobId + ':' + index; }
  // djb2 fingerprint of the ordered segment list (URL pathnames + byte ranges;
  // query strings excluded — signed tokens rotate on every manifest refresh).
  // Persisted in the resume meta so a reordered/rebuilt playlist is detected
  // BEFORE the persisted completed-index set is trusted (a shifted index maps
  // to different bytes — merging it would splice corrupt media mid-file).
  UVP.Download.computeSegmentSignature = function(segments, startSeq) {
    let h = 5381;
    const mix = (str) => { for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; };
    mix(String(startSeq || 0));
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      let p = '';
      try { p = new URL(s.url).pathname; } catch (e) { p = String(s.url || ''); }
      mix(p);
      if (s.byteRange) mix('@' + s.byteRange.offset + '+' + s.byteRange.length);
      mix(';');
    }
    return (h >>> 0).toString(36);
  }

  // A3: shared init-segment downloader — extracted from two duplicated blocks
  UVP.Download.downloadInitSegment = async function(job) {
    const scope = job.scope;
    if (!job.initSegmentUrl || job.completed.has('init')) return true;
    if (scope && !scope.check()) return false;
    try {
      let initHeaders = {};
      if (job.initByteRange) { const br = job.initByteRange; initHeaders['Range'] = `bytes=${br.offset}-${br.offset + br.length - 1}`; }
      let initData = await UVP.Network.requestCrossOriginWithRetry(job.initSegmentUrl, 'arraybuffer', null, initHeaders, 2, CONFIG.segTimeoutMs, scope);
      if (initData && initData.byteLength > 0) {
        const initKeyInfo = job.initKeyInfo;
        if (initKeyInfo) {
          try {
            const initKey = await UVP.Download.getHlsCryptoKey(job.keyCache, initKeyInfo, scope);
            const initIv = UVP.Utils.ivFromHex(initKeyInfo.iv) || UVP.Utils.ivFromSequence(0);
            initData = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: initIv }, initKey, initData);
          } catch (e) {
            console.warn('[UVP] Init segment decryption failed:', e);
            if (initKeyInfo) job.keyCache.delete(initKeyInfo.uri);
            await UVP.Download.cleanupDownloadIfCurrent(job);
            return false;
          }
        }
        try {
          if (scope && !scope.check()) return false;
          // Measure downloaded bytes in real-time for transfer speedometer
          // per-segment dbGet() re-read pulled 100MB 4K segments back out of
          // IndexedDB just to update the UI).
          job.bytesDone = (job.bytesDone || 0) + initData.byteLength;
          if (job.fileWritable) {
            await job.fileWritable.write(initData);
          } else {
            await UVP.State.dbPut(UVP.Download.segKey(job, 'init'), initData);
          }
          if (scope && !scope.check()) return false;
          job.completed.add('init');
          UVP.Download.saveJobMeta(job);
        } catch (e) {
          console.warn('[UVP] Init segment storage failed:', e);
          await UVP.Download.cleanupDownloadIfCurrent(job);
          return false;
        }
      } else {
        console.warn('[UVP] Init segment download returned empty data');
        await UVP.Download.cleanupDownloadIfCurrent(job);
        return false;
      }
    } catch (e) {
      console.warn('[UVP] Init segment download failed:', e);
      await UVP.Download.cleanupDownloadIfCurrent(job);
      return false;
    }
    return true;
  }

  // Sequential stream writer: flushes buffered segments in playlist sequence order
  // complete segments out of order (concurrent fetches); writing chunks at
  // completion order produced transposed moof/mdat atoms — the "downloads
  // fine but plays poorly" class of corruption. This gate holds completed
  // chunks until every lower index is on disk, then writes strictly in
  // playlist order. fail() poisons the stream (a mid-file hole cannot be
  // filled by appending); reset() clears it for a fresh stream incarnation
  // (manifest refresh / variant switch recreated the writable).
  UVP.Download.createOrderedStreamWriter = function(write) {
    let nextIndex = 0;
    let error = null;
    const pending = new Map();
    const waiters = new Set();
    const wake = () => { const ws = [...waiters]; waiters.clear(); ws.forEach((r) => r()); };
    // First error wins: later fail() calls (peers unwinding after the gate was
    // already poisoned) must not mask the root cause.
    const failStream = (err) => { if (!error) error = err || new Error('stream writer failed'); wake(); };
    return {
      async write(i, chunk) {
        if (error) throw error;
        if (i < nextIndex) return; // already written in a previous incarnation
        pending.set(i, chunk);
        while (nextIndex !== i) {
          if (error) { pending.delete(i); throw error; }
          await new Promise((r) => { waiters.add(r); setTimeout(r, 25); });
        }
        const c = pending.get(i); pending.delete(i);
        try {
          await write(c);
        } catch (wErr) {
          // A rejected write at this cursor can never be unblocked by waiting:
          // without poisoning, every higher-index waiter spins in the 25ms poll
          // forever and Promise.all(workers) never settles (deadlock on disk
          // full / revoked permission / closed writable). failStream() wakes
          // them so they throw and the normal failed-segment → refresh →
          // resetOutputStream() → reset() recovery path takes over.
          failStream(new Error('stream write failed: ' + (wErr && wErr.message ? wErr.message : wErr)));
          throw wErr;
        }
        nextIndex++;
        wake();
      },
      fail(err) { failStream(err); },
      reset() { error = null; pending.clear(); nextIndex = 0; wake(); },
      get failed() { return !!error; },
      get pendingCount() { return pending.size; }
    };
  };

  // Total transfer size estimator based on variant bitrate and running average
  // segment size (self-correcting across variant switches); before the first
  // segment completes, fall back to BANDWIDTH x Σ EXTINF; else indeterminate.
  UVP.Download.estimateTotalBytes = function(o) {
    const bytesDone = (o && o.bytesDone) || 0;
    const completed = (o && o.completedSegments) || 0;
    const total = (o && o.totalSegments) || 0;
    const bw = (o && o.bandwidthBps) || 0;
    const dur = (o && o.totalDurationSec) || 0;
    if (total > 0 && completed > 0 && completed < total) {
      return Math.round(bytesDone + (bytesDone / completed) * (total - completed));
    }
    if (bw > 0 && dur > 0) return Math.round((bw / 8) * dur);
    return 0;
  };
  UVP.Download.fmtMb = function(bytes) { return (bytes / 1048576).toFixed(1) + ' MB'; };

  // Monotonic byte-based progress tracker with smoothed transfer rate and ETA
  // percent (froze for minutes on 14x100MB jobs, then jumped ~7% per segment)
  // and the segments/sec ETA. Percent never moves backwards (refresh phases
  // used to fake 99% and then drop); UI paints are throttled (~250ms); speed
  // is a byte rate recomputed at most 1/s with the last value persisting.
  UVP.Download.createProgressTracker = function(opts) {
    const updateUI = opts.updateUI;
    const getBytes = opts.getBytes;
    const getCompletedSegments = opts.getCompletedSegments;
    const getTotalSegments = opts.getTotalSegments;
    const getBandwidth = opts.getBandwidth || (() => 0);
    const getTotalDuration = opts.getTotalDuration || (() => 0);
    const now = opts.now || Date.now;
    const throttleMs = opts.throttleMs || 250;
    // Optional settled-bytes getter (bytesDone EXCLUDING in-flight deltas).
    // The total-size extrapolation must divide settled bytes by completed
    // segments — including in-flight bytes inflates the running average and
    // drags the estimate above reality mid-flight.
    const getSettledBytes = opts.getSettledBytes || null;
    let lastPercent = 0;
    let lastPaintAt = 0;
    let lastSpeedBytes = 0;
    let lastSpeedAt = now();
    let speedBps = 0;
    function compute() {
      const bytes = getBytes();
      const completed = getCompletedSegments();
      const total = getTotalSegments();
      const estimate = UVP.Download.estimateTotalBytes({
        bytesDone: (getSettledBytes ? getSettledBytes() : bytes), completedSegments: completed, totalSegments: total,
        bandwidthBps: getBandwidth(), totalDurationSec: getTotalDuration()
      });
      let percent = 0;
      if (estimate > 0) percent = Math.min(99, Math.round((bytes / estimate) * 100));
      if (percent < lastPercent) percent = lastPercent; // monotonic — never jump backwards
      lastPercent = percent;
      return { bytes, percent, estimate };
    }
    function paint(info, suffix) {
      const t = now();
      if (info.bytes > 0 && t - lastSpeedAt >= 1000) {
        const bps = (info.bytes - lastSpeedBytes) / ((t - lastSpeedAt) / 1000);
        lastSpeedAt = t; lastSpeedBytes = info.bytes;
        if (bps > 0) speedBps = bps;
      }
      let text;
      if (info.estimate > 0) {
        text = info.percent + '% · ' + UVP.Download.fmtMb(info.bytes);
        if (speedBps > 0) {
          text += ' · ' + (speedBps / 1048576).toFixed(1) + ' MB/s';
          if (info.estimate > info.bytes) text += ' · ~' + Math.max(1, Math.ceil((info.estimate - info.bytes) / speedBps)) + 's';
        }
      } else {
        // Indeterminate total: honest MB counter instead of a fake percent.
        text = UVP.Download.fmtMb(info.bytes);
      }
      if (suffix) text = suffix + ' (' + info.percent + '%)';
      updateUI(info.percent, text);
    }
    return {
      tick(suffix, force) {
        const t = now();
        const info = compute();
        if (force || t - lastPaintAt >= throttleMs) { lastPaintAt = t; paint(info, suffix || null); }
      },
      phase(text) { lastPaintAt = now(); paint(compute(), text); },
      percent() { return lastPercent; }
    };
  };

  // Multi-pass segmented HLS download engine with automatic manifest refresh and segment retry.
  UVP.Download.processDownloadJob = async function(job, updateUI) {
    const total = job.segments.length;
    const scope = job.scope;
    let currentIndex = 0;
    const failedSegments = new Set();
    // Segments that genuinely failed to FETCH/DECRYPT/STORE (as opposed to
    // segments abandoned because the streaming gate was already poisoned).
    // Drives the "all failed → skip primary refresh" verdict: in streaming
    // mode resetOutputStream() marks every segment failed, so failedSegments
    // alone can no longer express that distinction (see refreshManifest).
    const realFailures = new Set();
 
    // Set up streaming file handle if available (pre-created by handleSaveAction)
    if (job.fileHandle) {
      try {
        job.fileWritable = await job.fileHandle.createWritable();
        if (DEBUG) console.log('[UVP] Streaming download: writing directly to file handle');
      } catch (e) {
        console.warn('[UVP] File handle createWritable failed, falling back to IndexedDB:', e);
        job.fileHandle = null;
        job.fileWritable = null;
      }
    }
 
    // Byte-accurate progress accounting: tracks verified disk writes
    // in-flight segment reports fetch deltas (segLoaded) so the bar moves
    // continuously even for 100MB segments instead of freezing then jumping.
    let inFlightBytes = 0;
    const segLoaded = new Map(); // segment index -> bytes fetched so far
    const tracker = UVP.Download.createProgressTracker({
      updateUI,
      getBytes: () => (job.bytesDone || 0) + inFlightBytes,
      getSettledBytes: () => (job.bytesDone || 0),
      getCompletedSegments: () => Math.max(0, job.completed.size - (job.completed.has('init') ? 1 : 0)),
      getTotalSegments: () => total,
      getBandwidth: () => job.bandwidth || 0,
      getTotalDuration: () => job.totalDuration || 0,
    });

    // Sequential write gate: ensures segments are written strictly in playlist order
    // On any completed-set invalidation (variant switch / key change / init
    // change / pre-retry hole-filling) the writable is swapped for a fresh
    // one: per the File System Access spec the aborted writable's temp data
    // is discarded and the new one starts empty at cursor 0 — truncate(0)
    // would NOT reset the write cursor and would zero-pad a gap. Byte
    // accounting and the completed set reset with it; failedSegments is
    // repopulated so the retry pass re-downloads everything into the clean
    // stream (a mid-file hole can never be filled by appending).
    const streamWriter = job.fileWritable ? UVP.Download.createOrderedStreamWriter((chunk) => job.fileWritable.write(chunk)) : null;
    // Cancel must unblock the ordered gate: workers parked in write() poll
    // every 25ms and would never observe the aborted scope otherwise — the
    // gate previously deadlocked on both cancel and any segment failure.
    if (streamWriter && scope && typeof scope.onAbort === 'function') scope.onAbort(() => { try { streamWriter.fail(new Error('cancelled')); } catch (e) {} });
    async function resetOutputStream() {
      if (job.fileWritable) {
        try { await job.fileWritable.abort(); } catch (e) {}
        try { job.fileWritable = await job.fileHandle.createWritable(); }
        catch (e) {
          console.warn('[UVP] Streaming writable re-create failed:', e);
          job.fileWritable = null; job.fileHandle = null;
          throw new Error('streaming output lost after manifest refresh - download aborted');
        }
      }
      if (streamWriter) streamWriter.reset();
      job.bytesDone = 0;
      inFlightBytes = 0; segLoaded.clear();
      job.completed.clear();
      for (let i = 0; i < total; i++) failedSegments.add(i);
    }

    // A3: download init segment (shared function)
    if (await UVP.Download.downloadInitSegment(job) === false) { await UVP.Download.abortJobWritable(job); return false; }
 
    // Fetches and decrypts a single HLS segment with exponential backoff and Range-resume.
    async function downloadSegment(i, maxRetries) {
      if (job.completed.has(i)) return true;
      if (scope && !scope.check()) return false;
      let headers = {};
      if (job.segments[i].byteRange) { const br = job.segments[i].byteRange; headers['Range'] = `bytes=${br.offset}-${br.offset + br.length - 1}`; }
      // Segment progress feed: updates byte counter monotonically as chunks arrive
      // into job.bytesDone on completion — settleProgress is idempotent).
      segLoaded.set(i, 0);
      const settleProgress = () => {
        if (!segLoaded.has(i)) return;
        inFlightBytes -= segLoaded.get(i) || 0;
        if (inFlightBytes < 0) inFlightBytes = 0;
        segLoaded.delete(i);
      };
      const onSegProgress = (loaded) => {
        const prev = segLoaded.get(i) || 0;
        segLoaded.set(i, loaded);
        inFlightBytes += Math.max(0, loaded - prev);
        tracker.tick();
      };
      // Poison the ordered stream gate whenever this index will never be
      // written. The gate writes strictly in order with no skip notion, so a
      // failed segment that silently skipped its write froze nextIndex
      // forever — every higher-index worker deadlocked in its 25ms poll,
      // Promise.all(workers) never settled, and the whole manifest-refresh /
      // retry pass below was unreachable dead code.
      const poison = (cause) => { if (streamWriter) streamWriter.fail(cause instanceof Error ? cause : new Error('segment ' + i + ' failed')); };
      let chunkData = null;
      try {
        chunkData = await UVP.Network.requestCrossOriginWithRetry(job.segments[i].url, 'arraybuffer', onSegProgress, headers, maxRetries !== undefined ? maxRetries : CONFIG.segMaxRetries, CONFIG.segTimeoutMs, scope);
        if (!chunkData || !chunkData.byteLength) throw new Error('empty segment response');
        const segmentKeyInfo = job.segments[i].keyInfo;
        if (segmentKeyInfo) {
          chunkData = await (async () => {
            try {
              const segmentKey = await UVP.Download.getHlsCryptoKey(job.keyCache, segmentKeyInfo, scope);
              const segmentIv = UVP.Utils.ivFromHex(segmentKeyInfo.iv) || UVP.Utils.ivFromSequence(job.segments[i].sequence);
              return await crypto.subtle.decrypt({ name: 'AES-CBC', iv: segmentIv }, segmentKey, chunkData);
            }
            catch (e) {
              console.warn(`[UVP] Decrypt failed for segment ${i + 1}/${total}`);
              job.keyCache.delete(segmentKeyInfo.uri);
              realFailures.add(i);
              poison(e);
              settleProgress();
              return null;
            }
          })();
          if (!chunkData) return false;
        }
      } catch (err) {
        if (DEBUG) console.warn(`[UVP] Segment ${i + 1}/${total} failed:`, err && err.message ? err.message : err);
        realFailures.add(i); // genuine fetch/decrypt failure → counts toward the "all failed" refresh verdict
        poison(err);
        settleProgress();
        return false;
      }
      settleProgress();
      // P4/P5: bytes counted at fetch completion; in-flight deltas were
      // tracked per segment and are folded in here (no double counting).
      job.bytesDone = (job.bytesDone || 0) + chunkData.byteLength;
      if (scope && !scope.check()) return false; // cancel hook already poisoned the gate
      if (streamWriter) {
        try {
          // Streaming mode: playlist-order write gate (workers complete out
          // of order; completion-order writes transposed moof/mdat atoms).
          await streamWriter.write(i, chunkData);
        } catch (wErr) {
          // The gate is already poisoned (disk error, cancel, or a peer
          // segment's failure) — NOT a fetch failure, so it must not count
          // toward the all-failed refresh verdict.
          return false;
        }
      } else {
        try { await UVP.State.dbPut(UVP.Download.segKey(job, i), chunkData); }
        catch (putErr) {
          realFailures.add(i);
          if (DEBUG) console.warn(`[UVP] Segment ${i + 1}/${total} storage failed:`, putErr && putErr.message ? putErr.message : putErr);
          return false;
        }
      }
      if (scope && !scope.check()) return false;
      job.completed.add(i);
      UVP.Download.saveJobMeta(job);
      tracker.tick();
      return true;
    }
 
    function sameHlsKey(a, b) {
      return (!a && !b) || (!!a && !!b && a.uri === b.uri && a.iv === b.iv);
    }
 
    async function applyParsedEncryption(parsed) {
      job.isEncrypted = parsed.isEncrypted;
      job.keyInfo = parsed.keyInfo;
      job.initKeyInfo = parsed.initKeyInfo;
      job.keyUri = parsed.keyInfo ? parsed.keyInfo.uri : null;
      job.iv = UVP.Utils.ivFromHex(parsed.keyInfo && parsed.keyInfo.iv);
      if (parsed.keyInfo) {
        try { job.key = await UVP.Download.getHlsCryptoKey(job.keyCache, parsed.keyInfo, scope); }
        catch (e) { job.key = null; console.warn('[UVP] Key refresh failed:', e); }
      } else {
        job.key = null;
      }
    }
 
    async function applyRefreshedManifest(parsed, source, isVariantSwitch) {
      if (!parsed || !parsed.segments.length) return false;
      // Only accept manifests whose segment count exactly matches the original total.
      // This preserves the original quality-fallback behaviour and prevents mapping
      // a shifted playlist onto the wrong segment indices.
      if (parsed.segments.length !== total) {
        console.warn(`[UVP] Refreshed manifest segment count differs (${parsed.segments.length} vs ${total}); treating refresh as failed.`);
        return false;
      }
      // Change K: For primary refresh, detect stale refresh where all segment URLs
      // are identical to the current ones (CDN returned same signed URLs that already
      // failed). Return false so refreshManifest falls through to variant fallback.
      if (source === 'primary' && !isVariantSwitch) {
        let allSame = true;
        for (let i = 0; i < total; i++) {
          const oldUrl = job.segments[i] ? job.segments[i].url : null;
          const newUrl = parsed.segments[i] ? parsed.segments[i].url : null;
          if (newUrl !== oldUrl) { allSame = false; break; }
        }
        if (allSame) {
          console.warn('[UVP] Primary refresh returned identical segment URLs (stale); falling through to variants');
          return false;
        }
      }
      const initKeyChanged = !sameHlsKey(job.initKeyInfo, parsed.initKeyInfo);
      // Change M: On variant switch, clear ALL completed segments so the entire
      // video is re-downloaded at the new quality (prevents mixed-quality output).
      if (isVariantSwitch) {
        for (let i = 0; i < total; i++) {
          if (job.completed.has(i)) job.completed.delete(i);
          failedSegments.add(i);
        }
      }
      for (let i = 0; i < total; i++) {
        if (parsed.segments[i]) {
          // If this segment's key changed, invalidate its cached data so it is re-downloaded.
          if (job.segments[i] && !sameHlsKey(job.segments[i].keyInfo, parsed.segments[i].keyInfo)) {
            if (job.completed.has(i)) {
              job.completed.delete(i);
              failedSegments.add(i);
            }
          }
          job.segments[i] = parsed.segments[i];
        }
      }
      await applyParsedEncryption(parsed);
      // Refresh init segment if its URL, byte range, or encryption key changed.
      if (parsed.initSegmentUrl !== job.initSegmentUrl || initKeyChanged) {
        job.initSegmentUrl = parsed.initSegmentUrl;
        job.initByteRange = parsed.initByteRange;
        job.completed.delete('init');
      }
      job.startSeq = parsed.startSeq;
      job.segSig = UVP.Download.computeSegmentSignature(parsed.segments, parsed.startSeq); // keep the resume fingerprint in sync with the live segment list
      if (parsed.totalDuration) job.totalDuration = parsed.totalDuration; // Update stream duration estimate
      console.log(`[UVP] Manifest refreshed (${source}) with fresh segment URLs`);
      return true;
    }
 
    // Refreshes manifest to obtain fresh segment tokens on expiration or 403.
    async function refreshManifest(firstPassAllFailed) {
      // Change L: If ALL segments failed in the first pass, skip the primary
      // re-resolve entirely (it would return the same stale URLs that already
      // failed) and go straight to variant fallback. The caller passes the
      // pre-reset verdict: in streaming mode resetOutputStream() marks every
      // segment failed BEFORE this runs, so the live failedSegments.size can
      // no longer distinguish "all failed" from "any failed" — using it here
      // would skip the primary refresh on every streaming retry and force an
      // unnecessary lower-quality variant switch.
      const allFailed = (firstPassAllFailed !== undefined)
        ? !!firstPassAllFailed
        : failedSegments.size >= total;
      if (!allFailed) {
      // Try re-resolving from the original URL (handles master → media playlist)
      try {
        tracker.phase('Refreshing manifest...'); // Refresh manifest without resetting progress baseline
        const { mediaUrl, manifest } = await UVP.Download.resolveToMediaPlaylist(job.originalUrl || job.url, scope);
        if (scope && !scope.check()) throw new Error('cancelled');
        const parsed = UVP.Download.parseSegments(manifest, mediaUrl);
        if (await applyRefreshedManifest(parsed, 'primary')) return true;
      } catch (e) { console.warn('[UVP] Manifest refresh failed:', e); }
      // Cache-buster retry: if primary refresh returned stale URLs, try
      // appending a cache-buster to force the CDN to issue fresh signed URLs
      // before falling back to lower-quality variants.
      try {
        if (scope && !scope.check()) throw new Error('cancelled');
        // URL-API based cache-buster: the old .replace(/([?&])_t=\d+/, '') left
        // a dangling '?'/'&' when _t sat mid-query, producing a malformed URL.
        let bustUrl = job.originalUrl || job.url;
        try {
          const bustU = new URL(bustUrl);
          bustU.searchParams.delete('_t');
          bustU.searchParams.set('_t', String(Date.now()));
          bustUrl = bustU.href;
        } catch (urlErr) {
          bustUrl = bustUrl.replace(/([?&])_t=\d+/, '') + (bustUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
        }
        tracker.phase('Refreshing (cache-bust)...');
        const { mediaUrl: bustMediaUrl, manifest: bustManifest } = await UVP.Download.resolveToMediaPlaylist(bustUrl, scope);
        if (scope && !scope.check()) throw new Error('cancelled');
        const bustParsed = UVP.Download.parseSegments(bustManifest, bustMediaUrl);
        if (await applyRefreshedManifest(bustParsed, 'cache-bust')) return true;
      } catch (e) { if (DEBUG) console.warn('[UVP] Cache-bust manifest refresh failed:', e); }
      } else {
        console.warn('[UVP] All segments failed first pass — skipping primary refresh, trying variants directly');
      }

      // Switches to lower-bitrate variant manifest if primary segment stream fails.
      if (job.variants && job.variants.length > 1) {
        for (let v = 1; v < job.variants.length; v++) {
          try {
            if (scope && !scope.check()) throw new Error('cancelled');
            tracker.phase(`Trying variant ${v + 1}/${job.variants.length}...`);
            const altManifest = await UVP.Network.requestCrossOriginWithRetry(job.variants[v], 'text', null, {}, 3, CONFIG.manifestTimeoutMs, scope);
            const parsed = UVP.Download.parseSegments(altManifest, job.variants[v]);
            if (await applyRefreshedManifest(parsed, `variant ${v + 1}/${job.variants.length}`, true)) {
              console.warn(`[UVP] Switched to alternate quality variant ${v + 1}/${job.variants.length}`);
              job.bandwidth = 0; // Reset variant bandwidth; fallback to running average
              return true;
            }
          } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
        }
      }
      return false;
    }
 
    // Tracks segment successes and failures for the second-pass recovery pass.
    async function worker() {
      while (currentIndex < total) {
        if (scope && !scope.check()) return;
        // Gate poisoned by an earlier failure/cancel — remaining segments
        // cannot be written to the stream; the retry pass restarts a fresh
        // stream incarnation instead of deadlocking here.
        if (streamWriter && streamWriter.failed) return;
        const i = currentIndex++;
        if (job.completed.has(i)) continue;
        const ok = await downloadSegment(i, CONFIG.segMaxRetries);
        if (!ok) failedSegments.add(i);
        // Accumulate committed segment bytes into total written counter
        if (scope && !scope.check()) return;
        // Throttled monotonic UI updates with speed and ETA formatting
        tracker.tick();
      }
    }
 
    // First pass: download all segments concurrently
    const workers = [];
    for (let w = 0; w < CONFIG.maxConcurrentDownloads; w++) workers.push(worker());
    await Promise.all(workers);
    if (scope && !scope.check()) { await UVP.Download.abortJobWritable(job); return null; } // cancelled

    // Second-pass recovery: refreshes manifest tokens and retries failed segments.
    if (failedSegments.size > 0) {
      // Capture the first-pass failure scope BEFORE the streaming reset below
      // invalidates the whole completed set. Use realFailures (genuine
      // fetch/decrypt/store failures) — failedSegments also contains indices
      // abandoned only because the poisoned stream gate rejected their write,
      // which would fake an "all failed" verdict and skip the primary refresh.
      const firstPassAllFailed = realFailures.size >= total;
      // Sequential integrity check: validates complete segment series before finalizing
      // stream incarnation re-downloads everything in order (pass-1 bytes are
      // discarded with the aborted writable; the picked file is only
      // committed on close, so nothing partial is ever shipped).
      if (streamWriter) await resetOutputStream();
      tracker.phase(`Retrying ${failedSegments.size} failed...`);
      console.warn(`[UVP] ${failedSegments.size} segment(s) failed first pass — refreshing manifest...`);
      const refreshed = await refreshManifest(firstPassAllFailed);

 
      // A3: re-download init segment if invalidated by manifest refresh
      if (await UVP.Download.downloadInitSegment(job) === false) { await UVP.Download.abortJobWritable(job); return false; }
 
      // Retry failed segments concurrently with fresh URLs from a successful refresh
      if (refreshed) {
        const retryQueue = [...failedSegments].filter(i => !job.completed.has(i));
        let retryIndex = 0;
        async function retryWorker() {
          while (retryIndex < retryQueue.length) {
            if (scope && !scope.check()) return;
            // Gate poisoned mid-retry — fail-don't-ship below will abort.
            if (streamWriter && streamWriter.failed) return;
            const i = retryQueue[retryIndex++];
            if (job.completed.has(i)) { failedSegments.delete(i); continue; }
            const ok = await downloadSegment(i, CONFIG.segMaxRetries);
            if (ok) failedSegments.delete(i);
            // Throttled UI progress tick with active retry indication
            // long second-pass retries don't look stuck.
            tracker.tick(`retry ${retryIndex}/${retryQueue.length}`);
          }
        }
        const retryWorkers = [];
        for (let w = 0; w < CONFIG.maxConcurrentDownloads; w++) retryWorkers.push(retryWorker());
        await Promise.all(retryWorkers);
        if (scope && !scope.check()) { await UVP.Download.abortJobWritable(job); return null; }
        if (failedSegments.size === 0) console.log('[UVP] All failed segments recovered after manifest refresh');
        else console.warn(`[UVP] ${failedSegments.size} segment(s) still failed after manifest refresh`);
      } else {
        console.error('[UVP] Manifest refresh failed — cannot retry with stale URLs. Proceeding with partial download.');
      }
    }

    // Check if we have any usable data
    const segCompleted = [...job.completed].filter(x => x !== 'init').length;
    if (segCompleted === 0) {
      console.error('[UVP] No segments downloaded successfully');
      await UVP.Download.abortJobWritable(job);
      await UVP.Download.cleanupDownloadIfCurrent(job);
      return false;
    }
 
    if (failedSegments.size > 0) {
      // Strict file integrity check: aborts if critical media boxes or segments are missing
      // stalls every player — saving a gapped file wastes a multi-GB
      // transfer. Variant fallback already ran; unrecoverable = abort.
      console.error(`[UVP] ${failedSegments.size} segment(s) unrecoverable — aborting instead of saving a gapped file`);
      await UVP.Download.abortJobWritable(job);
      await UVP.Download.cleanupDownloadIfCurrent(job);
      updateUI(100, failedSegments.size + ' segments failed');
      try { UVP.Overlay.showToast(`Download failed: ${failedSegments.size} segment(s) unrecoverable`); } catch (e) {}
      return false;
    }
 
    // Merge / Save
    if (scope && !scope.check()) return null;
    const isTs = job.container === 'ts';
    const mimeType = isTs ? 'video/mp2t' : 'video/mp4';
    const ext = isTs ? '.ts' : '.mp4';
    const finalFilename = job.filename;

    // Path 1: Streaming file handle — segments were written directly to file
    // during download. Just close the writable.
    if (job.fileWritable) {
      try {
        updateUI(100, "Saving...");
        await job.fileWritable.close();
        job.fileWritable = null;
        job.fileHandle = null;
        await UVP.Download.cleanupDownload(job);
        return true;
      } catch (wErr) {
        console.error('[UVP] Streaming file save failed:', wErr);
        try { if (job.fileWritable) await job.fileWritable.abort(wErr); } catch (e2) {}
        job.fileWritable = null;
        job.fileHandle = null;
        // Streaming mode wrote init + every segment directly to this file —
        // IndexedDB is EMPTY for this job, so the merge below can only produce
        // "No data to merge" and then cleanup would destroy any chance of a
        // retry. Fail loudly with the real cause instead.
        await UVP.Download.cleanupDownload(job);
        updateUI(100, 'Save failed');
        try { UVP.Overlay.showToast('Save failed: the browser could not finish writing the file (disk full, permission lost, or file locked). Streamed bytes cannot be recovered — please retry.'); } catch (e) {}
        return false;
      }
    }

    // Path 2: IndexedDB merge (no streaming handle)
    updateUI(100, "Merging...");
    // Merge helper: writes the init segment (if any) + all chunks in order,
    // reading IndexedDB with a bounded prefetch window — much faster than
    // one-at-a-time reads for large segment counts, and shared by both merge
    // paths below.
    // HARD completeness gate (fail-don't-ship, same policy as the segment
    // pass): a missing/failed read previously slipped through `if (chunk)`
    // and silently shipped a gapped file (e.g. after a cross-tab wipe or
    // browser storage eviction). Any shortfall now aborts the merge loudly.
    async function mergeInto(write) {
      if (job.initSegmentUrl) {
        const initData = await UVP.State.dbGet(UVP.Download.segKey(job, 'init'));
        if (!initData) throw new Error('init segment missing from IndexedDB');
        await write(initData);
      }
      // Dynamic concurrency window: adapts connection count to segment sizes and host limits
      // 14 x ~100MB) must not hold the whole video in RAM during merge;
      // many-small-segment playlists (Pornhub) prefetch aggressively.
      const PREFETCH = total > 60 ? 8 : 3;
      const inflight = [];
      let next = 0;
      const fill = () => { while (next < total && inflight.length < PREFETCH) { const idx = next++; inflight.push(UVP.State.dbGet(UVP.Download.segKey(job, idx)).then((chunk) => ({ idx, chunk }), () => ({ idx, chunk: null }))); } };
      fill();
      const missing = [];
      let written = 0;
      while (inflight.length) {
        const { idx, chunk } = await inflight.shift();
        fill();
        if (chunk) { await write(chunk); written++; }
        else missing.push(idx);
      }
      if (missing.length) throw new Error('IndexedDB merge incomplete: ' + missing.length + ' of ' + total + ' segment(s) missing (first: ' + missing.slice(0, 5).join(', ') + (missing.length > 5 ? ', …' : '') + ') — store may have been wiped by another tab or evicted by the browser');
    }
    try {
      // 1. Modern low-memory streaming merge (Chrome/Edge/Opera).
      // NOTE: showSaveFilePicker requires *transient* user activation — for
      // long downloads the activation from the Save click has already expired
      // and the call rejects (NotAllowedError/SecurityError). Previously any
      // picker failure fell into the catch below, which deleted every chunk
      // and reported "Error" — the whole download was lost. Now only a user
      // Cancel (AbortError) is treated as a real cancel; any other picker
      // failure falls through to the in-memory blob merge (path 2).
      if (window.showSaveFilePicker) {
        let handle = null;
        try {
          handle = await window.showSaveFilePicker({
            suggestedName: finalFilename,
            types: [{ description: 'Video File', accept: { [mimeType]: [ext] } }]
          });
        } catch (pickErr) {
          if (pickErr && pickErr.name === 'AbortError') {
            // User cancelled the Save As dialog — a real cancel.
            console.error('[UVP] Save As cancelled by user:', pickErr);
            await UVP.Download.cleanupDownloadIfCurrent(job);
            return false;
          }
          console.warn('[UVP] showSaveFilePicker rejected (' + (pickErr && pickErr.name) + ') — falling back to in-memory merge');
          handle = null;
        }
        if (handle) {
          const writable = await handle.createWritable();
          try {
            await mergeInto((c) => writable.write(c));
            await writable.close();
          } catch (wErr) {
            try { await writable.abort(wErr); } catch (e2) {}
            throw wErr;
          }
          await UVP.Download.cleanupDownload(job);
          return true;
        }
      }
      // 2. In-memory blob merge (Firefox/Safari/mobile, and Chrome/Edge when
      //    the File System Access picker rejects — expired user activation,
      //    permission denied, or enterprise policy).
      const chunks = [];
      await mergeInto((c) => { chunks.push(c); });
      if (chunks.length === 0) throw new Error('No data to merge');
      const blob = new Blob(chunks, { type: mimeType });
      UVP.Download.downloadBlob(blob, finalFilename);
      await UVP.Download.cleanupDownload(job);
      return true;
    } catch (err) {
      // Catches memory limits in the blob merge, missing-chunk aborts from
      // mergeInto, and blob download failures. Save As user-cancel
      // (AbortError) is handled above and must not reach here.
      console.error('[UVP] Merge failed:', err);
      updateUI(100, 'Merge failed');
      try { UVP.Overlay.showToast('Download failed at merge: ' + (err && err.message ? err.message : err)); } catch (e) {}
      await UVP.Download.cleanupDownload(job);
      return false;
    }
  }
 
 
  // HLS download entrypoint: manages filesystem streaming handle and fallback merge.
  UVP.Download.downloadHLS = async function(m3u8Url, filename, updateUI, scope, fileHandle) {
    scope = scope || UVP.Cancel.createScope();
    updateUI(2, "Parsing...");
    // No full-store clear here anymore: chunks are namespaced by jobId, so a
    // fresh job cannot collide with leftovers — and a blanket clear raced
    // other tabs' active downloads. Orphan sweeps handle dead-job residue.
    await UVP.State.awaitPendingDbClear();
    let job = null;
    try {
      // Update Save button label with current download phase status
      // "Parsing..." while the manifest chain retries (PMV Haven).
      const onPhase = (txt) => { try { updateUI(2, txt); } catch (e) {} };
      try {
        job = await UVP.Download.buildJob(m3u8Url, filename, scope, onPhase);
      } catch (parseErr) {
        // The primary m3u8 can be stale, expired, or belong to an ad/embed
        // captured by network interception. Before failing, retry with other
        // SAME-HOST HLS URLs captured on the page (cross-host URLs would
        // silently switch to a different video — reject those).
        if (scope && !scope.check()) throw parseErr;
        if (!/\.m3u8([?#]|$)/i.test(m3u8Url)) throw parseErr;
        let origHost;
        try { origHost = new URL(m3u8Url).hostname; } catch (e) { throw parseErr; }
        const alternates = [...capturedUrls].filter(u => {
          if (u === m3u8Url || !/\.m3u8([?#]|$)/i.test(u)) return false;
          try {
            const h = new URL(u).hostname;
            return h === origHost || h.endsWith('.' + origHost) || origHost.endsWith('.' + h);
          } catch (e) { return false; }
        }).slice(0, CONFIG.maxManifestRetries);
        if (!alternates.length) throw parseErr;
        console.warn(`[UVP] ${parseErr && parseErr.message ? parseErr.message : parseErr} — retrying with ${alternates.length} alternate same-host m3u8 URL(s)`);
        let lastErr = parseErr;
        for (let altIdx = 0; altIdx < alternates.length; altIdx++) {
          const alt = alternates[altIdx];
          if (scope && !scope.check()) throw new Error('cancelled');
          onPhase(`Retrying alternate ${altIdx + 1}/${alternates.length}...`);
          try { job = await UVP.Download.buildJob(alt, filename, scope, onPhase); break; }
          catch (e) { lastErr = e; }
        }
        if (!job) throw lastErr;
      }
      currentDownloadJob = job;
      currentDownloadScope = job.scope || null;
      if (fileHandle) job.fileHandle = fileHandle;
      UVP.State.registerActiveJob(job.jobId);
      UVP.Download.saveJobMeta(job, true);
      return await UVP.Download.processDownloadJob(job, updateUI);
    } catch (e) {
      console.error('[UVP] HLS download failed:', e);
      if (job && job.fileWritable) { try { await job.fileWritable.abort(e); } catch (e2) {} job.fileWritable = null; }
      if (job && job.fileHandle) { job.fileHandle = null; }
      await UVP.Download.cleanupDownload(job || currentDownloadJob);
      return false;
    }
  }
 
  // Resumes partial HLS download from committed segments.
  // preMeta: optionally pass an already-parsed meta (maybeResumeDownload reads
  // it BEFORE its scope swap, which would otherwise let the cancel handler
  // delete the meta out from under the resume).
  UVP.Download.resumeDownload = async function(updateUI, scope, preMeta) {
    scope = scope || UVP.Cancel.createScope();
    let meta = preMeta || null;
    if (!meta) {
      let raw = null;
      try { raw = sessionStorage.getItem('uvp-dl-job'); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
      if (!raw) return false;
      try { meta = JSON.parse(raw); } catch (e) { await UVP.Download.cleanupDownload(); return false; }
    }
    if (!meta || !meta.url) { await UVP.Download.cleanupDownload(); return false; }
    try {
      updateUI(2, "Resuming...");
      await UVP.State.awaitPendingDbClear();
      const job = await UVP.Download.buildJob(meta.originalUrl || meta.url, meta.filename || 'video.mp4', scope, (txt) => { try { updateUI(2, txt); } catch (e) {} });
      // Resume into the ORIGINAL job's IndexedDB namespace — that is where its
      // chunks were written.
      if (meta.jobId) job.jobId = meta.jobId;
      currentDownloadJob = job;
      currentDownloadScope = job.scope || null;
      UVP.State.registerActiveJob(job.jobId);
      // Streaming mode resume check: validates committed segments against manifest
      // picked file, which a resumed session cannot reopen) — fresh download.
      const completed = new Set(meta.mode === 'stream' ? [] : (meta.completed || []));
      if (completed.size) {
        // Guard A — playlist identity: persisted indices are positional. If
        // the manifest was reordered/rebuilt (or the media sequence shifted)
        // since the original run, an old index now maps to DIFFERENT bytes —
        // merging it would splice corrupt media mid-file. Restart from scratch.
        const sigMismatch = !!(meta.segSig && job.segSig && meta.segSig !== job.segSig);
        const seqShift = (typeof meta.startSeq === 'number' && typeof job.startSeq === 'number') && meta.startSeq !== job.startSeq;
        if (sigMismatch || seqShift) {
          console.warn('[UVP] Resumed playlist no longer matches the persisted download (signature/sequence changed) — restarting from scratch');
          completed.clear();
          await UVP.State.dbClearJob(job.jobId);
        } else {
          // Guard B — storage reality: partial wipes (unload races, browser
          // eviction, cross-tab TTL pruning) can vanish chunks the meta still
          // claims are done. Completed-but-missing indices are re-fetched.
          const presentKeys = await UVP.State.getJobKeys(job.jobId);
          if (!presentKeys) {
            completed.clear(); // store unreadable — safest is a full restart
          } else {
            for (const idx of [...completed]) {
              if (!presentKeys.has(UVP.Download.segKey(job, idx))) completed.delete(idx);
            }
          }
        }
      }
      job.completed = completed;
      return await UVP.Download.processDownloadJob(job, updateUI);
    } catch (e) {
      console.error('[UVP] Resume failed:', e);
      await UVP.Download.cleanupDownload(currentDownloadJob);
      return false;
    }
  }
 
  UVP.Download.downloadBlob = function(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.style.display = 'none'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, CONFIG.blobRevokeDelayMs); }
  UVP.Download.resetButton = function(saveBtn) { state.isDownloading = false; state.downloadPercent = 0; state.downloadText = 'Save'; if (!saveBtn && state.overlay) saveBtn = state.overlay.shadowRoot.querySelector('.uvp-save'); if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; saveBtn.style.background = ''; } const track = state.overlay ? state.overlay.shadowRoot.querySelector('.uvp-progress-track') : null; const fill = state.overlay ? state.overlay.shadowRoot.querySelector('.uvp-progress-fill') : null; if (track) track.style.opacity = '0'; if (fill) fill.style.width = '0%'; }
  UVP.Download.endDownload = function(saveBtn, context) { UVP.Download.resetButton(saveBtn); if (UVP.StateMachine.is('DOWNLOADING') && UVP.StateMachine.can('PLAYING') && state.overlay) { UVP.StateMachine.transition('PLAYING', context || 'endDownload'); } }
  UVP.Download.makeUpdateUI = function() { return (percent, text) => { state.downloadPercent = percent; state.downloadText = text; const overlay = state.overlay; if (!overlay) return; const saveBtn = overlay.shadowRoot.querySelector('.uvp-save'); const fill = overlay.shadowRoot.querySelector('.uvp-progress-fill'); const track = overlay.shadowRoot.querySelector('.uvp-progress-track'); if (track) track.style.opacity = '1'; if (fill) fill.style.width = `${percent}%`; if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = text; saveBtn.style.cursor = 'pointer'; } }; }
 
  // ==================== DOWNLOAD EVENT LISTENERS ====================
  UVP.Events.on('download:cancel', async (payload) => {
    // maybeResumeDownload swaps scopes deliberately; that cancel must not
    // destroy the meta/IndexedDB chunks the imminent resume depends on.
    if (UVP.Download._skipCancelCleanup) return;
    const canceledJob = payload && payload.job;
    await UVP.Download.cleanupDownload(canceledJob || null);
    if (!state.isDownloading) UVP.Download.resetButton(null);
  });


    // yt-dlp http.py-style streaming save: pipes the network response straight
  // into a user-picked file via showSaveFilePicker (the picker opens while the
  // Save click's transient activation is still fresh - BEFORE the transfer).
  // Zero RAM cost for any file size. One yt-dlp-style Range resume attempt is
  // made when the transport dies mid-transfer (Range + 206 validation;
  // a server that ignores Range and answers 200 forces a clean restart).
  UVP.Download.streamSaveFromNetwork = async function(url, filename, mimeType, updateUI, scope) {
    if (typeof window === 'undefined' || !window.showSaveFilePicker || typeof fetch !== 'function') return null; // caller falls back
    const extMatch = filename.match(/\.([a-z0-9]{2,5})$/i);
    const ext = extMatch ? extMatch[1] : 'mp4';
    let handle = null;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Media File', accept: { [mimeType || 'video/mp4']: ['.' + ext] } }]
      });
    } catch (pickErr) {
      if (pickErr && pickErr.name === 'AbortError') throw new Error('cancelled'); // user cancelled the Save As dialog
      if (DEBUG) console.warn('[UVP] showSaveFilePicker rejected (' + (pickErr && pickErr.name) + ') - falling back');
      return null; // picker blocked by policy - caller falls back
    }
    if (!handle) return null;
    let bytes = 0;
    let committedBytes = 0;
    const doTransfer = async (writable, resumeFrom) => {
      let first = true;
      let writeChain = Promise.resolve();
      let buffer = [];
      let bufferSize = 0;
      const MAX_BUFFER = 2 * 1024 * 1024; // 2MB batching for faster disk IO

      const flushBuffer = async () => {
        if (buffer.length === 0) return;
        const merged = new Uint8Array(bufferSize);
        let offset = 0;
        for (const c of buffer) { merged.set(c, offset); offset += c.byteLength; }
        const arg = (first && resumeFrom > 0) ? { type: 'write', position: resumeFrom, data: merged } : merged;
        await writable.write(arg);
        committedBytes += merged.byteLength;
        first = false;
        buffer = [];
        bufferSize = 0;
      };

      try {
        const out = await UVP.Network.streamPageContext(url, (chunk, loaded, total) => {
          buffer.push(chunk);
          bufferSize += chunk.byteLength;
          bytes = resumeFrom + loaded;
          if (total > 0) { const p = Math.min(99, Math.round(bytes / (resumeFrom + total) * 100)); updateUI(p, `${p}%`); }
          else updateUI(50, `${(bytes / 1048576).toFixed(1)} MB`);
          if (bufferSize >= MAX_BUFFER) {
            writeChain = writeChain.then(flushBuffer);
            return writeChain; // apply backpressure only on flush
          }
          return Promise.resolve();
        }, resumeFrom > 0 ? { 'Range': `bytes=${resumeFrom}-` } : {}, scope, (res) => {
          if (resumeFrom <= 0) return;
          if (!res || res.status !== 206) throw Object.assign(new Error('resume not honoured (HTTP ' + (res && res.status) + ')'), { rangeRejected: true });
          const value = res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-range') : null;
          if (value) {
            const m = value.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
            if (!m || Number(m[1]) !== resumeFrom) throw Object.assign(new Error('resume Content-Range starts at the wrong offset'), { rangeRejected: true });
          }
        });
        writeChain = writeChain.then(flushBuffer);
        await writeChain;
        return out;
      } catch (e) {
        // Any bytes still in buffer were received but not committed. The next
        // Range request must resume at committedBytes, never at received bytes.
        try { await writeChain; } catch (writeErr) {}
        buffer = []; bufferSize = 0;
        bytes = committedBytes;
        throw e;
      }
    };
    let writable = null;
    try {
      writable = await handle.createWritable();
      try {
        await doTransfer(writable, 0);
      } catch (xferErr) {
        if (xferErr && (xferErr.rangeRejected || xferErr.noStream)) throw xferErr;
        if (scope && !scope.check()) throw xferErr;
        if (committedBytes > 0) {
          console.warn(`[UVP] MP4 stream interrupted at ${committedBytes} committed bytes - attempting Range resume:`, xferErr && xferErr.message);
          try {
            await doTransfer(writable, committedBytes); // resume only from bytes confirmed written
          } catch (resumeErr) {
            if (scope && !scope.check()) throw resumeErr;
            if (resumeErr && resumeErr.rangeRejected) {
              console.warn('[UVP] Range resume was not honored; restarting the file transfer');
              try {
                if (typeof writable.truncate === 'function') await writable.truncate(0);
                if (typeof writable.seek === 'function') await writable.seek(0);
                committedBytes = 0; bytes = 0;
                await doTransfer(writable, 0);
              } catch (restartErr) { throw restartErr; }
            } else {
              console.warn('[UVP] Range resume failed:', resumeErr && resumeErr.message);
              throw resumeErr;
            }
          }
        } else throw xferErr;
      }
      await writable.close();
      updateUI(100, 'Done');
      return { ok: true, bytes };
    } catch (err) {
      if (writable) { try { await writable.abort(); } catch (e) {} }
      if (scope && !scope.check()) throw new Error('cancelled');
      throw err;
    }
  }

  UVP.Download.downloadMP4 = async function(url, filename, updateUI, scope) {
    const saveBtn = state.overlay ? state.overlay.shadowRoot.querySelector('.uvp-save') : null;
    if (scope && !scope.check()) throw new Error('cancelled');

    const manualSaveHint = () => {
      if (scope && !scope.check()) throw new Error('cancelled');
      if (saveBtn) { saveBtn.textContent = 'Right-click video \u2192'; saveBtn.style.background = '#ff8a00'; saveBtn.disabled = false; }
      setTimeout(() => { if (scope.check()) UVP.Download.endDownload(saveBtn, 'mp4 manual'); }, 6000);
      return 'manual';
    };

    const mimeFor = () => (/\.m4a([?#]|$)/i.test(filename) ? 'audio/mp4' : /\.weba(\?|#|$)/i.test(filename) ? 'audio/webm' : /\.webm([?#]|$)/i.test(filename) ? 'video/webm' : 'video/mp4');

    const blobFallback = async () => {
      if (scope && !scope.check()) throw new Error('cancelled');
      try {
        if (saveBtn) saveBtn.textContent = 'Fetching...';
        const info = ytFmtMap.get(url) || {};
        const estimatedTotal = Number(info.contentLength) || (info.bitrate && info.approxDurationMs ? Math.round(info.bitrate * (info.approxDurationMs / 1000) / 8) : 0);
        const buf = await UVP.Network.requestCrossOriginWithRetry(url, 'arraybuffer',
          (loaded, total) => {
            if (scope && !scope.check()) return;
            const effTotal = (total > 0) ? total : estimatedTotal;
            if (effTotal > 0) { const p = Math.min(99, Math.round(loaded / effTotal * 100)); updateUI(p, `${p}%`); }
            else updateUI(50, `${(loaded / 1048576).toFixed(1)} MB`);
          }, {}, 3, CONFIG.mp4TimeoutMs, scope);
        if (scope && !scope.check()) throw new Error('cancelled');
        UVP.Download.downloadBlob(new Blob([buf], { type: mimeFor() }), filename);
        if (saveBtn) saveBtn.textContent = 'Done!';
        setTimeout(() => { if (scope.check()) UVP.Download.endDownload(saveBtn, 'mp4 blob'); }, 2500);
        return 'done';
      } catch (e2) {
        if (scope && !scope.check()) throw new Error('cancelled');
        console.error('[UVP] MP4 blob download failed:', e2);
        return manualSaveHint();
      }
    };

    // Universal download engine chain: streaming file save first (zero RAM,
    // with Range resume), then the robust blob engine, then manual hint fallback.
    const engineFallback = async () => {
      if (scope && !scope.check()) throw new Error('cancelled');
      try {
        const streamed = await UVP.Download.streamSaveFromNetwork(url, filename, mimeFor(), updateUI, scope);
        if (streamed && streamed.ok) {
          if (saveBtn) saveBtn.textContent = 'Done!';
          setTimeout(() => { if (scope.check()) UVP.Download.endDownload(saveBtn, 'mp4 stream'); }, 2500);
          return 'done';
        }
      } catch (e) {
        if (scope && !scope.check()) throw new Error('cancelled');
        if (DEBUG) console.warn('[UVP] MP4 stream save unavailable/failed:', e && e.message, '- trying blob engine');
      }
      return blobFallback();
    };

    if (CONFIG.mp4PreferManual) { return manualSaveHint(); }

    if (typeof GM_download === 'function') {
      return new Promise((resolve, reject) => {
        let settled = false;
        let gmHandle = null;
        let sawProgress = false;
        let watchdog = null;
        const unhook = scope ? scope.onAbort(() => {
          // Stop the underlying browser download too (GM_download returns an
          // abort handle per Tampermonkey docs; older managers return
          // undefined - guarded).
          if (gmHandle && typeof gmHandle.abort === 'function') { try { gmHandle.abort(); } catch (e) {} }
          if (!settled) { settled = true; if (watchdog) clearInterval(watchdog); reject(new Error('cancelled')); }
        }) : () => {};
        const checkScope = () => {
          if (settled) return false;
          if (scope && !scope.check()) {
            settled = true;
            if (watchdog) clearInterval(watchdog);
            unhook();
            reject(new Error('cancelled'));
            return false;
          }
          return true;
        };
        // A GM shim can accept the call and then never fire any callback
        // (older Violentmonkey/AdGuard builds, aborted browser downloads).
        // Require continuous progress; if a whole watchdog window passes with
        // zero onprogress events, abort and hand off to the built-in engine.
        watchdog = setInterval(() => {
          if (settled) { clearInterval(watchdog); return; }
          if (!sawProgress) {
            settled = true;
            clearInterval(watchdog);
            if (gmHandle && typeof gmHandle.abort === 'function') { try { gmHandle.abort(); } catch (e) {} }
            console.warn('[UVP] GM_download stalled (no progress) - switching to built-in engine');
            engineFallback().then(resolve, (e2) => {
              if (scope && !scope.check()) { reject(new Error('cancelled')); return; }
              console.warn('[UVP] MP4 engines failed:', e2);
              try { manualSaveHint(); } catch (e3) {}
              resolve('manual');
            });
            return;
          }
          sawProgress = false;
        }, CONFIG.gmDownloadWatchdogMs);
        try {
          const info = ytFmtMap.get(url) || {};
          const estimatedTotal = Number(info.contentLength) || (info.bitrate && info.approxDurationMs ? Math.round(info.bitrate * (info.approxDurationMs / 1000) / 8) : 0);
          gmHandle = GM_download({
            url, name: filename,
            onprogress: (e) => {
              sawProgress = true;
              if (!checkScope()) return;
              const total = (e.lengthComputable && e.total > 0) ? e.total : estimatedTotal;
              if (total > 0) {
                const p = Math.min(99, Math.round((e.loaded / total) * 100));
                updateUI(p, `${p}%`);
              } else {
                updateUI(50, `${(e.loaded / 1048576).toFixed(1)} MB`);
              }
            },
            onload: () => {
              if (!checkScope()) return;
              settled = true;
              if (watchdog) clearInterval(watchdog);
              unhook();
              if (saveBtn) saveBtn.textContent = 'Done!';
              setTimeout(() => { if (scope.check()) UVP.Download.endDownload(saveBtn, 'mp4 GM_download'); }, 2500);
              resolve('done');
            },
            onerror: (err) => {
              if (!checkScope()) return;
              settled = true;
              if (watchdog) clearInterval(watchdog);
              unhook();
              console.warn('[UVP] GM_download failed:', err, '- trying built-in engine');
              engineFallback().then(resolve, (e2) => {
                if (scope && !scope.check()) { reject(new Error('cancelled')); return; }
                console.warn('[UVP] MP4 engines failed:', e2);
                try { manualSaveHint(); } catch (e3) {}
                resolve('manual');
              });
            }
          });
          if (!gmHandle && !settled) {
            // Older managers return undefined from GM_download - the callbacks
            // may still fire, but if none do the watchdog above recovers us.
            if (DEBUG) console.warn('[UVP] GM_download returned no abort handle');
          }
        } catch (gmThrow) {
          settled = true;
          if (watchdog) clearInterval(watchdog);
          unhook();
          console.warn('[UVP] GM_download threw:', UVP.Network.gmErrorText(gmThrow), '- using built-in engine');
          engineFallback().then(resolve, (e2) => {
            if (scope && !scope.check()) { reject(new Error('cancelled')); return; }
            console.warn('[UVP] MP4 engines failed:', e2);
            try { manualSaveHint(); } catch (e3) {}
            resolve('manual');
          });
        }
      });
    }
    // No GM_download (AdGuard / Greasemonkey 4 / userscript environments
    // without it): go straight to the built-in engine chain.
    return engineFallback();
  }

  UVP.Download.getVideoTitle = function(url, targetVideo) {
    const v = targetVideo || state._activePlaybackSource || state.targetVideo;

    // 1. X.com / Twitter: extract tweet author, tweet text, and status ID
    if (UVP.Extractors.isX()) {
      const tweet = v && v.closest ? v.closest('article[data-testid="tweet"]') : null;
      let author = '', text = '', statusId = '';
      if (tweet) {
        const userEl = tweet.querySelector('[data-testid="User-Name"]');
        const handleMatch = userEl ? userEl.textContent.match(/@([A-Za-z0-9_]+)/) : null;
        if (handleMatch) author = handleMatch[1];
        const textEl = tweet.querySelector('[data-testid="tweetText"]');
        if (textEl) text = textEl.textContent.trim();
        const statusLink = tweet.querySelector('a[href*="/status/"]');
        const statusMatch = statusLink ? statusLink.href.match(/\/status\/(\d+)/) : null;
        if (statusMatch) statusId = statusMatch[1];
      }
      if (!statusId && location.pathname.includes('/status/')) {
        const m = location.pathname.match(/\/status\/(\d+)/);
        if (m) statusId = m[1];
        const segs = location.pathname.split('/').filter(Boolean);
        if (segs.length >= 1 && segs[0] !== 'i') author = author || segs[0];
      }
      if (author || text || statusId) {
        const parts = [];
        if (author) parts.push(author);
        if (text) {
          const cleanText = text.slice(0, 50).replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, ' ');
          if (cleanText) parts.push(cleanText);
        }
        if (statusId) parts.push(`[${statusId}]`);
        const full = parts.filter(Boolean).join(' - ');
        if (full.length >= 3) return full;
      }
      if (url) {
        const m = String(url).match(/\/([A-Za-z0-9_-]{8,})\.(?:mp4|m3u8)/i);
        if (m) return `x_${m[1]}`;
      }
    }

    // 2. RedGifs: extract actual GIF ID
    if (UVP.Extractors.isRedgifs()) {
      const rgId = state._activeRgId || (v && UVP.Extractors.getRgIdFromElement(v)) || UVP.Extractors.getRgIdFromUrl(location.href);
      if (rgId) return rgId;
    }

    // 3. Document / metadata title with site branding cleanups
    const metaTitle = (() => {
      try {
        const m = document.querySelector('meta[property="og:title"], meta[name="twitter:title"], meta[name="title"]');
        return ((m && m.content) || '').trim();
      } catch (e) { return ''; }
    })();
    let raw = metaTitle || document.title || 'video';
    // Clean common site suffixes (e.g. " - YouTube", " | Pornhub", " - EroMe", " - PMVtube.com")
    raw = raw.replace(/\s*[-|•–]\s*(?:YouTube|Pornhub|EroMe|PMVtube\.com|PMVHaven|xHamster|xfree\.com|X|Twitter)\s*$/i, '');
    let clean = raw.replace(/[/\\?%*:|"<>]/g, '').trim().substring(0, 70) || 'video';
    clean = clean.replace(/^\.+/, '').trim() || 'video';
    // If the title ended up as a generic placeholder ("Home", "Explore", etc.), try the URL basename
    if (/^(?:home|explore|timeline|notifications|video|watch|index)$/i.test(clean) && url) {
      try {
        const u = new URL(url, location.href);
        const base = u.pathname.split('/').pop().replace(/\.[a-z0-9]+$/i, '');
        if (base && base.length >= 4) return base.replace(/[/\\?%*:|"<>]/g, '').substring(0, 50);
      } catch (e) {}
    }
    return clean;
  };

  UVP.Download.determineExtension = function(url, mimeType) {
    const u = String(url || '');
    const m = String(mimeType || '').toLowerCase();

    // Explicit MIME checks
    if (/video\/webm/i.test(m) || /audio\/webm/i.test(m)) return 'webm';
    if (/video\/mp4/i.test(m) || /video\/quicktime/i.test(m)) return 'mp4';
    if (/audio\/mp4/i.test(m) || /audio\/aac/i.test(m) || /audio\/x-m4a/i.test(m)) return 'm4a';
    if (/audio\/mpeg/i.test(m) || /audio\/mp3/i.test(m)) return 'mp3';
    if (/video\/mp2t/i.test(m)) return 'ts';

    // Direct URL extensions
    if (/\.webm([?#]|$)/i.test(u)) return 'webm';
    if (/\.mp4([?#]|$)/i.test(u)) return 'mp4';
    if (/\.m4v([?#]|$)/i.test(u)) return 'mp4';
    if (/\.mov([?#]|$)/i.test(u)) return 'mov';
    if (/\.m4a([?#]|$)/i.test(u)) return 'm4a';
    if (/\.weba([?#]|$)/i.test(u)) return 'weba';
    if (/\.mp3([?#]|$)/i.test(u)) return 'mp3';
    if (/\.ts([?#]|$)/i.test(u)) return 'ts';
    if (/\.m3u8([?#]|$)/i.test(u)) {
      const tsHint = /\.ts([?#]|$)/i.test(u) || (typeof capturedUrls !== 'undefined' && [...capturedUrls].some(cu => /\.ts([?#]|$)/i.test(cu)));
      return tsHint ? 'ts' : 'mp4';
    }

    if (typeof ytFmtMap !== 'undefined' && ytFmtMap.has(u)) {
      const fmt = ytFmtMap.get(u) || {};
      if (/webm/i.test(fmt.mimeType || '')) return 'webm';
    }

    return 'mp4';
  };

  UVP.Download.formatFilename = function(title, ext) {
    let clean = String(title || 'video').trim();
    // Strip any existing file extension from the title so we never get double extensions (e.g. .mp4.mp4)
    clean = clean.replace(/\.(mp4|webm|m4v|m3u8|ts|m4a|weba|mp3|mkv|mov|avi|flv)$/i, '').trim();
    // Sanitize illegal filesystem characters across Windows/macOS/Linux: / \ ? % * : | " < >
    clean = clean.replace(/[/\\?%*:|"<>]/g, '').replace(/\s+/g, ' ').trim();
    clean = clean.substring(0, 100).replace(/^\.+/, '').trim() || 'video';
    const finalExt = String(ext || 'mp4').toLowerCase().replace(/^\./, '');
    return `${clean}.${finalExt}`;
  };

  // yt-dlp -x equivalent: download the best AUDIO-ONLY track. On YouTube the
  // adaptive formats carry audio/* mimeTypes (prefer m4a/MP4 audio - universally
  // playable - at the highest reported bitrate, mirroring yt-dlp's format sort).
  // On generic sites, any captured .m4a/.weba/.mp3/.aac/.ogg URL is used.
  UVP.Download.downloadAudioOnly = async function() {
    if (state.isDownloading) { UVP.Overlay.showToast('Download already in progress'); return; }
    // Live audio URLs expire with the sliding window; a "saved" file would be
    // a 5-second stub. Covers both the overlay button and the menu command.
    if (state.overlayIsLive || (UVP.Extractors.isYouTube() && ytPlayerData.isLive)) { UVP.Overlay.showToast('Live streams cannot be saved'); return; }
    let url = null, ext = 'm4a';
    if (UVP.Extractors.isYouTube()) {
      if (!UVP.Extractors.ytFormatsCurrent()) {
        try { await UVP.Extractors.extractYouTubeUrls(); } catch (e) {}
      }
      // Format selector: ranking by container, bitrate, and decipher status.
      // (n-clean first, then container, then bitrate). Was a THIRD bespoke
      // sort that could pick a throttled undeciphered URL.
      const pick = UVP.Extractors.pickYouTubeFormats();
      if (pick.audio) { url = pick.audio; ext = /mp4/i.test((ytFmtMap.get(pick.audio) || {}).mimeType || '') ? 'm4a' : 'weba'; }
    }
    if (!url) {
      const all = UVP.Utils.extractAllUrls();
      url = all.find(u => /\.m4a([?#]|$)/i.test(u)) || all.find(u => /\.(weba|mp3|aac|ogg)([?#]|$)/i.test(u));
      if (url) { const m = url.match(/\.([a-z0-9]{2,4})([?#]|$)/i); if (m) ext = m[1]; }
    }
    if (!url || !UVP.Utils.assertSafeVideoUrl(url)) { UVP.Overlay.showToast('No audio track found on this page'); return; }
    const saveBtn = state.overlay ? state.overlay.shadowRoot.querySelector('.uvp-save') : null;
    // Same state-machine gate as handleSaveAction: without it, calling this
    // during e.g. RECOVERING silently no-ops the transition and desyncs state.
    if (!UVP.StateMachine.can('DOWNLOADING')) return;
    const scope = UVP.Cancel.createScope();
    currentDownloadScope = scope;
    state.isDownloading = true;
    UVP.StateMachine.transition('DOWNLOADING', 'audio-only start');
    const updateUI = UVP.Download.makeUpdateUI();
    const title = UVP.Download.getVideoTitle(url, state.targetVideo);
    const filename = UVP.Download.formatFilename(title, ext);
    if (saveBtn) saveBtn.textContent = 'Audio...';
    else UVP.Overlay.showToast(`UVP: downloading audio (${ext})...`);
    try {
      const result = await UVP.Download.downloadMP4(url, filename, updateUI, scope);
      if (!scope.check()) return;
      if (result !== 'manual') {
        if (!saveBtn) UVP.Overlay.showToast(`UVP: audio saved (${filename})`);
      }
    } catch (e) {
      if (!scope.check()) return;
      console.error('[UVP] Audio download error:', e);
      await UVP.Download.cleanupDownloadForScope(scope);
      if (!UVP.Cancel.isCurrent(scope)) return;
      UVP.Download.endDownload(saveBtn, 'audio error');
      UVP.Overlay.showToast('Audio download failed');
    }
  }

  // Losslessly remuxes separate adaptive video and audio streams into a single playable file.
  // When 'max' download quality is chosen, the adaptive video track is video-only.
  // We download the paired audio track (using GM_download when available to avoid popup-blocker issues,
  // falling back to blob download).
  UVP.Download.downloadPairedAudio = async function(videoFilename, scope) {
    try {
      const url = UVP.Utils.assertSafeVideoUrl(state.targetAudioUrl);
      if (!url) return;
      const info = ytFmtMap.get(url) || {};
      const ext = /mp4/i.test(info.mimeType || '') ? 'm4a' : (/webm/i.test(info.mimeType || '') ? 'opus' : 'm4a');
      const base = (videoFilename || 'audio').replace(/\.[a-z0-9]{2,4}$/i, '');
      const filename = `${base} (Audio).${ext}`;
      UVP.Overlay.showToast(`UVP: saving audio track (${ext})...`);

      if (typeof GM_download === 'function') {
        GM_download({
          url,
          name: filename,
          onload: () => { UVP.Overlay.showToast(`UVP: audio track saved (${filename})`); },
          onerror: async (err) => {
            if (DEBUG) console.warn('[UVP] GM_download audio failed, trying blob fallback:', err);
            try {
              const buf = await UVP.Network.requestCrossOriginWithRetry(url, 'arraybuffer', null, {}, 3, CONFIG.mp4TimeoutMs, scope);
              if (!scope || !scope.check() || !buf) return;
              UVP.Download.downloadBlob(new Blob([buf], { type: ext === 'm4a' ? 'audio/mp4' : 'audio/webm' }), filename);
              UVP.Overlay.showToast(`UVP: audio track saved (${filename})`);
            } catch (e2) {}
          }
        });
        return;
      }

      const buf = await UVP.Network.requestCrossOriginWithRetry(url, 'arraybuffer', null, {}, 3, CONFIG.mp4TimeoutMs, scope);
      if (!scope || !scope.check() || !buf) return;
      UVP.Download.downloadBlob(new Blob([buf], { type: ext === 'm4a' ? 'audio/mp4' : 'audio/webm' }), filename);
      UVP.Overlay.showToast(`UVP: audio track saved (${filename})`);
    } catch (e) {
      if (scope && !scope.check()) return;
      if (DEBUG) console.warn('[UVP] Paired audio download failed:', e);
      UVP.Overlay.showToast('Audio track could not be saved');
    }
  };

  // Download and remux adaptive YouTube video + audio streams into a single playable file
  UVP.Download.downloadAndMuxYouTube = async function(videoUrl, audioUrl, title, updateUI, scope) {
    const saveBtn = state.overlay ? state.overlay.shadowRoot.querySelector('.uvp-save') : null;
    if (scope && !scope.check()) throw new Error('cancelled');

    const vidInfo = ytFmtMap.get(videoUrl) || {};
    let audInfo = ytFmtMap.get(audioUrl) || {};

    const isVidWebm = /webm|vp9|vp09|av01/i.test(vidInfo.mimeType || '');
    let finalAudioUrl = audioUrl;

    // Ensure matched container/codec pairing (WebM+Opus or MP4+AAC)
    if (isVidWebm && !/webm|opus/i.test(audInfo.mimeType || '')) {
      let bestOpus = null;
      for (const [u, info] of ytFmtMap) {
        if (info && /audio\/webm|opus/i.test(info.mimeType || '')) {
          if (!bestOpus || (info.bitrate || 0) > (bestOpus.info.bitrate || 0)) bestOpus = { u, info };
        }
      }
      if (bestOpus) { finalAudioUrl = bestOpus.u; audInfo = bestOpus.info; }
    } else if (!isVidWebm && !/mp4|m4a|aac/i.test(audInfo.mimeType || '')) {
      let bestAac = null;
      for (const [u, info] of ytFmtMap) {
        if (info && /audio\/mp4|m4a|aac/i.test(info.mimeType || '')) {
          if (!bestAac || (info.bitrate || 0) > (bestAac.info.bitrate || 0)) bestAac = { u, info };
        }
      }
      if (bestAac) { finalAudioUrl = bestAac.u; audInfo = bestAac.info; }
    }

    const isWebm = isVidWebm;
    const ext = isWebm ? 'webm' : 'mp4';
    const filename = UVP.Download.formatFilename(title, ext);

    const estVidTotal = Number(vidInfo.contentLength) || (vidInfo.bitrate && vidInfo.approxDurationMs ? Math.round(vidInfo.bitrate * (vidInfo.approxDurationMs / 1000) / 8) : 0);
    const estAudTotal = Number(audInfo.contentLength) || (audInfo.bitrate && audInfo.approxDurationMs ? Math.round(audInfo.bitrate * (audInfo.approxDurationMs / 1000) / 8) : 0);

    try {
      if (saveBtn) saveBtn.textContent = 'Video 0%';
      // 1. Fetch video stream
      const vidBuf = await UVP.Network.requestCrossOriginWithRetry(videoUrl, 'arraybuffer',
        (loaded, total) => {
          if (scope && !scope.check()) return;
          const eff = (total > 0) ? total : estVidTotal;
          const p = eff > 0 ? Math.min(99, Math.round(loaded / eff * 100)) : 50;
          updateUI(Math.round(p * 0.45), `Video ${p}%`);
        }, {}, 3, CONFIG.mp4TimeoutMs, scope);
      if (!scope || !scope.check() || !vidBuf) return false;

      if (saveBtn) saveBtn.textContent = 'Audio 0%';
      // 2. Fetch audio stream
      const audBuf = await UVP.Network.requestCrossOriginWithRetry(finalAudioUrl, 'arraybuffer',
        (loaded, total) => {
          if (scope && !scope.check()) return;
          const eff = (total > 0) ? total : estAudTotal;
          const p = eff > 0 ? Math.min(99, Math.round(loaded / eff * 100)) : 50;
          updateUI(45 + Math.round(p * 0.45), `Audio ${p}%`);
        }, {}, 3, CONFIG.mp4TimeoutMs, scope);
      if (!scope || !scope.check() || !audBuf) return false;

      // 3. Mux streams
      updateUI(95, 'Muxing...');
      let finalBlob = null;
      if (isWebm) {
        const muxedBytes = UVP.Muxer.muxWebM(vidBuf, audBuf);
        finalBlob = new Blob([muxedBytes], { type: 'video/webm' });
      } else {
        const muxedBytes = UVP.Muxer.muxMP4(vidBuf, audBuf);
        finalBlob = new Blob([muxedBytes], { type: 'video/mp4' });
      }

      if (scope && !scope.check()) return false;
      UVP.Download.downloadBlob(finalBlob, filename);
      UVP.Overlay.showToast(`UVP: saved video with audio (${filename})`);
      return true;
    } catch (e) {
      if (DEBUG) console.warn('[UVP] In-browser remuxing failed, falling back to dual download:', e);
      return false;
    }
  };

  // Re-extracts fresh media URL prior to starting download to ensure valid CDN tokens.
  // Re-extract a fresh URL using the same logic as showNativePlayer.
  // Used by handleSaveAction to get fresh CDN tokens before starting a download.
  UVP.Overlay.extractFreshUrl = async function() {
    UVP.Utils.invalidateUrlCache();
    UVP.Utils.invalidateInlineScriptCache();
    UVP.Utils.safeCall(UVP.Extractors.extractJsonLdVideoUrls, 'extractJsonLdVideoUrls');
    const bestVideo = ((state.isDetachedPip || state.isMiniPlayer) && state.buttonTargetVideo)
      ? state.buttonTargetVideo
      : UVP.Overlay.findBestVideo();
    const site = UVP.Extractors.SITES.find(s => s.isSite());
    let result = site ? await site.getUrl(bestVideo) : UVP.Extractors.getGenericUrl(bestVideo);
    return UVP.Utils.assertSafeVideoUrl(result);
  };

  UVP.Download.handleSaveAction = async function(url) {
    const saveBtn = state.overlay ? state.overlay.shadowRoot.querySelector('.uvp-save') : null;
    if (!saveBtn || !url) return;
    // Live HLS manifests have no complete media to save — the sliding window
    // would produce a partial/corrupt capture. Block with a clear message.
    if (state.overlayIsLive) { UVP.Overlay.showToast('Live streams cannot be saved'); return; }
    // Active download guard: second click cancels in-flight transfer
    if (state.isDownloading) {
      if (UVP.StateMachine.can('PLAYING')) UVP.StateMachine.transition('PLAYING', 'handleSaveAction cancel');
      UVP.Cancel.cancelCurrent();
      UVP.Overlay.showToast('Download cancelled');
      return;
    }
    if (!UVP.StateMachine.can('DOWNLOADING')) return;
    const scope = UVP.Cancel.createScope();
    currentDownloadScope = scope;
    // Set isDownloading AFTER createScope() — createScope() calls cancelCurrent()
    // which emits 'download:cancel' (async handler). Setting before causes the
    // async handler to see isDownloading=true and skip button reset, but setting
    // it after ensures clean state transition.
    state.isDownloading = true;
    // Re-extract URL to get fresh CDN tokens — stale URLs expire while the user
    // watches the video before clicking Save. Same extraction logic as
    // showNativePlayer, with same-domain validation to avoid switching videos.
    if (saveBtn) saveBtn.textContent = 'Refreshing...';
    try {
      const freshUrl = await UVP.Overlay.extractFreshUrl();
      if (freshUrl && scope.check()) {
        let candidate = freshUrl;
        // If original was HLS but refresh returned non-HLS, search for an HLS
        // URL on the same domain to avoid silently downgrading to a low-quality MP4.
        if (/\.m3u8([?#]|$)/i.test(url) && !/\.m3u8([?#]|$)/i.test(freshUrl)) {
          if (DEBUG) console.log('[UVP] Refresh returned non-HLS for HLS download; searching for HLS URL...');
          const allUrls = UVP.Utils.extractAllUrls();
          const hlsAlt = allUrls.find(u => /\.m3u8([?#]|$)/i.test(u));
          if (hlsAlt) {
            try {
              const hlsHost = new URL(hlsAlt).hostname;
              const origHost0 = new URL(url).hostname;
              if (hlsHost === origHost0 || hlsHost.endsWith('.' + origHost0) || origHost0.endsWith('.' + hlsHost)) {
                candidate = hlsAlt;
                if (DEBUG) console.log('[UVP] Found HLS alternative on same domain:', hlsAlt);
              }
            } catch (e) { /* keep candidate = freshUrl */ }
          }
          // If no HLS alt found, keep the original stale m3u8 — resolveToMediaPlaylist
          // will attempt to fetch it and its own fallback will search for another m3u8.
          if (candidate === freshUrl) {
            if (DEBUG) console.log('[UVP] No fresh HLS found; keeping original HLS URL');
            candidate = url;
          }
        }
        try {
          const origHost = new URL(url).hostname;
          const freshHost = new URL(candidate).hostname;
          if (origHost === freshHost || freshHost.endsWith('.' + origHost) || origHost.endsWith('.' + freshHost)) {
            url = candidate;
            state.overlayUrl = candidate;
          }
        } catch (e) { /* domain check failed, keep original URL */ }
      }
    } catch (e) { if (DEBUG) console.warn('[UVP] URL refresh failed:', e); }
    if (!scope.check()) return;

    const isYt = UVP.Extractors.isYouTube() && !state.overlayIsLive;
    const dlQuality = UVP.Utils.getDownloadQuality();
    if (isYt) {
      const dlPick = UVP.Extractors.pickYouTubeDownloadUrl(dlQuality);
      if (dlPick && dlPick.video) {
        url = dlPick.video;
        state.targetAudioUrl = dlPick.audio || null;
      }
    }

    // Security gate: validate URL before download starts.
    url = UVP.Utils.assertSafeVideoUrl(url);
    if (!url) {
      state.isDownloading = false;
      if (saveBtn) saveBtn.textContent = 'Save';
      UVP.Overlay.showToast('Invalid video URL');
      return;
    }
    UVP.StateMachine.transition('DOWNLOADING', 'handleSaveAction start');
    const updateUI = UVP.Download.makeUpdateUI();
    // Metadata filename fallback (yt-dlp outtmpl-style): the page <title> is
    // often a generic site name; og:title / twitter:title carry the actual
    // video title. Same sanitization either way.
    const title = UVP.Download.getVideoTitle(url, state.targetVideo);
    const info = isYt ? (ytFmtMap.get(url) || {}) : {};
    const ext = UVP.Download.determineExtension(url, info.mimeType);
    const filename = UVP.Download.formatFilename(title, ext);
    try {
      if (/\.m3u8([?#]|$)/i.test(url)) {
        // ---------- HLS ----------
        // Pre-create file handle while user activation is fresh (showSaveFilePicker
        // requires transient activation that expires ~5s after the click).
        // If it succeeds, segments stream directly to the file — no IndexedDB
        // storage or merge phase needed. If it fails, fall back to the existing
        // IndexedDB + merge approach.
        let preFileHandle = null;
        if (window.showSaveFilePicker) {
          try {
            // Suggested filename with canonical container extension
          // both; the name always said .mp4 even for MPEG-TS streams).
          const tsHint = /\.ts([?#]|$)/i.test(url) || [...capturedUrls].some((u) => /\.ts([?#]|$)/i.test(u));
          preFileHandle = await window.showSaveFilePicker({
              suggestedName: `${title}${tsHint ? '.ts' : '.mp4'}`,
              types: [{ description: 'Video File', accept: { 'video/mp4': ['.mp4'], 'video/mp2t': ['.ts'] } }]
            });
          } catch (pickErr) {
            if (pickErr && pickErr.name === 'AbortError') {
              state.isDownloading = false;
              if (saveBtn) saveBtn.textContent = 'Save';
              UVP.Overlay.showToast('Download cancelled');
              return;
            }
            preFileHandle = null;
          }
        }
        const completed = await UVP.Download.downloadHLS(url, filename, updateUI, scope, preFileHandle);
        if (!scope.check()) return;
        if (completed === true) {
          saveBtn.textContent = 'Done!';
          setTimeout(() => { if (scope.check()) UVP.Download.endDownload(saveBtn, 'hls success'); }, 2500);
        } else if (completed === false) {
          saveBtn.textContent = 'Error';
          saveBtn.style.background = '#ff3b3b';
          setTimeout(() => { if (scope.check()) UVP.Download.endDownload(saveBtn, 'hls error'); }, 3000);
        } else {
          UVP.Download.endDownload(saveBtn, 'hls unknown');
        }
      } else {
        // ---------- MP4 / WebM / Muxed ----------
        const info = isYt ? (ytFmtMap.get(url) || {}) : {};
        const isProgressive = isYt ? (info.itag === 18 || info.itag === 22 || (info.height > 0 && info.audioSampleRate > 0)) : true;

        if (isYt && !isProgressive && state.targetAudioUrl) {
          // Adaptive download: mux video and audio into a single playable file with sound
          const muxOk = await UVP.Download.downloadAndMuxYouTube(url, state.targetAudioUrl, title, updateUI, scope);
          if (!scope.check()) return;
          if (muxOk) {
            if (saveBtn) saveBtn.textContent = 'Done!';
            setTimeout(() => { if (scope.check()) UVP.Download.endDownload(saveBtn, 'muxed success'); }, 2500);
          } else {
            // Dual-download fallback if in-browser muxing cannot proceed
            const result = await UVP.Download.downloadMP4(url, filename, updateUI, scope);
            if (result !== 'manual' && scope.check()) {
              UVP.Download.downloadPairedAudio(filename, scope);
            }
          }
        } else {
          // Progressive format (720p HD itag 22 or 360p itag 18) — already contains in-container audio
          const result = await UVP.Download.downloadMP4(url, filename, updateUI, scope);
        }
      }
    } catch (e) {
      if (!scope.check()) return;
      console.error("[UVP] Download Error:", e);
      await UVP.Download.cleanupDownloadForScope(scope);
      if (!UVP.Cancel.isCurrent(scope)) return;
      saveBtn.textContent = 'Error'; saveBtn.style.background = '#ff3b3b';
      setTimeout(() => { if (scope.check()) UVP.Download.endDownload(saveBtn, 'download error'); }, 3000);
    }
  } 
  // ==================== OVERLAY & SYNC ====================
  UVP.Overlay.findBestVideo = function() {
    // YouTube non-watch pages (search, home, channel) show hover-preview
    // <video> elements that are not watchable videos — skip them so the
    // play button doesn't appear on pages with no actual video to extract.
    if (UVP.Extractors.isYouTube() && !UVP.Extractors.getYtVideoId()) return null;
    // X.com non-tweet pages (timeline, profile, explore) show MSE preview
    // videos. Only suppress the button if we also have no captured twimg
    // URLs — GraphQL interception may have already captured video URLs from
    // the timeline feed, in which case the button should appear.
    if (UVP.Extractors.isX() && !UVP.Extractors.getXTweetId() &&
        ![...capturedUrls].some(u => /video\.twimg\.com/i.test(u) && /\.(mp4|m3u8)([?#]|$)/i.test(u))) return null;
    const videos = UVP.Utils.findAllVideos ? UVP.Utils.findAllVideos(document) : Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;
    const minW = CONFIG.minVideoWidth;
    let best = null, bestScore = -Infinity;
    const vw = window.innerWidth, vh = window.innerHeight, cx = vw / 2, cy = vh / 2;
    const isFloating = state.isDetachedPip || state.isMiniPlayer;

    for (const video of videos) {
      if (video === state.video) continue; // skip overlay video when re-extracting
      // While floating (PiP/mini-player) the active playback source is a VALID
      // button target on every site (RedGifs behavior, generalized): it gives
      // the play button a stable anchor so updateButtonPosition and
      // startButtonSync agree (no show/hide flicker) and clicking it targets
      // the right video. The pointer-hover bonus still outranks it whenever
      // the user aims at a different video on multi-video pages.
      let rect = video.getBoundingClientRect();
      if (UVP.Extractors.isYouTube()) {
        const container = video.closest('#movie_player, .html5-video-player, ytd-player');
        if (container) rect = container.getBoundingClientRect();
      }
      if (rect.width < minW || rect.height < 1) continue;
      // Calculate intersection with the visible viewport
      const visibleW = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
      const visibleH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
      const visibleArea = visibleW * visibleH;
      if (visibleArea < minW * 10 || visibleW < minW || visibleH < 10) continue;

      const distance = Math.hypot(rect.left + rect.width / 2 - cx, rect.top + rect.height / 2 - cy);
      // Area dominates score so large primary players always outrank small preview cards/thumbnails.
      let score = (visibleArea / 1000) * 10 - distance * 0.1;
      // Small penalty for loop/muted preview thumbnails on pages with multiple videos
      if (video.loop && video.muted && rect.width < 400 && videos.length > 1) score -= 50;

      // Global Centering bonus: reward videos that cover or are closest to the vertical center of the visible screen.
      // Overcomes the 28-100 pt aspect-ratio disparity between centered portrait/square videos and off-center landscape videos.
      const coversCenterY = (rect.top <= cy && rect.bottom >= cy);
      if (coversCenterY) {
        score += 100;
      } else {
        const distY = cy < rect.top ? (rect.top - cy) : (cy - rect.bottom);
        const normDist = Math.min(1, distY / (vh / 2));
        score += (1 - normDist) * 50;
      }

      // Global Pointer hover bonus: reward video when cursor is hovering over it or its card
      if (lastPointer.x >= 0 && (Date.now() - lastPointer.at < 30000)) {
        const btn = document.getElementById('uvp-native-btn');
        let isPointerOverBtn = false;
        if (btn && btn.style.display !== 'none') {
          const br = btn.getBoundingClientRect();
          isPointerOverBtn = (br.left <= lastPointer.x && lastPointer.x <= br.right && br.top <= lastPointer.y && lastPointer.y <= br.bottom) ||
            (btn.matches && btn.matches(':hover'));
        }
        const cardSelector = 'article, [data-testid="tweet"], [data-feed-item-id], .GifPreview, .tileItem, [class*="card"], [class*="tile"]';
        const isPointerOver = (rect.left <= lastPointer.x && lastPointer.x <= rect.right && rect.top <= lastPointer.y && lastPointer.y <= rect.bottom) ||
          (isPointerOverBtn && (video === state.buttonTargetVideo || video === state.targetVideo)) ||
          (video.matches && video.matches(':hover')) ||
          (video.closest && (
            video.closest(cardSelector)?.matches(':hover') ||
            (() => {
              const card = video.closest(cardSelector);
              if (!card) return false;
              const cr = card.getBoundingClientRect();
              return cr.left <= lastPointer.x && lastPointer.x <= cr.right && cr.top <= lastPointer.y && lastPointer.y <= cr.bottom;
            })()
          ));
        if (isPointerOver) {
          score += 400;
        }
      }

      if (score > bestScore) { bestScore = score; best = video; }
    }
    return best;
  }
  UVP.Overlay.updateButtonPosition = function() {
    if (state.buttonUpdateFrame) cancelAnimationFrame(state.buttonUpdateFrame);
    state.buttonUpdateFrame = requestAnimationFrame(() => {
      state.buttonUpdateFrame = null;
      const btn = document.getElementById('uvp-native-btn');
      if (!btn) return;
      const isFloating = state.isDetachedPip || state.isMiniPlayer;
      if (!isFloating && (state.buttonDismissed || state.overlay || state.sitePlayerFailed)) { btn.style.display = 'none'; return; }
      const video = UVP.Overlay.findBestVideo();
      if (video) {
        state.buttonTargetVideo = video;
        if (!state.overlay) state.targetVideo = video;
      } else {
        state.buttonTargetVideo = null;
        if (!state.overlay) state.targetVideo = null;
        btn.style.display = 'none';
      }
    });
  }
  UVP.Overlay.ensureButton = function() {
    const isFloating = state.isDetachedPip || state.isMiniPlayer;
    if (!isFloating && (state.buttonDismissed || state.overlay || state.sitePlayerFailed)) return;
    let btn = document.getElementById('uvp-native-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'uvp-native-btn';
      btn.textContent = CONFIG.buttonLabel;
      btn.addEventListener('click', () => {
        state.buttonDismissed = true;
        btn.style.display = 'none';
        UVP.Overlay.showNativePlayer();
      });
      document.body.appendChild(btn);
    }
    UVP.Overlay.updateButtonPosition();
  }
  UVP.Overlay.isSameAsActivePlayback = function(v) {
    if (!v || v.tagName !== 'VIDEO' || v === state.video) return false;
    if (UVP.Extractors.isRedgifs() && state._activeRgId) {
      return UVP.Extractors.getRgIdFromElement(v) === state._activeRgId;
    }
    if (v === state.targetVideo || v === state._activePlaybackSource) return true;
    if (state.overlayUrl && (v.src === state.overlayUrl || v.currentSrc === state.overlayUrl)) return true;
    if (state._activePoster && v.poster && v.poster === state._activePoster) return true;
    return false;
  };
  UVP.Overlay.startOverlaySync = function() {
    let lastKey = '';
    function loop() {
      if (!state.overlay || state.isDetachedPip) return;
      if (state.targetVideo) {
        const inDom = document.body.contains(state.targetVideo);
        let rect = inDom ? state.targetVideo.getBoundingClientRect() : null;
        
        // On YouTube, the <video> element's geometry fluctuates or collapses
        // when paused by the script before real playback starts. Sync to the 
        // stable player container instead to ensure correct overlay position.
        if (inDom && UVP.Extractors.isYouTube()) {
          const container = state.targetVideo.closest('#movie_player, .html5-video-player, ytd-player');
          if (container) rect = container.getBoundingClientRect();
        }

        const vw = window.innerWidth, vh = window.innerHeight;
        // Re-resolve targetVideo ONLY if the original media element returns to DOM
        if (!inDom) {
          if (state._activePlaybackSource && document.body.contains(state._activePlaybackSource)) {
            state.targetVideo = state._activePlaybackSource;
            rect = state.targetVideo.getBoundingClientRect();
          } else if (state.overlayUrl || state._activePoster) {
            const vids = UVP.Utils.findAllVideos ? UVP.Utils.findAllVideos(document) : Array.from(document.querySelectorAll('video'));
            const sameVid = vids.find(v => v !== state.video && document.body.contains(v) && (
              (state.overlayUrl && (v.src === state.overlayUrl || v.currentSrc === state.overlayUrl)) ||
              (state._activePoster && v.poster === state._activePoster)
            ));
            if (sameVid) {
              state.targetVideo = sameVid;
              rect = sameVid.getBoundingClientRect();
            }
          }
        }
        // Recycled-element guard (generalized from RedGifs): when the target
        // element no longer represents the overlay's active playback (virtualized
        // feeds reuse <video> elements for different content), treat it as
        // out-of-view so the overlay pops into the corner mini-player instead
        // of snapping onto a different video's frame.
        if (state.targetVideo && rect && !UVP.Overlay.isActivePlaybackElement(state.targetVideo)) {
          rect = null;
        }
        // RedGifs recycles a single <video> across feed cards; the RG id is a
        // stronger identity signal there than URL/poster matching.
        if (state.targetVideo && UVP.Extractors.isRedgifs() && state._activeRgId) {
          const curRgId = UVP.Extractors.getRgIdFromElement(state.targetVideo);
          if (curRgId && curRgId !== state._activeRgId) {
            rect = null; // DOM video element was recycled for another feed card below
          }
        }
        const isNowInDom = state.targetVideo && document.body.contains(state.targetVideo);
        // Check if the target video is currently out of the viewport or unmounted by feed virtualization
        const isOutOfView = !isNowInDom || !rect || rect.bottom <= 40 || rect.top >= vh - 40 || rect.right <= 40 || rect.left >= vw - 40 || rect.width < 20 || rect.height < 20;

        if (isOutOfView) {
          state.isMiniPlayer = true;
          // Floating corner mini-player mode with dynamic aspect ratio
          const aspect = (state.video && state.video.videoWidth && state.video.videoHeight)
            ? (state.video.videoWidth / state.video.videoHeight)
            : (16 / 9);
          const isPortrait = aspect < 1;
          const miniW = isPortrait
            ? Math.min(240, Math.max(160, Math.round(vw * 0.2)))
            : Math.min(380, Math.max(280, Math.round(vw * 0.3)));
          const miniH = Math.round(miniW / aspect);
          const top = vh - miniH - 24;
          const left = vw - miniW - 24;
          const key = 'mini|' + top + '|' + left + '|' + miniW + '|' + miniH;
          if (key !== lastKey) {
            lastKey = key;
            state.overlay.style.inset = '';
            state.overlay.style.bottom = '';
            state.overlay.style.right = '';
            state.overlay.style.top = `${top}px`;
            state.overlay.style.left = `${left}px`;
            state.overlay.style.width = `${miniW}px`;
            state.overlay.style.height = `${miniH}px`;
            state.overlay.style.boxShadow = '0 8px 32px rgba(0,0,0,0.85)';
            state.overlay.style.borderRadius = '8px';
            state.overlay.style.transition = 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease';
          }
        } else if (isNowInDom && rect && rect.width >= 20 && rect.height >= 20) {
          state.isMiniPlayer = false;
          const key = 'inline|' + Math.round(rect.top) + '|' + Math.round(rect.left) + '|' + Math.round(rect.width) + '|' + Math.round(rect.height);
          if (key !== lastKey) {
            lastKey = key;
            state.overlay.style.inset = '';
            state.overlay.style.bottom = '';
            state.overlay.style.right = '';
            state.overlay.style.top = `${rect.top}px`;
            state.overlay.style.left = `${rect.left}px`;
            state.overlay.style.width = `${rect.width}px`;
            state.overlay.style.height = `${rect.height}px`;
            state.overlay.style.boxShadow = '0 4px 30px rgba(0,0,0,.6)';
            state.overlay.style.borderRadius = '4px';
            state.overlay.style.transition = 'none';
          }
        }
      } else if (lastKey !== 'full') {
        lastKey = 'full';
        state.isMiniPlayer = false;
        state.overlay.style.inset = '0'; state.overlay.style.width = '100%'; state.overlay.style.height = '100%';
        state.overlay.style.transition = 'none';
      }
      state.syncInterval = requestAnimationFrame(loop);
    }
    loop();
  }
  UVP.Overlay.startButtonSync = function() {
    if (state.buttonSyncFrame) { cancelAnimationFrame(state.buttonSyncFrame); state.buttonSyncFrame = null; }
    let lastTick = -1000;
    let lastRescanTick = -1000;
    function loop(ts) {
      const t = typeof ts === 'number' ? ts : performance.now();
      // 10 Hz button position sync: tracks target coordinates; rescans best video every 250ms.
      if (t - lastTick >= 100) {
        lastTick = t;
        const btn = document.getElementById('uvp-native-btn');
        const liveOverlay = document.querySelector('.uvp-overlay');
        const minW = CONFIG.minVideoWidth;
        const isFloating = state.isDetachedPip || state.isMiniPlayer;
        const overlayActiveOnVideo = (liveOverlay || state.overlay) && !isFloating;
        if (t - lastRescanTick >= 250 && !overlayActiveOnVideo && !state.buttonDismissed) {
          lastRescanTick = t;
          const best = UVP.Overlay.findBestVideo();
          if (best) {
            state.buttonTargetVideo = best;
            if (!state.overlay) state.targetVideo = best;
          }
        }
        const activeTarget = (isFloating && state.buttonTargetVideo) ? state.buttonTargetVideo : state.targetVideo;
        if (btn && (overlayActiveOnVideo || (!isFloating && state.buttonDismissed) || !activeTarget)) { btn.style.display = 'none'; }
        else if (btn) {
          if (!document.body.contains(activeTarget)) {
            if (isFloating) state.buttonTargetVideo = null;
            else state.targetVideo = null;
            btn.style.display = 'none';
          }
          else {
            let rect = activeTarget.getBoundingClientRect();
            if (UVP.Extractors.isYouTube()) {
              const container = activeTarget.closest('#movie_player, .html5-video-player, ytd-player');
              if (container) rect = container.getBoundingClientRect();
            }
            const vw = window.innerWidth, vh = window.innerHeight;
            const centerX = rect.left + (rect.width / 2);
            const centerY = rect.top + (rect.height / 2);

            if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw || rect.width < minW || centerY < 0 || centerY > vh || centerX < 0 || centerX > vw) {
              btn.style.display = 'none';
            } else {
              btn.style.left = `${centerX}px`;
              btn.style.top = `${centerY}px`;
              btn.style.transform = 'translate(-50%, -50%)';
              if (!state.buttonHiddenByScroll) btn.style.display = 'flex';
            }
          }
        }
      }
      state.buttonSyncFrame = requestAnimationFrame(loop);
    }
    state.buttonSyncFrame = requestAnimationFrame(loop);
  }
  UVP.Overlay.closeOverlay = function(reloading = false) {
    state.overlayGeneration++;
    state.isDetachedPip = false;
    state.isMiniPlayer = false;
    state._activePlaybackSource = null;
    state._activePoster = null;
    state._activeRgId = null;
    state.buttonTargetVideo = null;
    if (state.buttonSyncFrame) { cancelAnimationFrame(state.buttonSyncFrame); state.buttonSyncFrame = null; }
    if (state.buttonUpdateFrame) { cancelAnimationFrame(state.buttonUpdateFrame); state.buttonUpdateFrame = null; }
    // Remove the pause-intruder listener if installed.
    if (pauseIntruderHandler) {
      try { document.removeEventListener('playing', pauseIntruderHandler, true); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
      pauseIntruderHandler = null;
    }
    if (state.escHandler) {
      try { document.removeEventListener('keydown', state.escHandler, true); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
      state.escHandler = null;
    }
    // User-initiated close (not a reload/switch) cancels any active download.
    if (!reloading && state.isDownloading) {
      UVP.Cancel.cancelCurrent();
    }
    if (state.recoveryTimer) { clearTimeout(state.recoveryTimer); state.recoveryTimer = null; }
    if (state.healthTimer) { clearInterval(state.healthTimer); state.healthTimer = null; }
    if (state.saveStateInterval) { clearInterval(state.saveStateInterval); state.saveStateInterval = null; }
    state.stallCount = 0; state.lastVideoTime = 0;
    state.decodeMetrics = null;
    state.decodeDowngradeExhaustedUrl = null;
    state.decodeDowngradeAt = 0;
    if (state.pendingSeekHandler && state.video) { state.video.removeEventListener('loadedmetadata', state.pendingSeekHandler); state.pendingSeekHandler = null; }
    if (state.syncInterval) { cancelAnimationFrame(state.syncInterval); state.syncInterval = null; }
    // DASH session teardown: destroys dash.js player and revokes MPD blob URL.
    UVP.Overlay.destroyDashSession();
    if (document.pictureInPictureElement) {
      try { document.exitPictureInPicture(); } catch (e) {}
    }
    if (state.hls) { try { state.hls.destroy(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } state.hls = null; }
    if (state.video) { if (state.videoErrorHandler) { try { state.video.removeEventListener('error', state.videoErrorHandler); } catch (e) {} state.videoErrorHandler = null; } if (state.videoPlayHandler) { try { state.video.removeEventListener('play', state.videoPlayHandler); } catch (e) {} state.videoPlayHandler = null; } if (state.videoPauseHandler) { try { state.video.removeEventListener('pause', state.videoPauseHandler); } catch (e) {} state.videoPauseHandler = null; } try { state.video.pause(); state.video.removeAttribute('src'); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
    if (state.audio) { try { state.audio.pause(); state.audio.removeAttribute('src'); } catch (e) {} state.audio = null; }
    if (state.overlay) { state.overlay.remove(); state.overlay = null; }
    state.video = null; state.overlayUrl = null; state.targetAudioUrl = null; state.wasPaused = false; state.overlayIsLive = false;
    try { sessionStorage.removeItem('uvp-player'); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    // Restore targetVideo's original muted state before clearing the reference.
    if (state.targetVideo) { try { state.targetVideo.pause(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
    if (state.targetVideo && state.targetAudioSaved) {
      try { state.targetVideo.muted = state.targetWasMuted; } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    }
    state.targetAudioSaved = false;
    if (!reloading) { state.targetVideo = null; state.buttonDismissed = false; UVP.Overlay.updateButtonPosition(); }
    // Restart button sync loop on overlay close.
    // also needs to restart the loop, not just user-initiated UVP.Overlay.closeOverlay(false)
    if (CONFIG.showButton) UVP.Overlay.startButtonSync();
    if (UVP.StateMachine.can('IDLE')) UVP.StateMachine.transition('IDLE', 'closeOverlay');
  }

  // True when the element still represents the overlay's active playback
  // (element identity, media URL, or poster match) — detects recycled feed
  // elements that now carry different content (used by startOverlaySync's
  // recycled-element guard).
  UVP.Overlay.isActivePlaybackElement = function(v) {
    if (!v || v.tagName !== 'VIDEO' || v === state.video) return false;
    if (v === state._activePlaybackSource) return true;
    if (state.overlayUrl && (v.src === state.overlayUrl || v.currentSrc === state.overlayUrl)) return true;
    if (state._activePoster && v.poster && v.poster === state._activePoster) return true;
    return false;
  };
 
  // ==================== MP4 & WEBM CLIENT-SIDE MUXER ====================
  // Pure JavaScript ISOBMFF MP4 and EBML WebM demuxer/remuxer (zero re-encoding).
  // Losslessly combines separate adaptive video and audio streams (H.264+AAC or VP9/AV1+Opus)
  // into single standard playable video files with perfectly synchronized audio.

  // --- ISOBMFF MP4 Remuxer ---
  UVP.Muxer.parseIsoBoxes = function(buf) {
    const u8 = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
    const boxes = [];
    let pos = 0;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    while (pos < u8.length) {
      if (pos + 8 > u8.length) break;
      let size = dv.getUint32(pos);
      const type = String.fromCharCode(u8[pos + 4], u8[pos + 5], u8[pos + 6], u8[pos + 7]);
      let headerSize = 8;
      if (size === 1) {
        if (pos + 16 > u8.length) break;
        const high = dv.getUint32(pos + 8);
        const low = dv.getUint32(pos + 12);
        size = high * 0x100000000 + low;
        headerSize = 16;
      } else if (size === 0) {
        size = u8.length - pos;
      }
      if (size < headerSize || pos + size > u8.length) break;
      const raw = u8.subarray(pos, pos + size);
      const data = u8.subarray(pos + headerSize, pos + size);
      boxes.push({ type, size, headerSize, pos, raw, data });
      pos += size;
    }
    return boxes;
  };

  UVP.Muxer.buildIsoBox = function(type, payload) {
    const size = 8 + payload.length;
    const out = new Uint8Array(size);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, size);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(payload, 8);
    return out;
  };

  UVP.Muxer.rewriteTrackIdInTrak = function(trakRaw, newTrackId) {
    const trakCopy = new Uint8Array(trakRaw);
    const trakBoxes = UVP.Muxer.parseIsoBoxes(trakCopy.subarray(8));
    for (const b of trakBoxes) {
      if (b.type === 'tkhd') {
        const dv = new DataView(trakCopy.buffer, trakCopy.byteOffset + 8 + b.pos + b.headerSize, b.data.length);
        const version = trakCopy[8 + b.pos + b.headerSize];
        const trackIdOffset = (version === 1) ? 20 : 12;
        dv.setUint32(trackIdOffset, newTrackId);
      }
    }
    return trakCopy;
  };

  UVP.Muxer.rewriteStcoInTrak = function(trakRaw, offsetDelta) {
    if (!offsetDelta) return trakRaw;
    const trakCopy = new Uint8Array(trakRaw);
    const trakBoxes = UVP.Muxer.parseIsoBoxes(trakCopy.subarray(8));
    for (const mdia of trakBoxes) {
      if (mdia.type === 'mdia') {
        const mdiaBoxes = UVP.Muxer.parseIsoBoxes(mdia.data);
        for (const minf of mdiaBoxes) {
          if (minf.type === 'minf') {
            const minfBoxes = UVP.Muxer.parseIsoBoxes(minf.data);
            for (const stbl of minfBoxes) {
              if (stbl.type === 'stbl') {
                const stblBoxes = UVP.Muxer.parseIsoBoxes(stbl.data);
                for (const stco of stblBoxes) {
                  if (stco.type === 'stco') {
                    const baseOff = trakCopy.byteOffset + 8 + mdia.pos + mdia.headerSize + minf.pos + minf.headerSize + stbl.pos + stbl.headerSize + stco.pos + stco.headerSize;
                    const dv = new DataView(trakCopy.buffer, baseOff, stco.data.length);
                    const entryCount = dv.getUint32(4);
                    for (let i = 0; i < entryCount; i++) {
                      const cur = dv.getUint32(8 + i * 4);
                      dv.setUint32(8 + i * 4, cur + offsetDelta);
                    }
                  } else if (stco.type === 'co64') {
                    const baseOff = trakCopy.byteOffset + 8 + mdia.pos + mdia.headerSize + minf.pos + minf.headerSize + stbl.pos + stbl.headerSize + stco.pos + stco.headerSize;
                    const dv = new DataView(trakCopy.buffer, baseOff, stco.data.length);
                    const entryCount = dv.getUint32(4);
                    for (let i = 0; i < entryCount; i++) {
                      const cur = dv.getBigUint64(8 + i * 8);
                      dv.setBigUint64(8 + i * 8, cur + BigInt(offsetDelta));
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    return trakCopy;
  };

  UVP.Muxer.rewriteTrackIdInTrex = function(trexRaw, newTrackId) {
    const trexCopy = new Uint8Array(trexRaw);
    const dv = new DataView(trexCopy.buffer, trexCopy.byteOffset + 8, trexCopy.length - 8);
    dv.setUint32(4, newTrackId);
    return trexCopy;
  };

  UVP.Muxer.rewriteTrackIdInMoof = function(moofRaw, newTrackId) {
    const moofCopy = new Uint8Array(moofRaw);
    const moofBoxes = UVP.Muxer.parseIsoBoxes(moofCopy.subarray(8));
    for (const traf of moofBoxes) {
      if (traf.type === 'traf') {
        const trafBoxes = UVP.Muxer.parseIsoBoxes(traf.data);
        for (const tfhd of trafBoxes) {
          if (tfhd.type === 'tfhd') {
            const dv = new DataView(moofCopy.buffer, moofCopy.byteOffset + 8 + traf.pos + traf.headerSize + tfhd.pos + tfhd.headerSize, tfhd.data.length);
            dv.setUint32(4, newTrackId);
          }
        }
      }
    }
    return moofCopy;
  };

  UVP.Muxer.extractTimescaleFromMdia = function(trakRaw) {
    const trakBoxes = UVP.Muxer.parseIsoBoxes(trakRaw.subarray(8));
    for (const mdia of trakBoxes) {
      if (mdia.type === 'mdia') {
        const mdiaBoxes = UVP.Muxer.parseIsoBoxes(mdia.data);
        for (const mdhd of mdiaBoxes) {
          if (mdhd.type === 'mdhd') {
            const dv = new DataView(mdhd.data.buffer, mdhd.data.byteOffset, mdhd.data.byteLength);
            const version = mdhd.data[0];
            return dv.getUint32(version === 1 ? 20 : 12);
          }
        }
      }
    }
    return 1000;
  };

  UVP.Muxer.extractDecodeTimeFromMoof = function(moofRaw) {
    const moofBoxes = UVP.Muxer.parseIsoBoxes(moofRaw.subarray(8));
    for (const traf of moofBoxes) {
      if (traf.type === 'traf') {
        const trafBoxes = UVP.Muxer.parseIsoBoxes(traf.data);
        for (const tfdt of trafBoxes) {
          if (tfdt.type === 'tfdt') {
            const dv = new DataView(tfdt.data.buffer, tfdt.data.byteOffset, tfdt.data.byteLength);
            const version = tfdt.data[0];
            if (version === 1) {
              const high = dv.getUint32(4);
              const low = dv.getUint32(8);
              return high * 0x100000000 + low;
            }
            return dv.getUint32(4);
          }
        }
      }
    }
    return 0;
  };

  UVP.Muxer.muxMP4 = function(videoBuffer, audioBuffer) {
    const vidU8 = (videoBuffer instanceof Uint8Array) ? videoBuffer : new Uint8Array(videoBuffer);
    const audU8 = (audioBuffer instanceof Uint8Array) ? audioBuffer : new Uint8Array(audioBuffer);

    const vidBoxes = UVP.Muxer.parseIsoBoxes(vidU8);
    const audBoxes = UVP.Muxer.parseIsoBoxes(audU8);

    const ftypBox = vidBoxes.find(b => b.type === 'ftyp') || audBoxes.find(b => b.type === 'ftyp');
    const vidMoov = vidBoxes.find(b => b.type === 'moov');
    const audMoov = audBoxes.find(b => b.type === 'moov');

    if (!vidMoov || !audMoov) {
      throw new Error('Invalid MP4: Missing moov box');
    }

    const vidMoovBoxes = UVP.Muxer.parseIsoBoxes(vidMoov.data);
    const audMoovBoxes = UVP.Muxer.parseIsoBoxes(audMoov.data);

    const vidTrak = vidMoovBoxes.find(b => b.type === 'trak');
    const audTrak = audMoovBoxes.find(b => b.type === 'trak');
    if (!vidTrak || !audTrak) {
      throw new Error('Invalid MP4: Missing trak box');
    }

    const vidMvhd = vidMoovBoxes.find(b => b.type === 'mvhd');
    const vidMvex = vidMoovBoxes.find(b => b.type === 'mvex');
    const audMvex = audMoovBoxes.find(b => b.type === 'mvex');

    let rewrittenAudTrak = UVP.Muxer.rewriteTrackIdInTrak(audTrak.raw, 2);

    let mergedMvexRaw = null;
    if (vidMvex || audMvex) {
      const vidTrexList = vidMvex ? UVP.Muxer.parseIsoBoxes(vidMvex.data).filter(b => b.type === 'trex').map(b => b.raw) : [];
      const audTrexList = audMvex ? UVP.Muxer.parseIsoBoxes(audMvex.data).filter(b => b.type === 'trex').map(b => UVP.Muxer.rewriteTrackIdInTrex(b.raw, 2)) : [];
      const mvexChildren = [...vidTrexList, ...audTrexList];
      let totalMvexChildrenLen = mvexChildren.reduce((acc, c) => acc + c.length, 0);
      const mvexPayload = new Uint8Array(totalMvexChildrenLen);
      let off = 0;
      for (const c of mvexChildren) {
        mvexPayload.set(c, off);
        off += c.length;
      }
      mergedMvexRaw = UVP.Muxer.buildIsoBox('mvex', mvexPayload);
    }

    let mvhdRaw = vidMvhd ? new Uint8Array(vidMvhd.raw) : null;
    if (mvhdRaw) {
      const version = mvhdRaw[8];
      const nextTrackIdOffset = (version === 1) ? (8 + 4 + 8 + 8 + 4 + 8 + 4 + 2 + 2 + 8 + 36 + 24) : (8 + 4 + 4 + 4 + 4 + 4 + 4 + 2 + 2 + 8 + 36 + 24);
      const dv = new DataView(mvhdRaw.buffer, mvhdRaw.byteOffset);
      if (nextTrackIdOffset + 4 <= mvhdRaw.length) {
        dv.setUint32(nextTrackIdOffset, 3);
      } else {
        dv.setUint32(mvhdRaw.length - 4, 3);
      }
    }

    let moovParts = [];
    if (mvhdRaw) moovParts.push(mvhdRaw);
    moovParts.push(vidTrak.raw);
    moovParts.push(rewrittenAudTrak);
    if (mergedMvexRaw) moovParts.push(mergedMvexRaw);
    for (const b of vidMoovBoxes) {
      if (b.type !== 'mvhd' && b.type !== 'trak' && b.type !== 'mvex') moovParts.push(b.raw);
    }

    let moovPayloadLen = moovParts.reduce((acc, p) => acc + p.length, 0);
    let moovPayload = new Uint8Array(moovPayloadLen);
    let pOff = 0;
    for (const p of moovParts) { moovPayload.set(p, pOff); pOff += p.length; }
    let mergedMoov = UVP.Muxer.buildIsoBox('moov', moovPayload);

    const vidFragments = [];
    for (let i = 0; i < vidBoxes.length; i++) {
      if (vidBoxes[i].type === 'moof') {
        const moof = vidBoxes[i];
        const mdat = (i + 1 < vidBoxes.length && vidBoxes[i + 1].type === 'mdat') ? vidBoxes[i + 1] : null;
        if (mdat) {
          vidFragments.push({ moofRaw: moof.raw, mdatRaw: mdat.raw, isAudio: false });
          i++;
        }
      }
    }

    const audFragments = [];
    for (let i = 0; i < audBoxes.length; i++) {
      if (audBoxes[i].type === 'moof') {
        const moof = audBoxes[i];
        const mdat = (i + 1 < audBoxes.length && audBoxes[i + 1].type === 'mdat') ? audBoxes[i + 1] : null;
        if (mdat) {
          audFragments.push({ moofRaw: UVP.Muxer.rewriteTrackIdInMoof(moof.raw, 2), mdatRaw: mdat.raw, isAudio: true });
          i++;
        }
      }
    }

    const isFragmented = vidFragments.length > 0 || audFragments.length > 0;
    const outParts = [];
    if (ftypBox) outParts.push(ftypBox.raw);

    if (isFragmented) {
      outParts.push(mergedMoov);
      const vidTimescale = UVP.Muxer.extractTimescaleFromMdia(vidTrak.raw);
      const audTimescale = UVP.Muxer.extractTimescaleFromMdia(audTrak.raw);

      const allFrags = [];
      for (const f of vidFragments) {
        const dtime = UVP.Muxer.extractDecodeTimeFromMoof(f.moofRaw);
        allFrags.push({ ...f, normTime: vidTimescale > 0 ? (dtime / vidTimescale) : 0 });
      }
      for (const f of audFragments) {
        const dtime = UVP.Muxer.extractDecodeTimeFromMoof(f.moofRaw);
        allFrags.push({ ...f, normTime: audTimescale > 0 ? (dtime / audTimescale) : 0 });
      }

      allFrags.sort((a, b) => a.normTime - b.normTime);

      for (const f of allFrags) {
        outParts.push(f.moofRaw);
        outParts.push(f.mdatRaw);
      }
    } else {
      const vidMdat = vidBoxes.find(b => b.type === 'mdat');
      const audMdat = audBoxes.find(b => b.type === 'mdat');
      const moovShift = mergedMoov.length - vidMoov.size;
      const vidTrakShifted = UVP.Muxer.rewriteStcoInTrak(vidTrak.raw, moovShift);
      const audMdatShift = (vidMdat ? vidMdat.data.length : 0) + moovShift + (audMoov ? -audMoov.size : 0);
      const audTrakShifted = UVP.Muxer.rewriteStcoInTrak(rewrittenAudTrak, audMdatShift);

      moovParts = [];
      if (mvhdRaw) moovParts.push(mvhdRaw);
      moovParts.push(vidTrakShifted);
      moovParts.push(audTrakShifted);
      if (mergedMvexRaw) moovParts.push(mergedMvexRaw);
      for (const b of vidMoovBoxes) {
        if (b.type !== 'mvhd' && b.type !== 'trak' && b.type !== 'mvex') moovParts.push(b.raw);
      }
      moovPayloadLen = moovParts.reduce((acc, p) => acc + p.length, 0);
      moovPayload = new Uint8Array(moovPayloadLen);
      pOff = 0;
      for (const p of moovParts) { moovPayload.set(p, pOff); pOff += p.length; }
      mergedMoov = UVP.Muxer.buildIsoBox('moov', moovPayload);

      outParts.push(mergedMoov);

      if (vidMdat && audMdat) {
        const combinedMdatData = new Uint8Array(vidMdat.data.length + audMdat.data.length);
        combinedMdatData.set(vidMdat.data, 0);
        combinedMdatData.set(audMdat.data, vidMdat.data.length);
        outParts.push(UVP.Muxer.buildIsoBox('mdat', combinedMdatData));
      } else if (vidMdat) {
        outParts.push(vidMdat.raw);
      }
    }

    let finalSize = outParts.reduce((acc, p) => acc + p.length, 0);
    const finalBuf = new Uint8Array(finalSize);
    let outOff = 0;
    for (const p of outParts) {
      finalBuf.set(p, outOff);
      outOff += p.length;
    }
    return finalBuf;
  };

  // --- EBML WebM Remuxer ---
  // Combines separate VP9/AV1 WebM video and Opus WebM audio streams into a single
  // standard .webm video file with perfectly synchronized audio.
  UVP.Muxer.encodeVint = function(val) {
    if (val < 0x7F) return [0x80 | val];
    if (val < 0x3FFF) return [0x40 | (val >> 8), val & 0xFF];
    if (val < 0x1FFFFF) return [0x20 | (val >> 16), (val >> 8) & 0xFF, val & 0xFF];
    if (val < 0x0FFFFFFF) return [0x10 | (val >> 24), (val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF];
    const bytes = [];
    let temp = val;
    for (let i = 0; i < 8; i++) {
      bytes.unshift(temp & 0xFF);
      temp = Math.floor(temp / 256);
    }
    bytes[0] |= 0x01;
    return bytes;
  };

  UVP.Muxer.readEbmlId = function(buf, offset) {
    if (offset >= buf.length) return null;
    const first = buf[offset];
    let length = 1;
    let mask = 0x80;
    while (length <= 4 && (first & mask) === 0) {
      mask >>= 1;
      length++;
    }
    if (length > 4 || offset + length > buf.length) return null;
    let id = 0;
    for (let i = 0; i < length; i++) {
      id = ((id << 8) | buf[offset + i]) >>> 0;
    }
    return { id, length };
  };

  UVP.Muxer.readVint = function(buf, offset) {
    if (offset >= buf.length) return null;
    const first = buf[offset];
    let length = 1;
    let mask = 0x80;
    while (length <= 8 && (first & mask) === 0) {
      mask >>= 1;
      length++;
    }
    if (length > 8 || offset + length > buf.length) return null;
    let val = first & (mask - 1);
    for (let i = 1; i < length; i++) {
      val = (val * 256) + buf[offset + i];
    }
    return { val, length };
  };

  UVP.Muxer.buildEbmlMaster = function(idBytes, childrenBytes) {
    let totalLen = 0;
    for (let i = 0; i < childrenBytes.length; i++) totalLen += childrenBytes[i].length;
    const sizeBytes = UVP.Muxer.encodeVint(totalLen);
    const out = new Uint8Array(idBytes.length + sizeBytes.length + totalLen);
    out.set(idBytes, 0);
    out.set(sizeBytes, idBytes.length);
    let pos = idBytes.length + sizeBytes.length;
    for (let i = 0; i < childrenBytes.length; i++) {
      out.set(childrenBytes[i], pos);
      pos += childrenBytes[i].length;
    }
    return out;
  };

  UVP.Muxer.buildEbmlUint = function(idBytes, val) {
    const bytes = [];
    let temp = val;
    do {
      bytes.unshift(temp & 0xFF);
      temp = Math.floor(temp / 256);
    } while (temp > 0);
    const sizeBytes = UVP.Muxer.encodeVint(bytes.length);
    const out = new Uint8Array(idBytes.length + sizeBytes.length + bytes.length);
    out.set(idBytes, 0);
    out.set(sizeBytes, idBytes.length);
    out.set(bytes, idBytes.length + sizeBytes.length);
    return out;
  };

  UVP.Muxer.buildTimecode = function(tc) {
    return UVP.Muxer.buildEbmlUint([0xE7], Math.max(0, Math.floor(tc)));
  };

  UVP.Muxer.buildSimpleBlock = function(trackNum, relTc, flags, payload) {
    const trkVint = UVP.Muxer.encodeVint(trackNum);
    const tcInt16 = (relTc < 0) ? (0x10000 + relTc) : relTc;
    const tcBytes = [(tcInt16 >> 8) & 0xFF, tcInt16 & 0xFF];
    const headerLen = trkVint.length + 2 + 1;
    const totalLen = headerLen + payload.length;
    const sizeBytes = UVP.Muxer.encodeVint(totalLen);
    const out = new Uint8Array(1 + sizeBytes.length + totalLen);
    out[0] = 0xA3;
    out.set(sizeBytes, 1);
    let pos = 1 + sizeBytes.length;
    out.set(trkVint, pos); pos += trkVint.length;
    out.set(tcBytes, pos); pos += 2;
    out[pos] = flags; pos += 1;
    out.set(payload, pos);
    return out;
  };

  UVP.Muxer.parseWebm = function(buffer) {
    const buf = (buffer instanceof Uint8Array) ? buffer : new Uint8Array(buffer);
    let offset = 0;
    let header = null;
    let info = null;
    let trackEntry = null;
    const blocks = [];

    const ebmlId = UVP.Muxer.readEbmlId(buf, offset);
    if (!ebmlId || ebmlId.id !== 0x1A45DFA3) throw new Error('Not a valid WebM: Missing EBML header');
    offset += ebmlId.length;
    const headerSize = UVP.Muxer.readVint(buf, offset);
    if (!headerSize) throw new Error('Invalid EBML header size');
    offset += headerSize.length;
    header = buf.slice(0, offset + headerSize.val);
    offset += headerSize.val;

    const segId = UVP.Muxer.readEbmlId(buf, offset);
    if (!segId || segId.id !== 0x18538067) throw new Error('Missing Segment');
    offset += segId.length;
    const segSize = UVP.Muxer.readVint(buf, offset);
    offset += segSize.length;

    const segEnd = (segSize.val < 0x01FFFFFFFFFFFFFF) ? offset + segSize.val : buf.length;

    while (offset < segEnd && offset < buf.length) {
      const elId = UVP.Muxer.readEbmlId(buf, offset);
      if (!elId) break;
      offset += elId.length;
      const elSize = UVP.Muxer.readVint(buf, offset);
      if (!elSize) break;
      offset += elSize.length;
      const contentStart = offset;
      const nextOffset = contentStart + elSize.val;

      if (elId.id === 0x1549A966) { // Info
        info = buf.slice(contentStart - elId.length - elSize.length, nextOffset);
      } else if (elId.id === 0x1654AE6B) { // Tracks
        let tOffset = contentStart;
        while (tOffset < nextOffset) {
          const tId = UVP.Muxer.readEbmlId(buf, tOffset);
          if (!tId) break;
          tOffset += tId.length;
          const tSize = UVP.Muxer.readVint(buf, tOffset);
          if (!tSize) break;
          tOffset += tSize.length;
          if (tId.id === 0xAE) { // TrackEntry
            trackEntry = buf.slice(tOffset - tId.length - tSize.length, tOffset + tSize.val);
          }
          tOffset += tSize.val;
        }
      } else if (elId.id === 0x1F43B675) { // Cluster
        let cOffset = contentStart;
        let clusterTimecode = 0;
        while (cOffset < nextOffset) {
          const cId = UVP.Muxer.readEbmlId(buf, cOffset);
          if (!cId) break;
          cOffset += cId.length;
          const cSize = UVP.Muxer.readVint(buf, cOffset);
          if (!cSize) break;
          cOffset += cSize.length;
          const cDataStart = cOffset;
          if (cId.id === 0xE7) { // Timecode
            let tc = 0;
            for (let i = 0; i < cSize.val; i++) tc = (tc << 8) | buf[cDataStart + i];
            clusterTimecode = tc;
          } else if (cId.id === 0xA3 || cId.id === 0xA0) { // SimpleBlock
            let blkBuf = buf.slice(cDataStart, cDataStart + cSize.val);
            const trkVint = UVP.Muxer.readVint(blkBuf, 0);
            if (trkVint) {
              const relTc = (blkBuf[trkVint.length] << 8) | blkBuf[trkVint.length + 1];
              const signedRelTc = (relTc >= 0x8000) ? relTc - 0x10000 : relTc;
              const absTimecode = clusterTimecode + signedRelTc;
              const flags = blkBuf[trkVint.length + 2];
              const payload = blkBuf.slice(trkVint.length + 3);
              blocks.push({
                timecode: absTimecode,
                flags,
                payload
              });
            }
          }
          cOffset += cSize.val;
        }
      }
      offset = nextOffset;
    }
    return { header, info, trackEntry, blocks };
  };

  UVP.Muxer.rewriteTrackEntry = function(rawTrackEntry, trackNum, trackType) {
    const buf = (rawTrackEntry instanceof Uint8Array) ? rawTrackEntry : new Uint8Array(rawTrackEntry);
    let offset = 0;
    const tId = UVP.Muxer.readEbmlId(buf, offset);
    offset += tId.length;
    const tSize = UVP.Muxer.readVint(buf, offset);
    offset += tSize.length;

    const children = [];
    children.push(UVP.Muxer.buildEbmlUint([0xD7], trackNum)); // TrackNumber
    children.push(UVP.Muxer.buildEbmlUint([0x73, 0xC5], trackNum)); // TrackUID
    children.push(UVP.Muxer.buildEbmlUint([0x83], trackType)); // TrackType

    while (offset < buf.length) {
      const elId = UVP.Muxer.readEbmlId(buf, offset);
      if (!elId) break;
      offset += elId.length;
      const elSize = UVP.Muxer.readVint(buf, offset);
      if (!elSize) break;
      offset += elSize.length;
      if (elId.id !== 0xD7 && elId.id !== 0x73C5 && elId.id !== 0x83) {
        const elRaw = buf.slice(offset - elId.length - elSize.length, offset + elSize.val);
        children.push(elRaw);
      }
      offset += elSize.val;
    }
    return UVP.Muxer.buildEbmlMaster([0xAE], children);
  };

  UVP.Muxer.muxWebM = function(videoBuffer, audioBuffer) {
    const vid = UVP.Muxer.parseWebm(videoBuffer);
    const aud = UVP.Muxer.parseWebm(audioBuffer);

    const vidTrackEntry = UVP.Muxer.rewriteTrackEntry(vid.trackEntry, 1, 1);
    const audTrackEntry = UVP.Muxer.rewriteTrackEntry(aud.trackEntry, 2, 2);

    const allBlocks = [];
    for (let i = 0; i < vid.blocks.length; i++) {
      const b = vid.blocks[i];
      allBlocks.push({ track: 1, timecode: b.timecode, flags: b.flags, payload: b.payload });
    }
    for (let i = 0; i < aud.blocks.length; i++) {
      const b = aud.blocks[i];
      allBlocks.push({ track: 2, timecode: b.timecode, flags: b.flags, payload: b.payload });
    }
    allBlocks.sort((a, b) => a.timecode - b.timecode);

    const tracksBytes = UVP.Muxer.buildEbmlMaster([0x16, 0x54, 0xAE, 0x6B], [vidTrackEntry, audTrackEntry]);

    const clusterBytes = [];
    let currentClusterTc = 0;
    let currentClusterBlocks = [];

    const flushCluster = () => {
      if (currentClusterBlocks.length === 0) return;
      const tcBytes = UVP.Muxer.buildTimecode(currentClusterTc);
      const blkElements = currentClusterBlocks.map(b => UVP.Muxer.buildSimpleBlock(b.track, b.timecode - currentClusterTc, b.flags, b.payload));
      const cluster = UVP.Muxer.buildEbmlMaster([0x1F, 0x43, 0xB6, 0x75], [tcBytes, ...blkElements]);
      clusterBytes.push(cluster);
      currentClusterBlocks = [];
    };

    for (let i = 0; i < allBlocks.length; i++) {
      const b = allBlocks[i];
      if (currentClusterBlocks.length > 0 && (b.timecode - currentClusterTc >= 1000 || (b.track === 1 && (b.flags & 0x80)))) {
        flushCluster();
        currentClusterTc = b.timecode;
      }
      currentClusterBlocks.push(b);
    }
    flushCluster();

    const segChildren = [];
    if (vid.info) segChildren.push(vid.info);
    segChildren.push(tracksBytes);
    for (let i = 0; i < clusterBytes.length; i++) segChildren.push(clusterBytes[i]);

    const segmentBytes = UVP.Muxer.buildEbmlMaster([0x18, 0x53, 0x80, 0x67], segChildren);

    const finalLen = vid.header.length + segmentBytes.length;
    const finalBuf = new Uint8Array(finalLen);
    finalBuf.set(vid.header, 0);
    finalBuf.set(segmentBytes, vid.header.length);
    return finalBuf;
  };

  // ==================== MPD BUILDER ====================
  // NewPipe/FastStream architecture. YouTube serves its highest resolutions
  // ONLY as DASH: separate video-only and audio-only fMP4/WebM streams
  // addressed by byte ranges (initRange/indexRange in the InnerTube player
  // response). Rather than hand-rolling a scheduler (the v4.3.x experiment —
  // see ADGUARD-INSTALL.md for the quota/thrash history), we do what NewPipe
  // (DashManifestCreator → ExoPlayer) and FastStream (YouTube.js → dash.js)
  // do: generate a DASH manifest client-side from the deciphered format list
  // and hand it to a real DASH engine. Each Representation points at the
  // googlevideo URL with SegmentBase + Initialization ranges; dash.js fetches
  // the sidx/Cues index itself, appends video+audio SourceBuffers to ONE
  // <video> (native controls own both tracks, browser-managed A/V sync), and
  // runs production ABR.

  // XML-escape a BaseURL/attribute value — googlevideo URLs are full of &.
  UVP.MPD.xmlEscape = function(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  };
  UVP.MPD.codecsOf = function(mimeType, height) {
    const m = String(mimeType || '').match(/codecs="?([^";]+?)"?\s*(?:;|$)/i);
    let c = m ? m[1].trim() : '';
    if (/^vp0?9$/i.test(c)) {
      const h = Number(height) || 0;
      if (h >= 2160) c = 'vp09.00.51.08';
      else if (h >= 1440) c = 'vp09.00.41.08';
      else if (h >= 1080) c = 'vp09.00.31.08';
      else if (h >= 720) c = 'vp09.00.21.08';
      else c = 'vp09.00.10.08';
    }
    return c;
  };
  // Codec fourcc family — the SourceBuffer granularity: ONE codec family
  // per AdaptationSet is mandatory in practice (a SourceBuffer initialized
  // for avc1 cannot decode vp9/av01 samples), so ladders are grouped by
  // codec family, not just container.
  UVP.MPD.codecFamily = function(mimeType) {
    const codecs = UVP.MPD.codecsOf(mimeType);
    const m = codecs.match(/^(avc1|avc3|vp09|vp9|vp8|av01|hvc1|hev1|mp4a|opus|flac|ec-3|ac-3)/i);
    if (!m) return null;
    return m[1].toLowerCase().replace(/^vp09$/, 'vp9');
  };
  UVP.MPD.isAudioEntry = function(x) { return String((x && x.info && x.info.mimeType) || '').indexOf('audio/') === 0; };
  // A SourceBuffer can only be created for mimeTypes the browser decodes,
  // so every Representation must pass MediaSource.isTypeSupported — this
  // also auto-selects the ladder per browser (Safari → avc1/mp4a,
  // Chrome/Edge/Firefox → the vp9/opus families YouTube prefers).
  UVP.MPD.isSupportedMime = function(mimeType, height) {
    try {
      if (typeof window.MediaSource !== 'function' || typeof window.MediaSource.isTypeSupported !== 'function') return false;
      if (window.MediaSource.isTypeSupported(mimeType)) return true;
      const baseMime = (mimeType || '').split(';')[0].trim();
      const codecs = UVP.MPD.codecsOf(mimeType, height);
      if (codecs && baseMime) return !!window.MediaSource.isTypeSupported(baseMime + '; codecs="' + codecs + '"');
      return false;
    } catch (e) { return false; }
  };
  // An entry is usable for the manifest iff deciphered (an undeciphered
  // n-param throttles googlevideo to ~50KB/s), carrying range metadata, of
  // a known codec family, and decodable by THIS browser.
  UVP.MPD.usableEntry = function(x) {
    const info = x && x.info;
    if (!info || !x.u || info.isHls || info.isLive) return false;
    if (!info.initRange || !info.indexRange || !info.mimeType) return false;
    if (!UVP.MPD.codecsOf(info.mimeType, info.height) || !UVP.MPD.codecFamily(info.mimeType)) return false;
    if (info.hasN === true || (info.hasN !== false && /[?&]n=/.test(x.u))) {
      if (!ytDecipheredUrls.has(x.u)) return false;
    }
    if (!UVP.Utils.isUsableUrl(x.u)) return false;
    return UVP.MPD.isSupportedMime(info.mimeType, info.height);
  };
  UVP.MPD.compareVideo = function(a, b) {
    return ((a.info.height || 0) - (b.info.height || 0)) || ((a.info.fps || 0) - (b.info.fps || 0)) || ((a.info.bitrate || 0) - (b.info.bitrate || 0));
  };
  // Video ladder selection — the codec family whose TOP reachable rendition
  // is best wins (2160p/1440p exists only as VP9/AV1, so those families win
  // exactly when they outrank mp4/AVC). Ties at equal (height, fps) prefer
  // the efficiency codecs YouTube itself prefers (vp9 > av01 > avc1);
  // browsers that cannot decode a family never see it (the
  // isTypeSupported filter), so Safari lands on the avc1 ladder.
  const MPD_CODEC_PREF = { vp9: 3, av01: 2, hvc1: 2, hev1: 2, avc1: 1, avc3: 1, vp8: 0 };
  UVP.MPD.pickVideoFamily = function(videoEntries) {
    const byFamily = new Map();
    for (const x of videoEntries) {
      if (!UVP.MPD.usableEntry(x)) continue;
      const f = UVP.MPD.codecFamily(x.info.mimeType);
      if (!byFamily.has(f)) byFamily.set(f, []);
      byFamily.get(f).push(x);
    }
    let bestList = null, bestKey = null;
    for (const list of byFamily.values()) {
      const top = list.reduce((a, b) => {
        const ah = a.info.height || 0, bh = b.info.height || 0;
        if (bh !== ah) return bh > ah ? b : a;
        return (b.info.fps || 0) > (a.info.fps || 0) ? b : a;
      });
      const key = [top.info.height || 0, top.info.fps || 0, MPD_CODEC_PREF[UVP.MPD.codecFamily(top.info.mimeType)] || 0];
      if (!bestKey ||
          key[0] > bestKey[0] ||
          (key[0] === bestKey[0] && key[1] > bestKey[1]) ||
          (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] > bestKey[2])) { bestKey = key; bestList = list; }
    }
    return bestList ? bestList.sort(UVP.MPD.compareVideo) : [];
  };
  // Audio ladder: the family with the highest supported bitrate (ties
  // prefer mp4a for compatibility). Every quality of that family becomes a
  // Representation, so ABR can drop audio bitrate under bandwidth pressure.
  UVP.MPD.pickAudioFamily = function(audioEntries) {
    // A DASH Representation switch must never change spoken language. First
    // select YouTube's one logical default/original track, then build the
    // bitrate ladder within one codec family of that track only.
    audioEntries = UVP.Extractors.selectYouTubeAudioTrack(audioEntries);
    const byFamily = new Map();
    for (const x of audioEntries) {
      if (!UVP.MPD.usableEntry(x)) continue;
      const f = UVP.MPD.codecFamily(x.info.mimeType);
      if (!byFamily.has(f)) byFamily.set(f, []);
      byFamily.get(f).push(x);
    }
    let bestList = null, bestBr = -1;
    for (const list of byFamily.values()) {
      // The same itag can be repeated by multiple InnerTube clients for one
      // logical track. Keep one deterministic best URL per itag so dash.js
      // does not see redundant qualities or ambiguous representation IDs.
      const byItag = new Map();
      for (const x of list) {
        const key = String(x.info.itag || 0);
        const prior = byItag.get(key);
        if (!prior || (x.info.bitrate || 0) > (prior.info.bitrate || 0) || ((x.info.bitrate || 0) === (prior.info.bitrate || 0) && String(x.u) < String(prior.u))) byItag.set(key, x);
      }
      const unique = [...byItag.values()];
      const topBr = Math.max(0, ...unique.map(x => x.info.bitrate || 0));
      if (topBr > bestBr) { bestBr = topBr; bestList = unique; }
    }
    return bestList ? bestList.sort((a, b) => (a.info.bitrate || 0) - (b.info.bitrate || 0)) : [];
  };
  // Build the manifest from [{u, info}] entries. PURE — no DOM/network —
  // so the pipeline harness can fixture it end-to-end. Returns
  // { mpd, videoReps, audioReps } (reps = the ordered ladders), or null when
  // no usable video representation (or no duration) exists. The caller owns
  // Blob/createObjectURL and the dash.js session.
  UVP.MPD.buildYouTubeMpd = function(entries, durationMs) {
    try {
      if (!Array.isArray(entries) || !entries.length) return null;
      const usable = entries.filter(UVP.MPD.usableEntry);
      if (!usable.length) return null;
      const videoReps = UVP.MPD.pickVideoFamily(usable.filter(x => !UVP.MPD.isAudioEntry(x)));
      if (!videoReps.length) return null;
      const audioReps = UVP.MPD.pickAudioFamily(usable.filter(x => UVP.MPD.isAudioEntry(x)));
      const durMs = Number(durationMs) || 0;
      if (!(durMs > 0)) return null; // a static MPD needs mediaPresentationDuration (VOD always has approxDurationMs)
      const usedRepIds = new Set();
      const rep = (x) => {
        const i = x.info;
        const baseId = String(i.itag || 0);
        let repId = baseId;
        if (usedRepIds.has(repId)) {
          const trackSuffix = String(i.audioTrackId || 'track').replace(/[^a-zA-Z0-9_.-]/g, '_');
          repId = baseId + '-' + trackSuffix;
          let n = 2;
          while (usedRepIds.has(repId)) repId = baseId + '-' + trackSuffix + '-' + n++;
        }
        usedRepIds.add(repId);
        const baseMime = (i.mimeType || '').split(';')[0].trim();
        const codecs = UVP.MPD.codecsOf(i.mimeType, i.height);
        const attrs = [
          'id="' + UVP.MPD.xmlEscape(repId) + '"',
          'bandwidth="' + (i.bitrate || 0) + '"',
          'mimeType="' + UVP.MPD.xmlEscape(baseMime) + '"'
        ];
        if (codecs) attrs.push('codecs="' + UVP.MPD.xmlEscape(codecs) + '"');
        if (UVP.MPD.isAudioEntry(x)) {
          if (i.audioSampleRate) attrs.push('audioSamplingRate="' + Number(i.audioSampleRate) + '"');
        } else {
          if (i.width) attrs.push('width="' + Number(i.width) + '"');
          if (i.height) attrs.push('height="' + Number(i.height) + '"');
          if (i.fps) attrs.push('frameRate="' + Number(i.fps) + '"');
        }
        return '<Representation ' + attrs.join(' ') + '>' +
          '<BaseURL>' + UVP.MPD.xmlEscape(x.u) + '</BaseURL>' +
          '<SegmentBase indexRange="' + Number(i.indexRange.start) + '-' + Number(i.indexRange.end) + '">' +
          '<Initialization range="' + Number(i.initRange.start) + '-' + Number(i.initRange.end) + '"/>' +
          '</SegmentBase></Representation>';
      };
      const parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-main:2011" type="static" mediaPresentationDuration="PT' + (durMs / 1000).toFixed(3) + 'S" minBufferTime="PT1.5S">',
        '<Period id="0" start="PT0S">',
      ];
      if (audioReps.length) {
        const audioInfo = audioReps[0].info || {};
        const audioMime = (audioInfo.mimeType || '').split(';')[0].trim();
        const audioCodecs = UVP.MPD.codecsOf(audioInfo.mimeType);
        const audioSampleRate = audioInfo.audioSampleRate ? (' audioSamplingRate="' + Number(audioInfo.audioSampleRate) + '"') : '';
        const audioLang = audioInfo.audioLanguage || 'und';
        const audioLabel = audioInfo.audioTrackName ? ('<Label>' + UVP.MPD.xmlEscape(audioInfo.audioTrackName) + '</Label>') : '';
        const audioRole = audioInfo.audioIsDefault || audioInfo.audioIsOriginal ? '<Role schemeIdUri="urn:mpeg:dash:role:2011" value="main"/>' : '';
        parts.push('<AdaptationSet id="0" contentType="audio" mimeType="' + UVP.MPD.xmlEscape(audioMime) + '" codecs="' + UVP.MPD.xmlEscape(audioCodecs) + '"' + audioSampleRate + ' lang="' + UVP.MPD.xmlEscape(audioLang) + '" segmentAlignment="true" subsegmentAlignment="true" subsegmentStartsWithSAP="1" startWithSAP="1">' + audioLabel + audioRole);
        for (const x of audioReps) parts.push(rep(x));
        parts.push('</AdaptationSet>');
      }
      const videoMime = (videoReps[0].info.mimeType || '').split(';')[0].trim();
      const videoCodecs = UVP.MPD.codecsOf(videoReps[0].info.mimeType, videoReps[0].info.height);
      const videoFps = videoReps[0].info.fps ? (' frameRate="' + Number(videoReps[0].info.fps) + '"') : '';
      parts.push('<AdaptationSet id="1" contentType="video" mimeType="' + UVP.MPD.xmlEscape(videoMime) + '" codecs="' + UVP.MPD.xmlEscape(videoCodecs) + '"' + videoFps + ' maxPlayoutRate="1" segmentAlignment="true" subsegmentAlignment="true" subsegmentStartsWithSAP="1" startWithSAP="1">');
      for (const x of videoReps) parts.push(rep(x));
      parts.push('</AdaptationSet>');
      parts.push('</Period></MPD>');
      return { mpd: parts.join(''), videoReps, audioReps };
    } catch (e) { if (DEBUG) console.warn('[UVP] MPD build failed:', e); return null; }
  };

  // ==================== UNIVERSAL CSP-PROOF BUNDLE LOADER ====================
  // High-performance, CSP-resilient and AdGuard/Tampermonkey compatible loader.
  // Strategy:
  // 1. Check existing window/unsafeWindow/globalThis global (immediate resolution).
  // 2. Page-context CORS fetch() (allowed by connect-src, avoids script-src CSP blocks).
  // 3. GM_xmlhttpRequest (privileged background bypass, handles AdGuard string/ArrayBuffer).
  // 4. DOM <script> element injection (fallback for non-CSP browsers).
  // 5. Automatic multi-CDN fallback (jsdelivr -> unpkg) with SHA-384 verification.

  async function verifyAndEvalBundle(rawPayload, integrity, globalProp, name) {
    if (!rawPayload) throw new Error('Empty payload');
    let u8;
    if (rawPayload instanceof ArrayBuffer) {
      u8 = new Uint8Array(rawPayload);
    } else if (ArrayBuffer.isView(rawPayload)) {
      u8 = new Uint8Array(rawPayload.buffer, rawPayload.byteOffset, rawPayload.byteLength);
    } else if (typeof rawPayload === 'string') {
      u8 = new TextEncoder().encode(rawPayload);
    } else {
      u8 = new TextEncoder().encode(String(rawPayload));
    }

    if (integrity && integrity.indexOf('sha384-') === 0) {
      if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
        const digest = await crypto.subtle.digest('SHA-384', u8);
        const bytes = new Uint8Array(digest);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const computed = 'sha384-' + btoa(binary);
        if (computed !== integrity) {
          throw new Error(name === 'dash.js' ? 'dash.js GM fallback integrity mismatch' : (name + ' GM fallback integrity mismatch'));
        }
      }
    }

    const code = new TextDecoder('utf-8').decode(u8);
    const w = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
    const factory = UVP.Utils.safeNewFunction('window', 'self', 'globalThis', code + '\n; return (typeof ' + globalProp + ' !== "undefined" && ' + globalProp + ') ? ' + globalProp + ' : ((typeof window !== "undefined" && window["' + globalProp + '"]) || (typeof self !== "undefined" && self["' + globalProp + '"]) || (typeof globalThis !== "undefined" && globalThis["' + globalProp + '"]) || null);');
    const lib = factory.call(w, w, w, w) || (w && w[globalProp]) || (typeof window !== 'undefined' && window[globalProp]) || (typeof globalThis !== 'undefined' && globalThis[globalProp]);
    if (lib) {
      try { if (typeof window !== 'undefined') window[globalProp] = lib; } catch (e) {}
      try { if (typeof unsafeWindow !== 'undefined') unsafeWindow[globalProp] = lib; } catch (e) {}
      try { if (typeof globalThis !== 'undefined') globalThis[globalProp] = lib; } catch (e) {}
      return lib;
    }
    throw new Error(name + ' bundle evaluated but ' + globalProp + ' global missing');
  }

  function loadBundleViaGm(cdn, globalProp, name) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') { reject(new Error('GM_xmlhttpRequest unavailable')); return; }
      if (!cdn.integrity || cdn.integrity.indexOf('sha384-') !== 0) { reject(new Error('no SRI hash for GM fallback')); return; }
      GM_xmlhttpRequest({
        method: 'GET', url: cdn.src, timeout: 30000, responseType: 'arraybuffer',
        onload: async (r) => {
          if (r.status !== 200) { reject(new Error('HTTP ' + r.status)); return; }
          const payload = r.response || r.responseText;
          if (!payload) { reject(new Error('empty GM response')); return; }
          try {
            const lib = await verifyAndEvalBundle(payload, cdn.integrity, globalProp, name);
            resolve(lib);
          } catch (e) { reject(e); }
        },
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout'))
      });
    });
  }

  function loadCdnBundle(options) {
    const name = options.name;
    const globalProp = options.globalProp;
    const sources = options.sources || [];
    const isLoaded = options.isLoaded || (() => false);

    return new Promise((resolve, reject) => {
      try {
        const w = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
        const existing = (w && w[globalProp]) ||
                         (typeof window !== 'undefined' && window[globalProp]) ||
                         (typeof globalThis !== 'undefined' && globalThis[globalProp]);
        if (existing && isLoaded(existing)) return resolve(existing);
      } catch (e) {}

      let cdnIdx = 0;

      async function tryFetch(cdn) {
        const fetchFn = (typeof origFetch === 'function') ? origFetch : (typeof fetch === 'function' ? fetch : null);
        if (!fetchFn) throw new Error('fetch unavailable');
        const res = await fetchFn(cdn.src, { mode: 'cors' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = await res.arrayBuffer();
        return await verifyAndEvalBundle(buf, cdn.integrity, globalProp, name);
      }

      function tryScriptTag(cdn) {
        return new Promise((resTag, rejTag) => {
          const script = document.createElement('script');
          try { const sUrl = UVP_TT.scriptURL(cdn.src); script.src = (typeof ADG_policyApi !== 'undefined' && ADG_policyApi) ? ADG_policyApi.createScriptURL(cdn.src) : sUrl; }
          catch (ttErr) {
            try { script.src = cdn.src; } catch (ttErr2) { rejTag(ttErr2); return; }
          }
          script.crossOrigin = 'anonymous'; script.async = true;
          if (cdn.integrity) script.integrity = cdn.integrity;
          script.onload = () => {
            const w = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
            const lib = (w && w[globalProp]) || (typeof window !== 'undefined' && window[globalProp]) || (typeof globalThis !== 'undefined' && globalThis[globalProp]);
            if (lib && isLoaded(lib)) resTag(lib); else rejTag(new Error(name + ' script loaded but global missing'));
          };
          script.onerror = () => rejTag(new Error(name + ' script tag error'));
          (document.head || document.documentElement).appendChild(script);
        });
      }

      async function attemptCdn(cdn) {
        try {
          return await tryFetch(cdn);
        } catch (fetchErr) {
          if (DEBUG) console.warn('[UVP] ' + name + ' fetch failed, trying GM_xmlhttpRequest:', fetchErr && fetchErr.message);
        }
        try {
          return await loadBundleViaGm(cdn, globalProp, name);
        } catch (gmErr) {
          if (DEBUG) console.warn('[UVP] ' + name + ' GM failed, trying script tag:', gmErr && gmErr.message);
        }
        return await tryScriptTag(cdn);
      }

      async function runNext() {
        if (cdnIdx >= sources.length) {
          reject(new Error(name + ' load failed — all CDNs unavailable'));
          return;
        }
        const cdn = sources[cdnIdx];
        try {
          const lib = await attemptCdn(cdn);
          resolve(lib);
        } catch (e) {
          cdnIdx++;
          runNext();
        }
      }

      runNext();
    });
  }

  // ==================== PLAYER LIBRARY RESOLUTION ====================
  // @require (userscript metadata header) is the fast path, but userscript
  // managers wrap @require bundles in CommonJS shims (module/exports), so the
  // UMD wrappers inside hls.js/dash.js land on module.exports instead of a
  // reachable global — and AdGuard/uBlock can filter the CDN request itself.
  // Scan every reachable realm (plus module.exports) before giving up;
  // loadCdnBundle above is the runtime fallback chain.
  function resolvePlayerLib(globalProp, isLoaded) {
    const bags = [];
    const push = (x) => { try { if (x) bags.push(x); } catch (e) {} };
    if (globalProp === 'Hls') { try { if (typeof Hls !== 'undefined') push(Hls); } catch (e) {} }
    if (globalProp === 'dashjs') { try { if (typeof dashjs !== 'undefined') push(dashjs); } catch (e) {} }
    push(typeof globalThis !== 'undefined' ? globalThis : null);
    push(typeof self !== 'undefined' ? self : null);
    push(typeof window !== 'undefined' ? window : null);
    push((typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : null);
    try { if (typeof module === 'object' && module) push(module.exports); } catch (e) {}
    for (const bag of bags) {
      if (isLoaded(bag)) return bag;
      try {
        const lib = bag && bag[globalProp];
        if (isLoaded(lib)) return lib;
      } catch (e) {}
    }
    return null;
  }

  function pinPlayerLib(globalProp, lib) {
    try { if (typeof window !== 'undefined') window[globalProp] = lib; } catch (e) {}
    try { if (typeof self !== 'undefined') self[globalProp] = lib; } catch (e) {}
    try { if (typeof globalThis !== 'undefined') globalThis[globalProp] = lib; } catch (e) {}
    try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow) unsafeWindow[globalProp] = lib; } catch (e) {}
  }

  // ==================== HLS PLAYER INTEGRATION ====================
  const HLS_CDN_SOURCES = [
    { src: 'https://cdn.jsdelivr.net/npm/hls.js@1.7.1/dist/hls.min.js', integrity: 'sha384-X6qxWXYhVZFp6V31bNDBz4eOoPnZloPbOdTcnhnvRJY2+2pDMrO7R4/1mXfJ9VXY' },
    { src: 'https://unpkg.com/hls.js@1.7.1/dist/hls.min.js', integrity: 'sha384-X6qxWXYhVZFp6V31bNDBz4eOoPnZloPbOdTcnhnvRJY2+2pDMrO7R4/1mXfJ9VXY' },
  ];
  UVP.Overlay.loadHlsScript = function() {
    const lib = resolvePlayerLib('Hls', (x) => !!(x && (typeof x.isSupported === 'function' || x.Events)));
    if (lib) { pinPlayerLib('Hls', lib); return Promise.resolve(lib); }
    return loadCdnBundle({
      name: 'hls.js',
      globalProp: 'Hls',
      sources: HLS_CDN_SOURCES,
      isLoaded: (lib) => !!(lib && (typeof lib.isSupported === 'function' || lib.Events))
    });
  };

  // Follow hls.js's native-playback guidance: Safari's ManagedMediaSource
  // identifies a browser whose native HLS path can reliably handle adaptive
  // manifests. Chromium may report "maybe" from canPlayType() without having
  // ManagedMediaSource; treating that as native support causes demuxed live
  // masters to buffer briefly and then fail.
  UVP.Overlay.shouldUseHlsJs = function(video) {
    try {
      const nativeHls = !!(video &&
        typeof video.canPlayType === 'function' &&
        video.canPlayType('application/vnd.apple.mpegurl'));
      const hasManagedMediaSource =
        typeof window !== 'undefined' && 'ManagedMediaSource' in window;
      return !(nativeHls && hasManagedMediaSource);
    } catch (e) {
      return true;
    }
  };

  // ==================== DASH PLAYER INTEGRATION ====================
  const DASH_CDN_SOURCES = [
    { src: 'https://cdn.jsdelivr.net/npm/dashjs@5.2.1/dist/modern/umd/dash.all.min.js', integrity: 'sha384-NwbBGevMmVf2Lv50ZqQWLZ0dLH69dxVHYeS+8t54klP9odovQ2+Ms0J4SWfKzPkr' },
    { src: 'https://unpkg.com/dashjs@5.2.1/dist/modern/umd/dash.all.min.js', integrity: 'sha384-NwbBGevMmVf2Lv50ZqQWLZ0dLH69dxVHYeS+8t54klP9odovQ2+Ms0J4SWfKzPkr' },
  ];
  UVP.Overlay.loadDashScript = function() {
    const lib = resolvePlayerLib('dashjs', (x) => !!(x && typeof x.MediaPlayer === 'function'));
    if (lib) { pinPlayerLib('dashjs', lib); return Promise.resolve(lib); }
    return loadCdnBundle({
      name: 'dash.js',
      globalProp: 'dashjs',
      sources: DASH_CDN_SOURCES,
      isLoaded: (lib) => !!(lib && typeof lib.MediaPlayer === 'function')
    });
  };

  // Destroys dash.js instance and revokes MPD blob URL.
  UVP.Overlay.destroyDashSession = function() {
    state.dashFailover = null;
    if (state.dashActivity) {
      if (state.dashActivity.recoveryTimer) { clearTimeout(state.dashActivity.recoveryTimer); state.dashActivity.recoveryTimer = null; }
      if (state.dashActivity.unhookVideo) { try { state.dashActivity.unhookVideo(); } catch (e) {} }
      state.dashActivity = null;
    }
    if (state.dashPlayer) {
      const p = state.dashPlayer;
      state.dashPlayer = null;
      try { p.destroy(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    }
    if (state.dashMpdUrl && state.dashMpdOwned) { try { URL.revokeObjectURL(state.dashMpdUrl); } catch (e) {} }
    state.dashMpdUrl = null;
    state.dashMpdOwned = false;
  };

  // Shared dash.js entry point for generated YouTube MPDs and external MPDs.
  // This function owns the complete DASH session lifecycle. Callers supply
  // exactly one manifest source and retain responsibility only for fallback
  // policy through onFail(reason).
  UVP.Overlay.startDashPlayback = async function(options) {
    options = options || {};
    const video = options.video;
    const generation = options.generation;
    const externalMpdUrl = options.externalMpdUrl || null;
    const mpdText = options.mpdText || null;
    const onFail = typeof options.onFail === 'function' ? options.onFail : () => {};
    const dynamicHint = options.dynamicHint === true;
    const hasExternal = typeof externalMpdUrl === 'string' && /^https?:\/\//i.test(externalMpdUrl);
    const hasGenerated = typeof mpdText === 'string' && mpdText.length > 0;

    if (!video) throw new Error('DASH video element missing');
    if (hasExternal === hasGenerated) throw new Error('DASH requires exactly one manifest source');

    const sessionCurrent = () =>
      !!state.overlay &&
      state.video === video &&
      state.overlayGeneration === generation;

    let DashLib = null;
    let player = null;
    let mpdUrl = externalMpdUrl;
    let mpdOwned = false;
    let activity = null;
    let failed = false;

    const releaseLocalSession = () => {
      if (activity && activity.recoveryTimer) {
        clearTimeout(activity.recoveryTimer);
        activity.recoveryTimer = null;
      }
      if (activity && activity.unhookVideo) {
        try { activity.unhookVideo(); } catch (e) {}
        activity.unhookVideo = null;
      }
      if (state.dashActivity === activity) state.dashActivity = null;
      // Only tear down shared state when both identifiers still belong to
      // this session. An older async session may reuse the same external MPD
      // URL and must never destroy a newer player registered for that URL.
      if (state.dashPlayer === player && state.dashMpdUrl === mpdUrl) {
        UVP.Overlay.destroyDashSession();
      } else {
        if (player) {
          try { player.destroy(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
        }
        if (mpdOwned && mpdUrl) {
          try { URL.revokeObjectURL(mpdUrl); } catch (e) {}
        }
      }
      player = null;
      activity = null;
    };

    const fail = (reason) => {
      if (failed) return;
      failed = true;
      const current = sessionCurrent();
      releaseLocalSession();
      if (current) onFail(String(reason || 'unknown DASH failure'));
    };

    try {
      DashLib = await UVP.Overlay.loadDashScript();
      if (!sessionCurrent()) return null;

      if (hasGenerated) {
        const blob = new Blob([mpdText], { type: 'application/dash+xml' });
        mpdUrl = URL.createObjectURL(blob);
        mpdOwned = true;
      }

      player = DashLib.MediaPlayer().create();
      if (!player) throw new Error('dash.js player creation failed');

      const vodSettings = {
        streaming: {
          buffer: {
            fastSwitchEnabled: true,
            bufferTimeDefault: 24,
            bufferTimeAtTopQuality: 36,
            bufferTimeAtTopQualityLongForm: 60,
            longFormContentDurationThreshold: 600,
            bufferToKeep: 30,
            bufferPruningInterval: 10
          },
          abr: {
            autoSwitchBitrate: { video: true, audio: true },
            throughput: { bandwidthSafetyFactor: 0.85 },
            rules: {
              insufficientBufferRule: { active: true },
              abandonRequestsRule: { active: true }
            },
            limitBitrateByPortal: false,
            usePixelRatioInLimitBitrateByPortal: false
          },
          retryAttempts: {
            MPD: 3,
            XLinkExpansion: 1,
            InitializationSegment: 3,
            IndexSegment: 3,
            MediaSegment: 3,
            BitstreamSwitchingSegment: 3,
            other: 3
          },
          retryIntervals: {
            MPD: 500,
            XLinkExpansion: 500,
            InitializationSegment: 1000,
            IndexSegment: 1000,
            MediaSegment: 1000,
            BitstreamSwitchingSegment: 1000,
            other: 1000
          },
          delay: { liveDelay: 12 },
          liveCatchup: { enabled: false },
          capabilities: {
            useMediaCapabilitiesApi: false,
            filterUnsupportedEssentialProperties: true
          }
        }
      };
      const liveSettings = {
        streaming: {
          buffer: {
            bufferTimeDefault: 12,
            bufferTimeAtTopQuality: 18,
            bufferToKeep: 12
          },
          delay: { liveDelay: 12 },
          liveCatchup: { enabled: true }
        }
      };

      try {
        player.updateSettings(vodSettings);
      } catch (e) {
        if (DEBUG) console.warn('[UVP] dash.js settings rejected (continuing with defaults):', e);
      }

      const events = (DashLib && DashLib.MediaPlayer && DashLib.MediaPlayer.events) ||
        (DashLib && DashLib.Events) || {};
      const EVT_STREAM_INIT = events.STREAM_INITIALIZED || 'streamInitialized';
      const EVT_ERROR = events.ERROR || 'error';
      const EVT_BUF_LOADED = events.BUFFER_LOADED || 'bufferLoaded';
      const EVT_FRAG_LOADED = events.FRAGMENT_LOADING_COMPLETED || 'fragmentLoadingCompleted';
      const EVT_FRAG_PROG = events.FRAGMENT_LOADING_PROGRESS || 'fragmentLoadingProgress';

      let streamStarted = false;
      let liveSettingsApplied = false;
      activity = {
        seeking: false,
        waiting: false,
        seekStartTime: 0,
        waitStartTime: 0,
        targetSeekTime: null,
        lastProgressTime: Date.now(),
        lastProgressTag: 'created',
        lastMediaTime: Number(video.currentTime) || 0,
        lastBufferedAhead: UVP.Overlay.getBufferedAhead(video),
        lastErrorSig: '',
        lastErrorAt: 0,
        pendingError: false,
        recoveryTimer: null,
        unhookVideo: null
      };
      state.dashActivity = activity;

      const applyLiveSettings = () => {
        state.overlayIsLive = true;
        const saveBtn = state.overlay && state.overlay.shadowRoot
          ? state.overlay.shadowRoot.querySelector('.uvp-save')
          : null;
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Live';
        }
        if (liveSettingsApplied) return;
        liveSettingsApplied = true;
        try {
          player.updateSettings(liveSettings);
        } catch (e) {
          if (DEBUG) console.warn('[UVP] DASH live settings rejected:', e);
        }
      };

      const cancelRecovery = (tag) => {
        activity.pendingError = false;
        if (!activity.recoveryTimer) return;
        clearTimeout(activity.recoveryTimer);
        activity.recoveryTimer = null;
        if (DEBUG) console.log('[UVP] DASH recovery cancelled — healthy progress resumed (' + tag + ')');
      };

      const recordProgress = (tag) => {
        const mediaTime = Number(video.currentTime) || 0;
        const ahead = UVP.Overlay.getBufferedAhead(video);
        const mediaAdvanced = mediaTime > activity.lastMediaTime + 0.05;
        const bufferAdvanced = ahead > activity.lastBufferedAhead + 0.1;
        activity.lastMediaTime = mediaTime;
        activity.lastBufferedAhead = ahead;
        if (!mediaAdvanced && !bufferAdvanced &&
            tag !== 'streamInit' &&
            tag !== 'fragmentLoaded' &&
            tag !== 'fragmentProgress') return;
        activity.lastProgressTime = Date.now();
        activity.lastProgressTag = tag;
        if (ahead > 1.5 && video.readyState >= 3) cancelRecovery(tag);
      };

      const scheduleRecovery = (reason, initialDelay) => {
        activity.pendingError = true;
        if (activity.recoveryTimer) return;
        activity.recoveryTimer = setTimeout(function checkDashRecovery() {
          activity.recoveryTimer = null;
          if (!sessionCurrent() || state.dashActivity !== activity) return;
          const ahead = UVP.Overlay.getBufferedAhead(video);
          if (ahead > 1.5 && video.readyState >= 3) {
            cancelRecovery('healthy-buffer');
            return;
          }
          if (UVP.Overlay.isDashInGrace()) {
            activity.recoveryTimer = setTimeout(checkDashRecovery, CONFIG.dashTransientRecoveryDelayMs);
            return;
          }
          activity.pendingError = false;
          if (DEBUG) {
            console.warn('[UVP] DASH delayed recovery executing:', {
              reason,
              currentTime: video.currentTime,
              target: activity.targetSeekTime,
              ahead,
              lastProgress: activity.lastProgressTag
            });
          }
          UVP.Overlay.triggerRecovery(true);
        }, Math.max(0, Number(initialDelay) || CONFIG.dashTransientRecoveryDelayMs));
      };

      const onSeeking = () => {
        activity.seeking = true;
        activity.seekStartTime = Date.now();
        activity.targetSeekTime = video.currentTime || 0;
        activity.lastProgressTime = Date.now();
        state.stallCount = 0;
        state.lastVideoTime = video.currentTime || 0;
        state.decodeMetrics = null;
      };
      const onSeeked = () => {
        activity.targetSeekTime = video.currentTime || 0;
        if (UVP.Overlay.getBufferedAhead(video) > 0.5 && video.readyState >= 3) {
          activity.seeking = false;
          recordProgress('seeked-buffered');
        }
      };
      const onWaiting = () => {
        if (!activity.waiting) activity.waitStartTime = Date.now();
        activity.waiting = true;
        state.stallCount = 0;
        state.lastVideoTime = video.currentTime || 0;
      };
      const onPlaying = () => {
        activity.seeking = false;
        activity.waiting = false;
        recordProgress('playing');
      };
      const onTimeUpdate = () => {
        if (video.readyState >= 3 && !video.paused) {
          activity.seeking = false;
          activity.waiting = false;
        }
        recordProgress('timeupdate');
      };

      video.addEventListener('seeking', onSeeking);
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('waiting', onWaiting);
      video.addEventListener('playing', onPlaying);
      video.addEventListener('timeupdate', onTimeUpdate);
      activity.unhookVideo = () => {
        video.removeEventListener('seeking', onSeeking);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('timeupdate', onTimeUpdate);
      };

      const isStructuralError = (code, msg, type) => {
        if (code === 4 || code === 5 || code === 10 || code === 11 ||
            code === 23 || code === 25 || code === 31 || code === 32 ||
            code === 34 || code === 35) return true;
        const text = String(type || '') + ' ' + String(msg || '');
        return /MANIFEST_ERROR|MANIFEST_LOADER_PARSING_ERROR|MANIFEST_EMPTY|CAPABILITY_ERROR|MEDIA_SOURCE_NOT_SUPPORTED/i.test(text);
      };

      player.on(EVT_STREAM_INIT, (evt) => {
        if (!sessionCurrent()) return;
        streamStarted = true;
        let dynamic = dynamicHint ||
          !!(evt && (evt.isDynamic === true ||
            (evt.streamInfo && evt.streamInfo.manifestInfo &&
             evt.streamInfo.manifestInfo.isDynamic === true)));
        try {
          if (typeof player.isDynamic === 'function') dynamic = player.isDynamic() === true || dynamic;
        } catch (e) {}
        if (dynamic) applyLiveSettings();
        recordProgress('streamInit');
      });
      player.on(EVT_BUF_LOADED, () => {
        if (sessionCurrent()) recordProgress('bufferLoaded');
      });
      player.on(EVT_FRAG_LOADED, () => {
        if (sessionCurrent()) recordProgress('fragmentLoaded');
      });
      player.on(EVT_FRAG_PROG, () => {
        if (sessionCurrent()) recordProgress('fragmentProgress');
      });

      // Register only the public dash.js ERROR event. Internal event-bus
      // subscriptions produce duplicate notifications across dash.js builds.
      player.on(EVT_ERROR, (evt) => {
        if (!sessionCurrent()) return;
        const err = (evt && evt.error) || {};
        const code = typeof err.code === 'number'
          ? err.code
          : (typeof err === 'number' ? err : 0);
        const msg = err.message || '';
        const type = err.type || (evt && evt.type) || '';
        const now = Date.now();
        const sig = code + ':' + type + ':' + msg;
        if (sig === activity.lastErrorSig &&
            now - activity.lastErrorAt < CONFIG.dashErrorDedupMs) return;
        activity.lastErrorSig = sig;
        activity.lastErrorAt = now;

        if (isStructuralError(code, msg, type)) {
          fail((streamStarted ? 'fatal' : 'startup') +
            ' structural error: ' + (type || code || msg));
          return;
        }
        scheduleRecovery(
          'dash error ' + (type || code || msg),
          CONFIG.dashTransientRecoveryDelayMs
        );
      });

      if (dynamicHint) applyLiveSettings();
      if (!sessionCurrent()) {
        releaseLocalSession();
        return null;
      }

      state.dashPlayer = player;
      state.dashMpdUrl = mpdUrl;
      state.dashMpdOwned = mpdOwned;
      player.initialize(video, mpdUrl, false);
      if (failed || !sessionCurrent() || state.dashPlayer !== player) return null;

      video.addEventListener('canplay', () => {
        if (!sessionCurrent()) return;
        const active = state.dashActivity;
        if (active) {
          active.seeking = false;
          active.waiting = false;
          active.lastProgressTime = Date.now();
          active.lastProgressTag = 'canplay';
          active.lastMediaTime = Number(video.currentTime) || 0;
          active.lastBufferedAhead = UVP.Overlay.getBufferedAhead(video);
          if (active.lastBufferedAhead > 1.5 && active.recoveryTimer) {
            clearTimeout(active.recoveryTimer);
            active.recoveryTimer = null;
            active.pendingError = false;
          }
        }
        UVP.Overlay.resumeOrPauseVideo(video);
      }, { once: true });

      return player;
    } catch (e) {
      fail('init: ' + (e && e.message ? e.message : e));
      return null;
    }
  };

  UVP.Overlay.setExternalDashSaveState = function(external) {
    if (!external || !state.overlay || !state.overlay.shadowRoot) return false;
    const saveBtn = state.overlay.shadowRoot.querySelector('.uvp-save');
    if (!saveBtn) return false;
    saveBtn.disabled = true;
    saveBtn.textContent = 'DASH';
    return true;
  };

  UVP.Overlay.getBufferedAhead = function(video, targetTime) {
    if (!video) return 0;
    const t = Number.isFinite(targetTime) ? targetTime : (video.currentTime || 0);
    try {
      const b = video.buffered;
      if (!b || !b.length) return 0;
      for (let i = 0; i < b.length; i++) {
        if (b.start(i) <= t + 0.1 && b.end(i) >= t) return Math.max(0, b.end(i) - t);
      }
    } catch (e) {}
    return 0;
  };

  UVP.Overlay.isDashInGrace = function(now) {
    const act = state.dashActivity;
    if (!act || !state.dashPlayer) return false;
    const t = now || Date.now();
    const startedAt = act.seeking ? act.seekStartTime : act.waitStartTime;
    const elapsed = t - (startedAt || t);
    if (elapsed >= CONFIG.dashSeekMaxGraceMs) return false;
    if (act.seeking && elapsed < CONFIG.dashSeekGraceMs) return true;
    if ((act.seeking || act.waiting) && act.lastProgressTime && t - act.lastProgressTime < CONFIG.dashProgressExtendMs) return true;
    return false;
  };

  UVP.Overlay.bindVideoEvents = function(video) {
    if (!video) return;
    video.addEventListener('dblclick', () => {
      try {
        if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); }
        else if (state.overlay && state.overlay.requestFullscreen) { state.overlay.requestFullscreen().catch(() => {}); }
      } catch (e) { if (DEBUG) console.warn('[UVP] Fullscreen failed:', e); }
    });

    if ('mediaSession' in navigator) {
      try {
        const ms = navigator.mediaSession;
        ms.setActionHandler('play', () => { try { video.play(); } catch (e) {} });
        ms.setActionHandler('pause', () => { try { video.pause(); } catch (e) {} });
        ms.setActionHandler('seekbackward', (details) => {
          const skip = details.seekOffset || 10;
          try { video.currentTime = Math.max(0, video.currentTime - skip); } catch (e) {}
        });
        ms.setActionHandler('seekforward', (details) => {
          const skip = details.seekOffset || 10;
          try { video.currentTime = Math.min(video.duration || Infinity, video.currentTime + skip); } catch (e) {}
        });
        ms.setActionHandler('seekto', (details) => {
          if (details.seekTime != null && isFinite(details.seekTime)) {
            try { video.currentTime = details.seekTime; } catch (e) {}
          }
        });
        const syncPos = () => {
          try {
            if (isFinite(video.duration) && video.duration > 0 && ms.setPositionState) {
              ms.setPositionState({
                duration: video.duration,
                playbackRate: video.playbackRate || 1,
                position: Math.min(video.currentTime, video.duration)
              });
            }
          } catch (e) {}
        };
        video.addEventListener('timeupdate', syncPos);
        video.addEventListener('play', syncPos);
        video.addEventListener('pause', syncPos);
        video.addEventListener('loadedmetadata', syncPos);
      } catch (e) { if (DEBUG) console.warn('[UVP] MediaSession binding failed:', e); }
    }
    video.addEventListener('ended', () => {
      if (CONFIG.loopPlayback) {
        try { video.currentTime = 0; video.play().catch(() => {}); } catch (e) {}
      }
    });
  };

  UVP.Overlay.hardResetVideoEl = function() {
    if (DEBUG) console.log('[UVP] hardResetVideoEl — HLS destroyed:', !!state.hls, 'DASH destroyed:', !!state.dashPlayer, 'currentTime:', state.video ? state.video.currentTime : 'no video');
    // Hard reset: tears down HLS and DASH sessions before re-creating the video element.
    UVP.Overlay.destroyDashSession();
    if (state.hls) { try { state.hls.destroy(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } state.hls = null; }
    if (state.audio) { try { state.audio.pause(); state.audio.removeAttribute('src'); } catch (e) {} state.audio = null; }
    const oldVideo = state.video; if (!oldVideo) return;
    if (state.videoErrorHandler) { try { oldVideo.removeEventListener('error', state.videoErrorHandler); } catch (e) {} state.videoErrorHandler = null; }
    if (state.videoPlayHandler) { try { oldVideo.removeEventListener('play', state.videoPlayHandler); } catch (e) {} state.videoPlayHandler = null; }
    if (state.videoPauseHandler) { try { oldVideo.removeEventListener('pause', state.videoPauseHandler); } catch (e) {} state.videoPauseHandler = null; }
    state.overlayGeneration++;
    const resetGeneration = state.overlayGeneration;
    const newVideo = document.createElement('video');
    newVideo.controls = true; newVideo.autoplay = true; newVideo.loop = true; newVideo.setAttribute('loop', ''); newVideo.setAttribute('playsinline', ''); newVideo.setAttribute('webkit-playsinline', '');
    newVideo.style.width = '100%'; newVideo.style.height = '100%'; newVideo.style.objectFit = 'contain'; newVideo.style.background = '#000';
    if (oldVideo.parentNode) oldVideo.parentNode.replaceChild(newVideo, oldVideo);
    state.video = newVideo;
    UVP.Overlay.bindVideoEvents(newVideo);
    UVP.Overlay.bindPlaybackIntent(newVideo, resetGeneration);
    UVP.Overlay.setupVideoHealthMonitoring();
  }
 
  UVP.Overlay.resumeOrPauseVideo = function(video) {
    if (state.wasPaused) { try { video.pause(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } return; }
    video.play().catch((err) => {
      // Chrome/browsers block unmuted autoplay without recent user activation
      // (NotAllowedError / AbortError) — the video just sits paused and looks broken.
      // Retry muted (allowed), then restore sound on the user's first
      // click/tap on the overlay video.
      if (DEBUG) console.warn('[UVP] play() rejected, retrying muted:', err);
      try {
        video.muted = true;
        video.play().then(() => {
          const unmute = () => { video.muted = false; video.removeEventListener('click', unmute); };
          video.addEventListener('click', unmute);
        }).catch(() => {});
      } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    });
  }

  // Find the top-quality level index in an hls.js level list. hls.js does not
  // guarantee level ordering, so rank by height then bitrate — never assume
  // levels[levels.length - 1] is the best.
  UVP.Overlay.topHlsLevelIndex = function(hls) {
    const levels = (hls && hls.levels) || [];
    if (!levels.length) return -1;
    let topIdx = 0;
    for (let i = 1; i < levels.length; i++) {
      const a = levels[i] || {}, b = levels[topIdx] || {};
      if ((a.height || 0) > (b.height || 0) || ((a.height || 0) === (b.height || 0) && (a.bitrate || 0) > (b.bitrate || 0))) topIdx = i;
    }
    return topIdx;
  }

  UVP.Overlay.bindPlaybackIntent = function(video, generation) {
    state.videoPlayHandler = () => { if (!state.suppressPlaybackStateEvents && state.video === video && state.overlayGeneration === generation) state.wasPaused = false; };
    state.videoPauseHandler = () => { if (!state.suppressPlaybackStateEvents && state.video === video && state.overlayGeneration === generation) state.wasPaused = true; };
    video.addEventListener('play', state.videoPlayHandler);
    video.addEventListener('pause', state.videoPauseHandler);
  };

  UVP.Overlay.playVideo = function(url, video, seekTo) {
    const playGeneration = state.overlayGeneration;
    const overlayForPlayback = state.overlay;
    if (state.pendingSeekHandler) { video.removeEventListener('loadedmetadata', state.pendingSeekHandler); state.pendingSeekHandler = null; }
    // YouTube format tags: isHls marks extension-less manifest.googlevideo.com
    // URLs (live streams); isLive disables seek restore — seeking to a saved
    // VOD position inside a live sliding window points at expired segments.
    const _ytInfo = ytFmtMap.get(url);
    const _isHls = UVP.Utils.isHlsManifest(url) || (_ytInfo && _ytInfo.isHls);
    const _isDash = UVP.Utils.isDashManifest(url) || (_ytInfo && _ytInfo.isDash);
    if (seekTo && isFinite(seekTo) && seekTo > 0 && !(_ytInfo && _ytInfo.isLive)) {
      state.pendingSeekHandler = () => { try { video.currentTime = seekTo; } catch (e) { if (DEBUG) console.warn('[UVP]', e); } if (state.pendingSeekHandler) { video.removeEventListener('loadedmetadata', state.pendingSeekHandler); state.pendingSeekHandler = null; } };
      video.addEventListener('loadedmetadata', state.pendingSeekHandler);
      const handlerRef = state.pendingSeekHandler;
      setTimeout(() => { if (state.pendingSeekHandler === handlerRef) { video.removeEventListener('loadedmetadata', handlerRef); state.pendingSeekHandler = null; } }, CONFIG.seekHandlerTimeoutMs);
    }
 
    if (_isHls && UVP.Overlay.shouldUseHlsJs(video)) {
      UVP.Overlay.loadHlsScript().then(HlsLib => {
        // Overlay may have closed (or the video been hard-reset by recovery)
        // while the CDN bundle was loading. Creating an hls.js instance now
        // would orphan it: attachMedia on a detached <video>, background
        // segment fetching, and no closeOverlay() path left to destroy it.
        if (!state.overlay || state.video !== video || state.overlayGeneration !== playGeneration) {
          if (DEBUG) console.log('[UVP] Overlay closed/rebuilt during hls.js load — skipping player setup');
          return;
        }
        if (!HlsLib.isSupported()) throw new Error('HLS unsupported');
        if (state.hls) { try { state.hls.destroy(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
        const initialPos = (seekTo && isFinite(seekTo) && seekTo > 0) ? seekTo : 0;
        const hasStrictTrustedTypes = typeof window !== 'undefined' &&
          window.trustedTypes &&
          typeof window.trustedTypes.createPolicy === 'function';
        const hlsOpts = {
          maxBufferLength: 60, maxMaxBufferLength: 120, enableWorker: !hasStrictTrustedTypes,
          // Explicit load policies matching the userscript's retry config.
          // These govern hls.js's internal fragment/manifest retries, separate
          // from the userscript's download engine retry logic.
          manifestLoadingMaxRetry: 3,
          manifestLoadingRetryDelay: 1000,
          manifestLoadingMaxRetryTimeout: CONFIG.manifestTimeoutMs,
          fragLoadingMaxRetry: CONFIG.segMaxRetries,
          fragLoadingRetryDelay: CONFIG.retryBaseMs,
          fragLoadingMaxRetryTimeout: CONFIG.hardTimeoutBackstopMs,
          // Level loading (variant playlist) retry policy
          levelLoadingMaxRetry: 3,
          levelLoadingRetryDelay: CONFIG.retryBaseMs,
          levelLoadingMaxRetryTimeout: CONFIG.manifestTimeoutMs,
        };
        // For non-live streams, explicitly configure startPosition so that VOD
        // streams missing #EXT-X-ENDLIST (e.g. truncated CDN transcode files) do
        // not jump to the live edge (~95s+) instead of starting at 0 or seekTo.
        if (!state.overlayIsLive) {
          hlsOpts.startPosition = initialPos;
        }
        // Propagate CDN security tokens (e.g. MyTransfix/mjedge, BunnyCDN, Wowza) when relative URLs end with '?',
        // have truncated query params (ending with '&' or missing token/expires), or lack query parameters on the same host.
        let masterQuery = '';
        let masterOrigin = '';
        try {
          const u = new URL(url, location.href);
          masterQuery = u.search ? u.search.replace(/^\?/, '') : '';
          masterOrigin = u.origin;
        } catch (e) {}
        if (masterQuery && HlsLib.DefaultConfig && HlsLib.DefaultConfig.loader) {
          class UvpTokenLoader extends HlsLib.DefaultConfig.loader {
            constructor(cfg) {
              super(cfg);
              const origLoad = this.load.bind(this);
              this.load = function(context, cfg2, callbacks) {
                if (context && context.url && masterQuery) {
                  try {
                    let curUrl = context.url;
                    const u = new URL(curUrl, url);
                    const isSameOrigin = !masterOrigin || u.origin === masterOrigin;
                    if (isSameOrigin) {
                      if (curUrl.endsWith('?')) {
                        context.url = curUrl + masterQuery;
                      } else if (curUrl.includes('?')) {
                        const masterParams = new URLSearchParams(masterQuery);
                        const urlParts = curUrl.split('?');
                        const curParams = new URLSearchParams(urlParts[1] || '');
                        let modified = false;
                        for (const [k, v] of masterParams.entries()) {
                          const curVal = curParams.get(k);
                          if (!curVal || curVal.length < v.length) {
                            curParams.set(k, v);
                            modified = true;
                          }
                        }
                        if (modified || curUrl.endsWith('&')) {
                          context.url = urlParts[0] + '?' + curParams.toString();
                        }
                      } else {
                        context.url = curUrl + '?' + masterQuery;
                      }
                    }
                  } catch (e) {}
                }
                return origLoad(context, cfg2, callbacks);
              };
            }
          }
          hlsOpts.pLoader = UvpTokenLoader;
          hlsOpts.fLoader = UvpTokenLoader;
        }
        const hls = new HlsLib(hlsOpts);
        state.hls = hls;
        // Rate-limited fatal error recovery, per the official hls.js guidance:
        // unbounded instant startLoad()/recoverMediaError() calls can loop
        // forever. After CONFIG.hlsMaxRecoveries attempts within
        // CONFIG.hlsRecoveryWindowMs, hand off to the overlay hard-recovery
        // path (which re-extracts a fresh URL and rebuilds the player).
        const hlsRecovery = { lastAt: 0, count: 0 };
        const escalateRecovery = () => {
          try { hls.destroy(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
          if (state.hls === hls) state.hls = null;
          setTimeout(() => { if (state.overlay && state.video === video && state.overlayGeneration === playGeneration) UVP.Overlay.triggerRecovery(true); }, CONFIG.hlsFatalErrorRecoveryDelayMs);
        };
        hls.on(HlsLib.Events.ERROR, (event, data) => {
          if (state.overlay !== overlayForPlayback || state.video !== video || state.overlayGeneration !== playGeneration) return;
          if (DEBUG) console.log('[UVP] HLS.js error:', data.type, 'fatal:', data.fatal, 'details:', data.details, 'currentTime:', state.video ? state.video.currentTime : 'no video');
          if (!data.fatal) return;
          const now = Date.now();
          if (now - hlsRecovery.lastAt > CONFIG.hlsRecoveryWindowMs) hlsRecovery.count = 0;
          hlsRecovery.lastAt = now;
          if (hlsRecovery.count >= CONFIG.hlsMaxRecoveries) {
            if (DEBUG) console.warn('[UVP] HLS.js instant recovery rate-limited — escalating to overlay recovery');
            escalateRecovery();
            return;
          }
          hlsRecovery.count++;
          switch (data.type) {
            case HlsLib.ErrorTypes.NETWORK_ERROR: try { hls.startLoad(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } break;
            case HlsLib.ErrorTypes.MEDIA_ERROR: try { hls.recoverMediaError(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } break;
            default: escalateRecovery(); break;
          }
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(HlsLib.Events.MANIFEST_PARSED, (event, data) => {
          // HLS starts at the highest available level, but hls.js retains ABR
          // control and can step down when bandwidth cannot sustain it. YouTube
          // VOD uses fixed MSE renditions and has a separate decode-drop step-down.
          // Use startLevel (not currentLevel/nextLevel): it picks the initial
          // fragment's quality while KEEPING ABR enabled, so playback degrades
          // gracefully instead of stalling when the connection cannot sustain
          // the top bitrate. 'auto' via the menu restores the default behaviour.
          try {
            if (UVP.Utils.getPlaybackQuality() === 'max' && CONFIG.playbackStartHighest) {
              let topIdx = UVP.Overlay.topHlsLevelIndex(hls);
              if (topIdx < 0) topIdx = UVP.Overlay.topHlsLevelIndex({ levels: (data && data.levels) || [] });
              // 4K cold-start cap: a forced top startLevel on a 2160p-class
              // ladder (25-45Mbps, ~100MB first segments — PMV Haven) cannot
              // finish initial buffering inside the stall window, and the
              // recovery loop then destroyed the partial download forever
              // (the /video/ page load failure). Above the ceiling, ABR picks
              // a sustainable start level and still climbs to the top within
              // a few fragments — 'max' remains a quality ceiling, not a
              // blind cold start.
              const topLevel = ((data && data.levels) || [])[topIdx];
              const topBitrate = Number(topLevel && topLevel.bitrate) || 0;
              if (topIdx >= 0 && topBitrate && topBitrate > CONFIG.hlsColdStartMaxBitrate) {
                if (DEBUG) console.log('[UVP] MANIFEST_PARSED — top level ' + (Math.round(topBitrate / 100000) / 10) + 'Mbps exceeds the cold-start ceiling; ABR startup (climbs to top)');
              } else if (topIdx >= 0) {
                hls.startLevel = topIdx; if (DEBUG) console.log('[UVP] MANIFEST_PARSED — starting at top level', topIdx);
              }
            }
          } catch (e) { if (DEBUG) console.warn('[UVP] start-level selection failed:', e); }
          if (state.overlay === overlayForPlayback && state.video === video && state.overlayGeneration === playGeneration) UVP.Overlay.resumeOrPauseVideo(video);
        });
      }).catch(() => {
        // Same guard as above: a late CDN load failure must not assign a src
        // to a detached video (harmless-looking, but triggers background
        // fetches on an element nothing will ever clean up).
        if (!state.overlay || state.video !== video || state.overlayGeneration !== playGeneration) return;
        video.src = url; video.addEventListener('canplay', () => { if (state.video === video && state.overlayGeneration === playGeneration) UVP.Overlay.resumeOrPauseVideo(video); }, { once: true });
      });
    } else if (_isDash || (UVP.Extractors.isYouTube() && !state.overlayIsLive && !ytPlayerData.isLive && (
      ytFmtMap.size > 0 ||
      (_ytInfo && _ytInfo.initRange && _ytInfo.indexRange)
    ))) {
      // DASH playback branch: constructs client-side MPD from deciphered formats and feeds to dash.js.
      // Delivers synced A/V playback with production ABR; fails over to muxed itag-18/22 progressive stream.
      const failToMuxed = (why) => {
        if (DEBUG) console.warn('[UVP] DASH playback failed over:', why);
        if (!state.overlay || state.video !== video || state.overlayGeneration !== playGeneration) return;
        UVP.Overlay.destroyDashSession();
        let fb = null;
        if (_isDash && !UVP.Extractors.isYouTube()) {
          fb = UVP.Utils.pickPlaybackFallback(url);
        } else {
          fb = url;
          try {
            const picked = UVP.Extractors.pickYouTubeMuxedUrl();
            if (picked) fb = picked;
          } catch (e) {}
        }
        if (!fb || UVP.Utils.isDashManifest(fb) || UVP.Utils.isLikelyAdaptiveFragment(fb)) {
          state.wasPaused = true;
          try { video.pause(); video.removeAttribute('src'); } catch (e) {}
          UVP.Overlay.showToast('DASH playback failed — no safe fallback is available', 5000);
          return;
        }
        try { video.src = fb; } catch (e) {}
        video.addEventListener('canplay', () => { if (state.video === video && state.overlayGeneration === playGeneration) UVP.Overlay.resumeOrPauseVideo(video); }, { once: true });
        UVP.Overlay.showToast(fb !== url ? 'DASH engine failed — playing safe fallback' : 'DASH engine failed — playing video only');
      };
      state.dashFailover = failToMuxed;
      // An external MPD is playable by dash.js but unsupported by UVP's
      // downloader. Disable Save before asynchronous library loading so the
      // manifest XML can never be saved under an MP4 filename. Generated
      // YouTube MPDs keep the normal Save action.
      UVP.Overlay.setExternalDashSaveState(_isDash && !UVP.Extractors.isYouTube());
      if (typeof window.MediaSource === 'function' && typeof window.MediaSource.isTypeSupported === 'function') {
        const prepareAndStartDash = async () => {
          const externalMpdUrl = _isDash ? url : null;
          let mpdText = null;

          if (!externalMpdUrl) {
            try { await UVP.Extractors.ensureYtNDeciphered(ytRouteGeneration); } catch (e) {}
            if (!state.overlay || state.video !== video || state.overlayGeneration !== playGeneration) return;
            const durMs = Math.max(
              0,
              ...[...ytFmtMap.values()].map(i => Number(i && i.approxDurationMs) || 0)
            ) || (_ytInfo && _ytInfo.approxDurationMs) || 0;
            let built = null;
            try {
              built = UVP.MPD.buildYouTubeMpd(
                [...ytFmtMap.entries()].map(([u, info]) => ({ u, info: info || {} })),
                durMs
              );
            } catch (e) {
              if (DEBUG) console.warn('[UVP] MPD build threw:', e);
            }
            if (!built || !built.videoReps.length) {
              failToMuxed('mpd empty');
              return;
            }
            mpdText = built.mpd;
          }

          await UVP.Overlay.startDashPlayback({
            video,
            generation: playGeneration,
            externalMpdUrl,
            mpdText,
            onFail: failToMuxed,
            dynamicHint: !!((_ytInfo && _ytInfo.isLive) || state.overlayIsLive)
          });
        };
        prepareAndStartDash().catch((e) => failToMuxed('load: ' + (e && e.message)));
        return;
      }
      failToMuxed('no MSE support');
    } else {
      video.src = url;
      video.addEventListener('canplay', () => { if (state.video === video && state.overlayGeneration === playGeneration) UVP.Overlay.resumeOrPauseVideo(video); }, { once: true });
    }
  }

  // ==================== PLAYER RECOVERY ====================
  UVP.Overlay.recoverPlayer = function() {
    if (DEBUG) console.log('[UVP] recoverPlayer — attempts:', state.recoveryAttempts + 1, 'video.readyState:', state.video ? state.video.readyState : 'no video', 'networkState:', state.video ? state.video.networkState : 'no video', 'currentTime:', state.video ? state.video.currentTime : 'no video', 'error:', state.video ? state.video.error : 'no video');
    if (!state.overlay || !state.video || !state.overlayUrl) return;

    // Reset health monitor baseline so a just-restored video is not immediately flagged as stalled.
    state.stallCount = 0;
    state.lastVideoTime = state.video.currentTime || 0;

    // Increment attempt counter immediately. This fixes the race condition
    // where a fast-failing video triggers a new recovery before the delay cycle finishes.
    state.recoveryAttempts++;
    if (state.recoveryAttempts > CONFIG.maxRecoveryAttempts) {
      if (state.dashPlayer && typeof state.dashFailover === 'function') {
        const exhaustedFallback = state.dashFailover;
        state.recoveryAttempts = 0;
        exhaustedFallback('DASH recovery exhausted');
        return;
      }
      console.warn('[UVP] Max recovery attempts reached. Closing overlay. Disabling button for this site (session).');
      state.sitePlayerFailed = true;
      try { sessionStorage.setItem('uvp-failed', '1'); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
      try { sessionStorage.removeItem('uvp-player'); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
      if (UVP.StateMachine.can('FAILED')) UVP.StateMachine.transition('FAILED', 'recoverPlayer max attempts');
      UVP.Overlay.closeOverlay(false);
      return;
    }

    if (UVP.StateMachine.can('RECOVERING')) UVP.StateMachine.transition('RECOVERING', 'recoverPlayer');
    if (state.recoveryTimer) { clearTimeout(state.recoveryTimer); state.recoveryTimer = null; }
    const delays = CONFIG.recoveryDelaysMs;
    let attemptIdx = -1;
    function isVideoHealthy() {
      const v = state.video;
      if (!v) return false;
      if (UVP.Overlay.isDashInGrace()) {
        if (DEBUG) console.log('[UVP] isVideoHealthy: TRUE (temporary DASH seek/buffering grace)');
        return true;
      }
      if (v.error) { if (DEBUG) console.log('[UVP] isVideoHealthy: FALSE — v.error:', v.error); return false; }
      if (v.videoWidth === 0 && v.readyState >= 2) { if (DEBUG) console.log('[UVP] isVideoHealthy: FALSE — videoWidth=0, readyState>=2'); return false; }
      if (v.networkState === 3) { if (DEBUG) console.log('[UVP] isVideoHealthy: FALSE — networkState=3'); return false; }
      if (v.readyState === 0) { if (DEBUG) console.log('[UVP] isVideoHealthy: FALSE — readyState=0'); return false; }
      if (v.paused && !v.ended && !state.wasPaused) { if (DEBUG) console.log('[UVP] isVideoHealthy: FALSE — playback unexpectedly paused'); return false; }
      if (!v.paused && !v.ended && Math.abs((v.currentTime || 0) - (state.lastVideoTime || 0)) < 0.1) {
        if (v.seeking) { if (DEBUG) console.log('[UVP] isVideoHealthy: TRUE (video.seeking active)'); return true; }
        if (DEBUG) console.log('[UVP] isVideoHealthy: FALSE — playback time is not advancing'); return false;
      }
      if (DEBUG) console.log('[UVP] isVideoHealthy: TRUE');
      return true;
    }
    function checkAndRecover() {
      if (!state.overlay || !state.video || !state.overlayUrl) return;
      attemptIdx++;
      if (DEBUG) console.log('[UVP] checkAndRecover — attempt:', attemptIdx, 'of', delays.length);
      if (isVideoHealthy()) {
        // Video is playing! Reset the attempt counter to 0.
        state.recoveryAttempts = 0;
        state.recoveryTimer = null;
        if (state.isDownloading) {
          if (UVP.StateMachine.can('DOWNLOADING')) UVP.StateMachine.transition('DOWNLOADING', 'recoverPlayer healthy');
        } else {
          if (UVP.StateMachine.can('PLAYING')) UVP.StateMachine.transition('PLAYING', 'recoverPlayer healthy');
        }
        return;
      }
      // Cold-start buffering grace: hls.js is actively downloading the FIRST
      // segment into an empty buffer (fragments flowing, nothing appended).
      // A hard reset here discards the partial ~100MB 4K download and the
      // recovery loop restarts the same download forever. Defer instead —
      // the remaining delay slots keep polling; once the buffer populates
      // (or fragments stop flowing), the normal healthy/unhealthy logic
      // applies. Deferrals do not consume extra recovery attempts: the
      // round's attempt was already counted at recoverPlayer entry.
      if (state.hls && state.video && !state.video.buffered.length &&
          Date.now() - lastFragmentFetch.at < CONFIG.hlsStartupBufferGraceMs) {
        if (DEBUG) console.log('[UVP] checkAndRecover — deferred: hls.js cold-start buffering in progress (attempt ' + attemptIdx + ' of ' + delays.length + ')');
        if (attemptIdx + 1 < delays.length) state.recoveryTimer = setTimeout(checkAndRecover, delays[attemptIdx + 1]);
        else state.recoveryTimer = null;
        return;
      }
      const p = UVP.State.readPlayerState();
      const act = state.dashActivity;
      const seekTo = (act && Number.isFinite(act.targetSeekTime)) ? act.targetSeekTime : ((p && p.t) ? p.t : (state.video.currentTime || 0));
      if (DEBUG) console.log('[UVP] checkAndRecover — seeking to:', seekTo, 'from readPlayerState:', !!(p && p.t), 'video.currentTime:', state.video.currentTime);
      state.wasPaused = p ? !!p.paused : state.wasPaused;
      const recoveryOverlay = state.overlay;
      const recoveryGeneration = state.overlayGeneration;
      const replay = async (resetVideo, resetGeneration) => {
        if (!state.overlay || state.overlay !== recoveryOverlay || state.video !== resetVideo || state.overlayGeneration !== resetGeneration) return;
        let replayUrl = state.overlayUrl;
        if (UVP.Extractors.isYouTube() && UVP.Extractors.getYtVideoId()) {
          // Signed googlevideo URLs are disposable. Force a new route-local
          // format acquisition instead of allowing the old map to short-circuit.
          ytFmtMap.clear();
          ytDecipheredUrls.clear();
          for (const u of [...capturedUrls]) {
            if (/googlevideo\.com/i.test(u)) {
              capturedUrls.delete(u);
              capturedUrlKinds.delete(u);
            }
          }
          ytPlayerData.fmtTs = 0;
          replayUrl = null;
          try {
            await UVP.Extractors.extractYouTubeUrls();
            if (state.overlay !== recoveryOverlay || state.video !== resetVideo || state.overlayGeneration !== resetGeneration) return;
            const fresh = UVP.Extractors.pickYouTubeFormats();
            if (fresh && fresh.video) {
              replayUrl = fresh.video;
              state.targetAudioUrl = fresh.audio || null;
            }
          } catch (e) { if (DEBUG) console.warn('[UVP] YouTube recovery refresh failed:', e); }
          if (!replayUrl) { UVP.Overlay.showToast('YouTube URL refresh failed — retrying'); return; }
        }
        // Pornhub: when the max-mode top variant keeps failing (e.g. a
        // premium-gated 403), downgrade the replay to the site-default variant
        // instead of looping on a dead URL. No-op when the failed URL was not
        // the top pick (pickPornhubRecoveryUrl returns null) or the downgrade
        // equals the failed URL.
        if (UVP.Extractors.isPornhub() && replayUrl && typeof UVP.Extractors.pickPornhubRecoveryUrl === 'function') {
          const phAlt = UVP.Extractors.pickPornhubRecoveryUrl(replayUrl);
          if (phAlt && phAlt !== replayUrl) {
            if (DEBUG) console.warn('[UVP] Pornhub top-variant failed — downgrading recovery replay');
            replayUrl = phAlt;
          }
        }
        if (state.overlay !== recoveryOverlay || state.video !== resetVideo || state.overlayGeneration !== resetGeneration) return;
        state.overlayUrl = replayUrl;
        UVP.Overlay.playVideo(replayUrl, state.video, seekTo);
      };
      UVP.Overlay.hardResetVideoEl();
      const resetVideo = state.video;
      setTimeout(() => { if (state.overlay === recoveryOverlay && state.video === resetVideo && state.overlayGeneration > recoveryGeneration) replay(resetVideo, state.overlayGeneration); }, CONFIG.recoveryHardResetDelayMs);
      // Backoff exhaustion check: escalates to video health monitor after progressive delays
      // stall detection re-trigger UVP.Overlay.recoverPlayer(), which increments
      // recoveryAttempts. Each UVP.Overlay.recoverPlayer() call is one "round" of
      // delays.length retries. maxRecoveryAttempts caps the total rounds.
      if (attemptIdx + 1 < delays.length) {
        state.recoveryTimer = setTimeout(checkAndRecover, delays[attemptIdx + 1]);
      } else {
        state.recoveryTimer = null;
      }
    }
    state.recoveryTimer = setTimeout(checkAndRecover, delays[0]);
  }
  UVP.Overlay.triggerRecovery = function(force) { if (DEBUG) console.log('[UVP] triggerRecovery called — force:', force, 'recoveryTimer active:', !!state.recoveryTimer, 'overlay:', !!state.overlay, 'video:', !!state.video, 'video error:', state.video ? state.video.error : 'no video'); if (state.recoveryTimer && !force) return; if (force && state.recoveryTimer) { clearTimeout(state.recoveryTimer); state.recoveryTimer = null; } UVP.Overlay.recoverPlayer(); }
  UVP.Overlay.sampleDecodeMetrics = function(video, previous) {
    previous = previous || { total: null, dropped: null, currentTime: null, validSamples: 0, overloadStreak: 0 };
    const next = { total: previous.total, dropped: previous.dropped, currentTime: null, validSamples: previous.validSamples || 0, overloadStreak: previous.overloadStreak || 0 };
    const reset = () => { next.total = null; next.dropped = null; next.currentTime = null; next.validSamples = 0; next.overloadStreak = 0; };
    const result = { valid: false, overload: false, ratio: 0, deltaTotal: 0, deltaDropped: 0, reason: 'unavailable', next };
    if (!video) { reset(); result.reason = 'no-video'; return result; }
    if (document.hidden) { reset(); result.reason = 'hidden'; return result; }
    if (video.paused || video.ended) { reset(); result.reason = 'inactive'; return result; }
    if (video.seeking) { reset(); result.reason = 'seeking'; return result; }
    if (typeof video.playbackRate === 'number' && Math.abs(video.playbackRate - 1) > 0.05) { reset(); result.reason = 'playback-rate'; return result; }
    if ((video.readyState || 0) < 3) { reset(); result.reason = 'not-ready'; return result; }
    const current = Number(video.currentTime);
    const hasPriorTime = previous.currentTime !== null && previous.currentTime !== undefined && Number.isFinite(Number(previous.currentTime));
    const priorTime = hasPriorTime ? Number(previous.currentTime) : null;
    next.currentTime = current;
    if (!Number.isFinite(current) || (hasPriorTime && current - priorTime < 0.1)) { reset(); result.reason = 'timeline-not-advancing'; return result; }
    let bufferedAhead = 0;
    try {
      const b = video.buffered;
      for (let i = 0; i < b.length; i++) {
        if (b.start(i) <= current + 0.05 && b.end(i) >= current) { bufferedAhead = b.end(i) - current; break; }
      }
    } catch (e) { result.reason = 'buffer-unavailable'; next.overloadStreak = 0; return result; }
    if (bufferedAhead < CONFIG.decodeDropMinRunwaySec) {
      // Underrun: frame deltas measured across a stall are garbage, so clear
      // the counters — but KEEP currentTime (set above) so the very next
      // sample can still detect a frozen timeline. A post-underrun freeze is
      // a network/playback stall, never decoder overload.
      next.total = null; next.dropped = null; next.validSamples = 0; next.overloadStreak = 0;
      result.reason = 'low-buffer'; return result;
    }
    let total, dropped;
    try {
      if (typeof video.getVideoPlaybackQuality === 'function') {
        const q = video.getVideoPlaybackQuality();
        total = Number(q && q.totalVideoFrames); dropped = Number(q && q.droppedVideoFrames);
      }
      // Older WebKit exposes counters directly. Also use them when a browser
      // exposes getVideoPlaybackQuality but returns incomplete values.
      if (!Number.isFinite(total) || !Number.isFinite(dropped)) {
        total = Number(video.webkitDecodedFrameCount);
        dropped = Number(video.webkitDroppedFrameCount);
      }
    } catch (e) { result.reason = 'metrics-unavailable'; next.overloadStreak = 0; return result; }
    if (!Number.isFinite(total) || !Number.isFinite(dropped) || total < 0 || dropped < 0) { result.reason = 'metrics-unavailable'; next.overloadStreak = 0; return result; }
    if (next.total === null || next.dropped === null || total < next.total || dropped < next.dropped) {
      next.total = total; next.dropped = dropped; result.reason = 'baseline'; return result;
    }
    result.deltaTotal = total - next.total;
    result.deltaDropped = dropped - next.dropped;
    next.total = total; next.dropped = dropped;
    if (result.deltaTotal < CONFIG.decodeDropMinFrames) { result.reason = 'insufficient-frames'; next.overloadStreak = 0; return result; }
    result.valid = true;
    result.ratio = result.deltaDropped / result.deltaTotal;
    next.validSamples++;
    if (next.validSamples <= CONFIG.decodeDropWarmupSamples) { result.reason = 'warmup'; next.overloadStreak = 0; return result; }
    if (result.ratio >= CONFIG.decodeDropRatioThreshold) next.overloadStreak++;
    else next.overloadStreak = 0;
    result.overload = next.overloadStreak >= CONFIG.decodeDropStreakSamples;
    result.reason = result.overload ? 'sustained-drop-rate' : (result.ratio >= CONFIG.decodeDropRatioThreshold ? 'high-drop-rate' : 'healthy');
    return result;
  };

  UVP.Overlay.handleDecodeDegradation = function(video, generation, sample) {
    if (!state.overlay || state.video !== video || state.overlayGeneration !== generation) return false;
    if (!state.dashPlayer) return false;
    const url = state.overlayUrl;
    if (!url || state.overlayIsLive || !UVP.Extractors.isYouTube() || ytPlayerData.isLive || UVP.Utils.getPlaybackQuality() !== 'max') return false;
    if (state.decodeDowngradeExhaustedUrl === url || Date.now() - state.decodeDowngradeAt < CONFIG.decodeDropCooldownMs) return false;
    // Representation step-down: switches down one quality level seamlessly upon decode drops.
    try {
      const p = state.dashPlayer;
      let list = [], curIdx = -1;
      if (typeof p.getRepresentationsByType === 'function' && typeof p.getCurrentRepresentationForType === 'function') {
        list = p.getRepresentationsByType('video') || [];
        const curRep = p.getCurrentRepresentationForType('video');
        curIdx = curRep ? list.findIndex(r => (r && curRep && (r.id === curRep.id || r.index === curRep.index || r === curRep))) : -1;
      }
      if (curIdx < 0 && typeof p.getBitrateInfoListFor === 'function' && typeof p.getQualityFor === 'function') {
        list = p.getBitrateInfoListFor('video') || [];
        curIdx = p.getQualityFor('video');
      }
      if (typeof curIdx !== 'number' || curIdx <= 0 || !list.length || curIdx > list.length) { state.decodeDowngradeExhaustedUrl = url; return false; }
      const next = list[curIdx - 1], cur = list[curIdx];
      state.decodeDowngradeAt = Date.now();
      if (typeof p.setRepresentationForTypeByIndex === 'function') {
        p.setRepresentationForTypeByIndex('video', curIdx - 1, true);
      } else if (typeof p.setQualityFor === 'function') {
        p.setQualityFor('video', curIdx - 1);
      }
      const pct = sample && Number.isFinite(sample.ratio) ? Math.round(sample.ratio * 100) : null;
      UVP.Overlay.showToast(`YouTube quality adjusted: ${(cur && (cur.height || cur.mediaHeight)) || '?'}p -> ${(next && (next.height || next.mediaHeight)) || '?'}p${pct === null ? '' : ` (${pct}% frames dropped)`}`);
      return true;
    } catch (e) { if (DEBUG) console.warn('[UVP] decode step-down failed:', e); return false; }
  };

  UVP.Overlay.setupVideoHealthMonitoring = function() {
    if (!state.video) return;
    const v = state.video;
    const generation = state.overlayGeneration;
    if (state.healthTimer) { clearInterval(state.healthTimer); state.healthTimer = null; }
    if (state.videoErrorHandler && state.video !== v) { try { state.video.removeEventListener('error', state.videoErrorHandler); } catch (e) {} }
    state.decodeMetrics = null;
    const errorHandler = () => {
      if (state.video !== v || !state.overlay || state.overlayGeneration !== generation) return;
      if (DEBUG) console.log('[UVP] VIDEO ERROR EVENT — error:', v.error, 'readyState:', v.readyState, 'networkState:', v.networkState, 'currentTime:', v.currentTime);
      if (state.dashPlayer) {
        const act = state.dashActivity;
        if (act) {
          act.pendingError = true;
          if (!act.recoveryTimer) {
            const recoveryVideo = v;
            const recoveryActivity = act;
            act.recoveryTimer = setTimeout(function checkNativeDashError() {
              recoveryActivity.recoveryTimer = null;
              if (state.video !== recoveryVideo || state.overlayGeneration !== generation || state.dashActivity !== recoveryActivity) return;
              if (UVP.Overlay.getBufferedAhead(recoveryVideo) > 1.5 && recoveryVideo.readyState >= 3) { recoveryActivity.pendingError = false; return; }
              if (UVP.Overlay.isDashInGrace()) {
                recoveryActivity.recoveryTimer = setTimeout(checkNativeDashError, CONFIG.dashTransientRecoveryDelayMs);
                return;
              }
              recoveryActivity.pendingError = false;
              UVP.Overlay.triggerRecovery(true);
            }, CONFIG.dashTransientRecoveryDelayMs);
          }
          return;
        }
        setTimeout(() => { if (state.video === v && state.overlayGeneration === generation) UVP.Overlay.triggerRecovery(true); }, CONFIG.dashTransientRecoveryDelayMs);
        return;
      }
      UVP.Overlay.triggerRecovery(true);
    };
    state.videoErrorHandler = errorHandler;
    v.addEventListener('error', errorHandler);
    state.healthTimer = setInterval(() => {
      if (!state.video || state.video !== v || !state.overlay || state.overlayGeneration !== generation) return;
      const video = state.video;
      if (video.seeking || UVP.Overlay.isDashInGrace()) {
        state.stallCount = 0;
        state.lastVideoTime = video.currentTime;
        state.decodeMetrics = null;
        return;
      }
      if (video.paused || video.ended) { state.stallCount = 0; state.lastVideoTime = video.currentTime; state.decodeMetrics = null; return; }
      const delta = Math.abs(video.currentTime - state.lastVideoTime);
      // hls.js cold-start buffering grace: while the FIRST segment is still
      // downloading (nothing appended yet, fragments actively flowing), a
      // large top-level segment (PMV Haven 4K, ~100MB) exceeds the stall
      // window — a recovery reset discards the partial download and the
      // loop repeats until exhaustion. Active first-buffering is progress,
      // not a stall. Once fragments stop flowing, normal stall logic resumes.
      if (delta < 0.1 && state.hls && !video.buffered.length &&
          Date.now() - lastFragmentFetch.at < CONFIG.hlsStartupBufferGraceMs) {
        state.stallCount = 0;
        state.lastVideoTime = video.currentTime;
        state.decodeMetrics = null;
        return;
      }
      if (delta < 0.1) { state.stallCount++; if (state.stallCount >= CONFIG.stallThresholdSec) { state.stallCount = 0; if (DEBUG) console.log('[UVP] STALL DETECTED — stallCount threshold reached, currentTime:', video.currentTime); UVP.Overlay.triggerRecovery(true); } } else state.stallCount = 0;
      state.lastVideoTime = video.currentTime;
      const sample = UVP.Overlay.sampleDecodeMetrics(video, state.decodeMetrics);
      state.decodeMetrics = sample.next;
      if (sample.overload) UVP.Overlay.handleDecodeDegradation(video, generation, sample);
    }, 1000);
  };

  // ==================== OVERLAY OPEN ====================
  UVP.Overlay.openOverlay = function(url, opts) {
    opts = opts || {};
    // Security gate: validate URL before any playback path (video.src or hls.loadSource)
    // bypasses requestCrossOriginWithRetry and its isUsableUrl guard.
    url = UVP.Utils.assertSafeVideoUrl(url);
    if (!url) { console.warn('[UVP] openOverlay rejected unsafe URL'); UVP.Overlay.showToast('Invalid video URL'); return null; }
    // Cancel any active download if the new overlay URL differs from the
    // download URL — switching videos in the same tab must cancel downloads.
    if (state.isDownloading && state.overlayUrl && url !== state.overlayUrl) {
      UVP.Cancel.cancelCurrent();
    }
    // Preserve the YouTube muxed-audio pick: pickYouTubeUrl() sets
    // state.targetAudioUrl during getUrl() — BEFORE openOverlay runs — and
    // closeOverlay(true) below nulls it. That ordering silently dropped the
    // separate audio track for adaptive (1080p+) playback. Snapshot/restore
    // across the close.
    const _savedAudioUrl = state.targetAudioUrl;
    UVP.Overlay.closeOverlay(true);
    if (_savedAudioUrl) state.targetAudioUrl = _savedAudioUrl;
    // Install the intruder handler BEFORE the one-shot pause to eliminate
    // any timing gap. We aggressively pause AND mute the target video across
    // all sites to ensure it doesn't play in the background while the overlay
    // is open, conserving bandwidth and preventing double audio.
    // The original muted state is saved so it can be restored when the overlay closes.
    pauseIntruderHandler = (e) => {
      const v = e.target;
      if (!v || v.tagName !== 'VIDEO' || v === state.video) return;
      // Target only the video that the overlay, PiP, or miniplayer is actively playing.
      // If our script is playing the video, the webplayer should not be playing the same video.
      const isSame = UVP.Overlay.isSameAsActivePlayback(v);
      if (!isSame) return; // Do not touch other/unrelated videos on the page!

      if (DEBUG) console.log('[UVP] pauseIntruderHandler — pausing background webplayer of active video:', v.src || v.currentSrc);
      if (!state.targetAudioSaved) { state.targetAudioSaved = true; state.targetWasMuted = v.muted; }
      try { if (!v.muted) v.muted = true; } catch (err) {}
      try { if (!v.paused) v.pause(); } catch (err) {}
    };
    document.addEventListener('playing', pauseIntruderHandler, true);
    // Esc closes the overlay (capture phase so site handlers can't swallow it).
    state.escHandler = (e) => {
      if (e.key !== 'Escape' || !state.overlay) return;
      e.preventDefault(); e.stopPropagation();
      UVP.Overlay.closeOverlay(false);
    };
    document.addEventListener('keydown', state.escHandler, true);
    const allVids = UVP.Utils.findAllVideos ? UVP.Utils.findAllVideos(document) : Array.from(document.querySelectorAll('video')); allVids.forEach(v => { try { v.pause(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } });
    if (!state.targetVideo) state.targetVideo = UVP.Overlay.findBestVideo();
    const overlay = document.createElement('div');
    overlay.className = 'uvp-overlay';
    // Shadow DOM isolates the overlay video from site scripts that iterate
    // document.querySelectorAll('video') and reset currentTime / pause / mute.
    const shadow = overlay.attachShadow({ mode: 'open' });
    const shadowStyle = document.createElement('style');
    shadowStyle.textContent = `video { width: 100%; height: 100%; object-fit: contain; background: #000; } .uvp-close { position: absolute; top: 8px; right: 8px; z-index: 3; min-width: 32px; min-height: 32px; padding: 4px; background: rgba(0,0,0,.65); color: #fff; border: 0; border-radius: 50%; font-size: 16px; line-height: 1; cursor: pointer; backdrop-filter: blur(4px); } .uvp-save { position: absolute; top: 8px; left: 8px; z-index: 3; min-width: 70px; min-height: 32px; padding: 6px 10px; background: rgba(0,0,0,.65); color: #fff; border: 0; border-radius: 6px; font: 600 11px/1 system-ui, Roboto, sans-serif; cursor: pointer; backdrop-filter: blur(4px); transition: all 0.1s ease; white-space: nowrap; text-align: center; } .uvp-close:hover, .uvp-save:not(:disabled):hover { background: rgba(0,0,0,.85); } .uvp-pip { position: absolute; top: 8px; right: 48px; z-index: 3; min-width: 32px; min-height: 32px; padding: 4px; background: rgba(0,0,0,.65); color: #fff; border: 0; border-radius: 50%; font-size: 15px; line-height: 1; cursor: pointer; backdrop-filter: blur(4px); } .uvp-pip:hover { background: rgba(0,0,0,.85); } .uvp-save:disabled { background: rgba(50,50,50,.85); cursor: not-allowed; color: #ccc; } .uvp-progress-track { position: absolute; top: 0; left: 0; right: 0; height: 4px; background: rgba(255,255,255,0.1); z-index: 3; opacity: 0; transition: opacity 0.3s; } .uvp-progress-fill { height: 100%; width: 0%; background: #19c3ff; box-shadow: 0 0 8px #19c3ff; transition: width 0.1s linear; }`;
    shadow.appendChild(shadowStyle);
    // Build overlay with DOM API (not innerHTML) — YouTube enforces Trusted Types policy
    const progressTrack = document.createElement('div'); progressTrack.className = 'uvp-progress-track';
    const progressFill = document.createElement('div'); progressFill.className = 'uvp-progress-fill';
    progressTrack.appendChild(progressFill);
    const saveBtn = document.createElement('button'); saveBtn.className = 'uvp-save'; saveBtn.type = 'button'; saveBtn.textContent = 'Save';
    const closeBtn = document.createElement('button'); closeBtn.className = 'uvp-close'; closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', 'Close'); closeBtn.textContent = '\u2715';
    const pipBtn = document.createElement('button'); pipBtn.className = 'uvp-pip'; pipBtn.type = 'button'; pipBtn.title = 'Picture-in-Picture'; pipBtn.setAttribute('aria-label', 'Picture-in-Picture'); pipBtn.textContent = '\u29C9';
    const vid = document.createElement('video'); vid.controls = true; vid.autoplay = true; vid.loop = true; vid.setAttribute('loop', ''); vid.setAttribute('playsinline', ''); vid.setAttribute('webkit-playsinline', '');
    shadow.appendChild(progressTrack); shadow.appendChild(saveBtn); shadow.appendChild(pipBtn); shadow.appendChild(closeBtn); shadow.appendChild(vid);
    
    // Playback mode decision: DASH whenever adaptive pair with byte ranges exists; falls back to muxed or HLS.
    state.audio = null;
    
    document.body.appendChild(overlay);
    shadow.querySelector('.uvp-close').addEventListener('click', () => UVP.Overlay.closeOverlay(false), { once: true });
    shadow.querySelector('.uvp-save').addEventListener('click', () => UVP.Download.handleSaveAction(state.overlayUrl || url));
    // Picture-in-Picture toggle (feature-detected — hidden where unsupported).
    const pipSupported = !!document.pictureInPictureEnabled && typeof vid.requestPictureInPicture === 'function';
    if (!pipSupported) pipBtn.style.display = 'none';
    pipBtn.addEventListener('click', async () => {
      try {
        const isThisInPip = !!(document.pictureInPictureElement && (
          document.pictureInPictureElement === state.overlay ||
          document.pictureInPictureElement === state.video ||
          (state.overlay && state.overlay.shadowRoot && (
            state.overlay.shadowRoot.contains(document.pictureInPictureElement) ||
            state.overlay.shadowRoot.pictureInPictureElement === state.video
          ))
        ));
        if (isThisInPip) {
          await document.exitPictureInPicture();
        } else {
          if (document.pictureInPictureElement) {
            try { await document.exitPictureInPicture(); } catch (err) {}
          }
          await state.video.requestPictureInPicture();
        }
      } catch (e) { if (DEBUG) console.warn('[UVP] PiP failed:', e); UVP.Overlay.showToast('Picture-in-Picture unavailable'); }
    });
    vid.addEventListener('enterpictureinpicture', () => {
      state.isDetachedPip = true;
      if (state.overlay) state.overlay.style.display = 'none';
      if (DEBUG) console.log('[UVP] Entered Picture-in-Picture');
    });
    vid.addEventListener('leavepictureinpicture', () => {
      if (DEBUG) console.log('[UVP] Left Picture-in-Picture, detached:', state.isDetachedPip);
      state.isDetachedPip = false;
      let canRetarget = false;
      if (state._activePlaybackSource && document.body.contains(state._activePlaybackSource)) {
        if (UVP.Overlay.isSameAsActivePlayback(state._activePlaybackSource)) {
          const r = state._activePlaybackSource.getBoundingClientRect();
          const vw = window.innerWidth, vh = window.innerHeight;
          const visH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
          const visW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
          if (visH >= 60 && visW >= CONFIG.minVideoWidth) {
            state.targetVideo = state._activePlaybackSource;
            canRetarget = true;
          }
        }
      }
      if (canRetarget && state.overlay) {
        state.isMiniPlayer = false;
        state.overlay.style.display = 'flex';
        UVP.Overlay.updateButtonPosition();
        UVP.Overlay.startOverlaySync();
      } else {
        UVP.Overlay.closeOverlay(false);
      }
    });
    // Double-click the video to toggle fullscreen on the overlay container.
    UVP.Overlay.bindVideoEvents(vid);
    if (state.isDownloading) { const svBtn = shadow.querySelector('.uvp-save'); const track = shadow.querySelector('.uvp-progress-track'); const fill = shadow.querySelector('.uvp-progress-fill'); if (svBtn) { svBtn.disabled = false; svBtn.textContent = state.downloadText || '...'; } if (track) track.style.opacity = '1'; if (fill) fill.style.width = `${state.downloadPercent || 0}%`; }
    state.overlayGeneration++;
    const overlayGeneration = state.overlayGeneration;
    state.overlay = overlay; state.video = shadow.querySelector('video'); state.overlayUrl = url; state.lastVideoTime = 0; state.stallCount = 0;
    state.isMiniPlayer = false;
    state._activePlaybackSource = state.targetVideo;
    state._activePoster = state.targetVideo ? (state.targetVideo.poster || null) : null;
    state._activeRgId = (state.targetVideo && UVP.Extractors.isRedgifs())
      ? (UVP.Extractors.getRgIdFromElement(state.targetVideo) || (url ? UVP.Extractors.sanitizeRgId(url.split('/').pop().replace(/\..+$/, '').replace(/-mobile$/, '')) : null))
      : null;
    // Live flag drives: no seek restore (playVideo), no position persistence
    // (savePlayerState), and no Save/Audio download (live URLs can't be saved).
    state.overlayIsLive = !!(ytFmtMap.get(url) && ytFmtMap.get(url).isLive);
    state.wasPaused = !!opts.paused;
    state.suppressPlaybackStateEvents = true;
    state.video.addEventListener('playing', () => {
      if (state.overlayGeneration === overlayGeneration) state.suppressPlaybackStateEvents = false;
    }, { once: true });
    UVP.Overlay.bindPlaybackIntent(state.video, overlayGeneration);
    state.recoveryAttempts = 0;
    const uvpBtn = document.getElementById('uvp-native-btn');
    if (uvpBtn) uvpBtn.style.display = 'none';
    UVP.Overlay.startOverlaySync(); UVP.Overlay.playVideo(url, state.video, opts.seekTo); UVP.Overlay.setupVideoHealthMonitoring();
    // Periodically save player position so recovery can seek back if the video resets
    if (state.saveStateInterval) clearInterval(state.saveStateInterval);
    state.saveStateInterval = setInterval(() => { if (state.overlay && state.video) UVP.State.savePlayerState(); }, 5000);
    if (state.isDownloading) { if (UVP.StateMachine.can('DOWNLOADING')) UVP.StateMachine.transition('DOWNLOADING', 'openOverlay'); } else { if (UVP.StateMachine.can('PLAYING')) UVP.StateMachine.transition('PLAYING', 'openOverlay'); }
    return url;
  }
 

  // ==================== SITE REGISTRY ====================
  // Centralized registry for site-specific extraction. Each entry provides a
  // detection predicate and an async URL resolver. The generic fallback runs
  // when no registered site matches.
  UVP.Extractors.SITES = [
    {
      name: 'RedGifs',
      isSite: UVP.Extractors.isRedgifs,
      getUrl: async function(bestVideo) {
        let videoId = bestVideo ? UVP.Extractors.getRgIdFromElement(bestVideo) : null;
        if (!videoId) videoId = UVP.Extractors.getRgIdFromUrl(location.href);
        if (!videoId && bestVideo && bestVideo.poster) { const m = bestVideo.poster.match(/\/([^/]+?)(?:-mobile|-poster|-sd|-hd)?\.(?:jpg|webp)$/i); if (m) videoId = UVP.Extractors.sanitizeRgId(m[1]); }
        if (!videoId && bestVideo) { const src = bestVideo.currentSrc || bestVideo.src || ''; if (src && !src.startsWith('blob:')) { const m = src.match(/\/([^/]+?)(?:-mobile|-sd|-hd)?(?:\.mp4|\.m4s|\.webm|\.jpg|\.gif)?(?:[?#]|$)/i); if (m) videoId = UVP.Extractors.sanitizeRgId(m[1]); } }

        let url = null;
        // 1. Direct CDN URL derivation from poster image (instant, 100% reliable)
        if (bestVideo && bestVideo.poster && /media\.redgifs\.com/i.test(bestVideo.poster)) {
          const derived = bestVideo.poster.replace(/-(?:mobile|poster|silent|sd|hd)\.(?:jpg|webp)$/i, '.mp4');
          if (derived && derived.endsWith('.mp4')) url = UVP.Utils.assertSafeVideoUrl(derived);
        }
        if (!url && bestVideo) {
          const card = bestVideo.closest ? bestVideo.closest('.GifPreview, [data-feed-item-id]') : null;
          const img = card ? card.querySelector('img[src*="media.redgifs.com"]') : null;
          if (img && img.src) {
            const derived = img.src.replace(/-(?:mobile|poster|silent|sd|hd)\.(?:jpg|webp)$/i, '.mp4');
            if (derived && derived.endsWith('.mp4')) url = UVP.Utils.assertSafeVideoUrl(derived);
          }
        }
        // 2. Cached or fetched API URLs
        if (!url && videoId && rgUrlMap.has(videoId)) { const urls = rgUrlMap.get(videoId); url = urls.hd || urls.sd || null; }
        if (!url && videoId) { const urls = await UVP.Extractors.fetchRgUrls(videoId); if (urls) url = urls.hd || urls.sd || null; }
        // 3. Direct capitalized fallback: mushyfearlessgopher -> MushyFearlessGopher.mp4
        if (!url && videoId && videoId.length >= 5) {
          const capitalized = videoId.charAt(0).toUpperCase() + videoId.slice(1);
          url = UVP.Utils.assertSafeVideoUrl(`https://media.redgifs.com/${capitalized}.mp4`);
        }
        // Do NOT fall back to pickBestUrl() when a videoId was targeted!
        if (!url && !videoId) url = UVP.Utils.pickBestUrl();
        return url;
      }
    },
    {
      name: 'Pornhub',
      isSite: UVP.Extractors.isPornhub,
      getUrl: async function() {
        UVP.Utils.safeCall(UVP.Extractors.extractPornhubUrls, 'extractPornhubUrls');
        let url = UVP.Extractors.pickPornhubUrl();
        if (!url) url = await UVP.Utils.safeAwait(UVP.Extractors.resolvePornhubGetMediaFallback(), 'resolvePornhubGetMediaFallback');
        if (!url) url = UVP.Utils.pickBestUrl();
        return url;
      }
    },
    {
      name: 'SpankBang',
      isSite: UVP.Extractors.isSpankBang,
      getUrl: async function() {
        UVP.Utils.safeCall(UVP.Extractors.extractSpankBangUrls, 'extractSpankBangUrls');
        let url = UVP.Utils.pickByBestResolution(u => /spankbang\.com|phncdn|cdn/i.test(u));
        if (!url) { await UVP.Utils.safeAwait(UVP.Extractors.fetchSpankBangStreamApi(), 'fetchSpankBangStreamApi'); url = UVP.Utils.pickByBestResolution(u => /spankbang\.com|phncdn|cdn/i.test(u)); }
        if (!url) url = UVP.Utils.pickBestUrl();
        return url;
      }
    },
    {
      name: 'XHamster',
      isSite: UVP.Extractors.isXHamster,
      getUrl: function() {
        UVP.Utils.safeCall(UVP.Extractors.extractXHamsterUrls, 'extractXHamsterUrls');
        const all = UVP.Utils.extractAllUrls();
        const hls = all.filter(u => /\.m3u8([?#]|$)/i.test(u));
        let url = null;
        if (hls.length) { hls.sort((a, b) => UVP.Utils.resOf(b) - UVP.Utils.resOf(a)); url = hls[0]; }
        if (!url) url = UVP.Utils.pickByBestResolution(u => /xhamster|xhcdn|cdn/i.test(u) || /\.mp4([?#]|$)/i.test(u));
        if (!url) url = UVP.Utils.pickBestUrl();
        return url;
      }
    },
    {
      name: 'XVideos',
      isSite: UVP.Extractors.isXVideos,
      getUrl: function() {
        UVP.Utils.safeCall(UVP.Extractors.extractXVideosUrls, 'extractXVideosUrls');
        // Filter out MMCDN live-cam ad banners and preview clips
        let url = UVP.Utils.pickByBestResolution(u => /xvideos|xnxx|xvideos-cdn/i.test(u) && !/preview\.mp4|mmcdn\.com/i.test(u));
        if (!url) url = UVP.Utils.pickBestUrl();
        return url;
      }
    },
    {
      name: 'PHNetwork',
      isSite: UVP.Extractors.isPHNetwork,
      getUrl: function() {
        UVP.Utils.safeCall(UVP.Extractors.extractPHNetworkUrls, 'extractPHNetworkUrls');
        let url = UVP.Utils.pickByBestResolution(u => /youporn|redtube|tube8|thumbzilla|phncdn|cdn/i.test(u));
        if (!url) url = UVP.Utils.pickBestUrl();
        return url;
      }
    },
    {
      name: 'Eporner',
      isSite: UVP.Extractors.isEporner,
      getUrl: async function() {
        await UVP.Utils.safeAwait(UVP.Extractors.extractEpornerUrls(), 'extractEpornerUrls');
        // Prefer the latest host-scoped top-level HLS manifest. Sorting every
        // playlist by a "480p" URL marker incorrectly selected media playlists
        // over the master that exposes the complete 240p–1080p ladder.
        const hls = UVP.Utils.pickBestUrlByFormat('m3u8');
        if (hls) return hls;
        const all = UVP.Utils.extractAllUrls().filter(u => /eporner|cdn|gvideo/i.test(u) && !UVP.Utils.isLikelyAdaptiveFragment(u));
        all.sort((a, b) => UVP.Utils.resOf(b) - UVP.Utils.resOf(a));
        const mp4 = all.find(url => UVP.Utils.isDirectMedia(url));
        if (mp4) return mp4;
        return UVP.Utils.pickBestUrl();
      }
    },
    {
      name: 'YouTube',
      isSite: UVP.Extractors.isYouTube,
      getUrl: async function() {
        // Non-watch pages (search, home, channel) have no video to extract.
        // Return null so showNativePlayer shows "No video URL found" rather
        // than picking up stale googlevideo URLs from a previous watch page.
        if (!UVP.Extractors.getYtVideoId()) return null;
        await UVP.Utils.safeAwait(UVP.Extractors.extractYouTubeUrls(), 'extractYouTubeUrls');
        let url = UVP.Extractors.pickYouTubeUrl();
        if (!url) url = UVP.Utils.pickBestUrl();
        return url;
      }
    },
    {
      name: 'PMVHaven',
      isSite: UVP.Extractors.isPMVHaven,
      getUrl: async function() {
        UVP.Utils.safeCall(UVP.Extractors.extractPMVHavenUrls, 'extractPMVHavenUrls');
        return UVP.Utils.pickBestUrl(); // Fallback to generic URL resolution
      }
    },
    {
      name: 'X',
      isSite: UVP.Extractors.isX,
      getUrl: async function(bestVideo) {
        // Identify which specific video the user clicked. On the timeline,
        // GraphQL interception captures URLs from ALL tweets — we must
        // filter to the one matching the clicked <video> element.
        let mediaId = null;
        let tweetId = UVP.Extractors.getXTweetId();

        if (bestVideo) {
          // Extract media ID from poster — maps directly to the video URL's
          // path segment (video.twimg.com/ext_tw_video/<mediaId>/pu/...).
          if (bestVideo.poster) mediaId = UVP.Extractors.getXMediaIdFromPoster(bestVideo.poster);
          // On non-tweet pages (timeline), find the tweet ID from the DOM
          // context so we can fall back to the syndication API.
          if (!tweetId) tweetId = UVP.Extractors.getXTweetIdFromElement(bestVideo);
        }

        const hasCaptured = [...capturedUrls].some(u => /video\.twimg\.com/i.test(u) && /\.(mp4|m3u8)([?#]|$)/i.test(u));
        if (!tweetId && !hasCaptured) return null;

        // If we don't yet have captured URLs for this specific media ID,
        // try the syndication API to fetch variants for this tweet.
        if (tweetId && mediaId) {
          const hasForThisVideo = [...capturedUrls].some(u => u.includes('/' + mediaId + '/'));
          if (!hasForThisVideo) await UVP.Utils.safeAwait(UVP.Extractors.fetchXSyndication(tweetId), 'fetchXSyndication');
        } else if (tweetId && !hasCaptured) {
          await UVP.Utils.safeAwait(UVP.Extractors.fetchXSyndication(tweetId), 'fetchXSyndication');
        }

        // pickXUrl(mediaId) filters by media ID — only returns URLs matching
        // the clicked video. Don't fall back to pickBestUrl (which doesn't
        // filter) — that could return a stale URL from a different tweet
        // preserved across SPA navigation.
        return UVP.Extractors.pickXUrl(mediaId);
      }
    }
  ];

  UVP.Extractors.getGenericUrl = function(bestVideo) {
    let targetUrl = null;
    if (bestVideo) {
      let src = bestVideo.currentSrc || bestVideo.src || bestVideo.getAttribute('src') || bestVideo.getAttribute('data-src') || bestVideo.getAttribute('data-mp4');
      if (UVP.Utils.isUsableUrl(src)) targetUrl = UVP.Utils.resolveSafeUrl(src, location.href);
      else {
        const source = bestVideo.querySelector('source');
        if (source) {
          let sourceSrc = source.src || source.getAttribute('src');
          if (UVP.Utils.isUsableUrl(sourceSrc)) targetUrl = UVP.Utils.resolveSafeUrl(sourceSrc, location.href);
        }
      }
    }
    if (targetUrl) {
      // If target is already an HLS or DASH manifest, preserve its exact self-contained variant ladder
      if (/\.(m3u8|mpd)(?:[?#]|$)/i.test(targetUrl)) return targetUrl;
      try {
        const urlObj = new URL(targetUrl);
        const pathParts = urlObj.pathname.split('/');
        const uniqueFolder = pathParts.length > 1 ? pathParts[pathParts.length - 2] : null;
        let fileNameBase = pathParts[pathParts.length - 1]
          .replace(/\.(mp4|m3u8|webm)$/i, '')
          .replace(/[-_](?:2160|1440|1080|720|480|360|240)p?$/i, '')
          .replace(/[-_](?:high|low|hd|sd|mid|medium|mobile|large|small|trailer)$/i, '');
        const isGenericName = /^(?:master|index|playlist|manifest|video|stream|output|trailer|source|default|main|chunk|segment|seg|frag)(?:[-_.]?\d+)?$/i.test(fileNameBase);
        const allUrls = UVP.Utils.extractAllUrls();
        const matchingUrls = allUrls.filter(u => {
          if (u === targetUrl) return true;
          try {
            const uObj = new URL(u);
            const useFileMatch = !isGenericName && fileNameBase && fileNameBase.length > 3;
            if (useFileMatch) return uObj.pathname.includes(fileNameBase);
            return isGenericName && uniqueFolder && uniqueFolder.length > 2 && uObj.pathname.includes('/' + uniqueFolder + '/');
          } catch (e) { return false; }
        });
        matchingUrls.sort((a, b) => UVP.Utils.resOf(b) - UVP.Utils.resOf(a));
        return matchingUrls[0] || targetUrl;
      } catch (e) {
        return targetUrl;
      }
    }
    // MSE fallback: when the video src is blob: (MSE-based player), we have
    // no direct URL to match. But the poster often shares a path segment with
    // the video URL (e.g. X.com's ext_tw_video_thumb/<id>/... matches
    // video.twimg.com/.../<id>/...; many CDNs use the same media ID in both
    // poster and video paths). Extract numeric path segments from the poster
    // and filter captured URLs by that segment — same technique as X.com's
    // pickXUrl(mediaId), generalized for any MSE site without a dedicated
    // extractor. Falls through to pickBestUrl() if no poster match is found.
    const posterSrc = bestVideo ? (
      bestVideo.poster ||
      bestVideo.getAttribute('poster') ||
      (bestVideo.closest && bestVideo.closest('article, [class*="card"], [class*="item"]')?.querySelector('img')?.src) ||
      (bestVideo.parentElement && bestVideo.parentElement.querySelector('img')?.src)
    ) : null;
    if (!targetUrl && posterSrc) {
      try {
        const posterUrl = new URL(posterSrc, location.href);
        const segments = posterUrl.pathname.split('/').filter(s => s.length >= 4 && /\d/.test(s));
        if (segments.length) {
          const allUrls = UVP.Utils.extractAllUrls();
          segments.sort((a, b) => b.length - a.length); // most specific first
          for (const seg of segments) {
            const matches = allUrls.filter(u => { try { return new URL(u).pathname.includes('/' + seg + '/') || new URL(u).pathname.includes(seg); } catch (e) { return false; } });
            if (matches.length) {
              matches.sort((a, b) => UVP.Utils.resOf(b) - UVP.Utils.resOf(a));
              const mp4 = matches.find(u => /\.mp4([?#]|$)/i.test(u));
              if (mp4) return mp4;
              const hls = matches.find(u => /\.m3u8([?#]|$)/i.test(u));
              if (hls) return hls;
              return matches[0];
            }
          }
        }
      } catch (e) { /* fall through */ }
    }
    return UVP.Utils.pickBestUrl();
  };

      UVP.Overlay.showNativePlayer = async function() {
    let url = null;
    // Staleness guard: aborts extraction if user SPA-navigated away before resolution.
    const _initialHref = location.href;
    const _initialVid = UVP.Extractors.isYouTube() ? UVP.Extractors.getYtVideoId() : null;
    const isStale = () => location.href !== _initialHref || (_initialVid && UVP.Extractors.getYtVideoId() !== _initialVid);
    const bestVideo = state.buttonTargetVideo || UVP.Overlay.findBestVideo();
    
    // Capture background video playback time before pausing so the
    // overlay can resume seamlessly from the same position.
    const initialTime = (bestVideo && isFinite(bestVideo.currentTime) && bestVideo.currentTime > 0) ? bestVideo.currentTime : 0;
    // Pause the background video immediately when the button is clicked,
    // before the async extraction phase begins.
    if (bestVideo) {
      try { bestVideo.pause(); } catch (e) {}
      state.targetVideo = bestVideo;
    }

    // Invalidate URL cache so extractor evaluates fresh network captures
    UVP.Utils.invalidateUrlCache();
    UVP.Utils.invalidateInlineScriptCache();
    // Format-pipeline readiness gate (YouTube) — see CONFIG.playFormatWaitMs.
    // @require'd bundles delay script start, so an early click can beat the
    // extraction pipeline; waiting (bounded) for the format map to become
    // current prevents both the "No video URL" miss and the stalled-overlay
    // first-click failure.
    if (UVP.Extractors.isYouTube() && !UVP.Extractors.ytFormatsCurrent()) {
      const _gateStart = Date.now();
      let _gateToasted = false;
      while (Date.now() - _gateStart < CONFIG.playFormatWaitMs) {
        if (isStale()) return;
        if (!_gateToasted) { _gateToasted = true; UVP.Overlay.showToast('Loading video data…', CONFIG.playFormatWaitMs + 2000); }
        await new Promise(r => setTimeout(r, 300));
        if (UVP.Extractors.ytFormatsCurrent()) break;
      }
    }
    // Generic JSON-LD (re)scan — catches server-rendered stream URLs that no
    // fetch/XHR interception ever sees (blob: players). Idempotent.
    UVP.Utils.safeCall(UVP.Extractors.extractJsonLdVideoUrls, 'extractJsonLdVideoUrls');
    // Render loading indicator on play button during async extraction
    const _btn = document.getElementById('uvp-native-btn');
    let _btnOrigText = '';
    if (_btn) { _btn.style.pointerEvents = 'none'; _btnOrigText = _btn.textContent; _btn.textContent = '⏳'; }
    const _restoreBtn = () => { if (_btn) { _btn.style.pointerEvents = ''; _btn.textContent = _btnOrigText; } };
    
    try {
 
    const site = UVP.Extractors.SITES.find(s => s.isSite());
    if (site) {
      url = await site.getUrl(bestVideo);
    } else {
      url = UVP.Extractors.getGenericUrl(bestVideo);
    }
    if (isStale()) return; // Navigated away during extraction — abort.

    // GLOBAL POKE RETRY: If no URL was found (often because the video has preload="none"
    // or is a custom player that hasn't fired its network requests yet), briefly poke
    // the video to force it to load, wait for the network interceptors to catch the
    // stream, and then try extraction one more time.
    if (!url && bestVideo) {
      if (DEBUG) console.log('[UVP] No URL found on first pass. Poking video player...');
      try {
        const cardContainer = bestVideo.closest ? bestVideo.closest('article, [class*="card"], [class*="item"]') : null;
        if (cardContainer) {
          try {
            cardContainer.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            cardContainer.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          } catch (e) {}
        }
        const wasMuted = bestVideo.muted;
        bestVideo.muted = true;
        const p = bestVideo.play();
        if (p && p.catch) p.catch(() => {});
        
        // Poll for captured URLs — YouTube's player may need up to ~1.6s
        // to fire its /youtubei/v1/player request after a muted play/poke.
        // The old fixed 300ms wait was too short, causing extraction to fail
        // on YouTube after SPA navigation unless the user played manually first.
        const isYtPoke = UVP.Extractors.isYouTube();
        const pokeMaxMs = isYtPoke ? 1600 : 600;
        const pokeStart = Date.now();
        while (Date.now() - pokeStart < pokeMaxMs) {
          await new Promise(r => setTimeout(r, 200));
          if (isStale()) break; // Stop polling if user navigated away.
          UVP.Utils.invalidateUrlCache();
          if (isYtPoke) {
            if ([...capturedUrls].some(u => /googlevideo\.com/i.test(u))) {
              if (DEBUG) console.log('[UVP] Poke captured googlevideo URLs after', Date.now() - pokeStart, 'ms');
              break;
            }
          } else {
            if (UVP.Utils.extractAllUrls().length > 0) break;
          }
        }
        
        try { bestVideo.pause(); } catch (e) {}
        bestVideo.muted = wasMuted;
        
        // Invalidate cache and retry extraction
        UVP.Utils.invalidateUrlCache();
        if (site) {
          url = await site.getUrl(bestVideo);
        } else {
          url = UVP.Extractors.getGenericUrl(bestVideo);
        }
        if (isStale()) return; // Navigated away during retry — abort before openOverlay.
      } catch (e) {
        if (DEBUG) console.warn('[UVP] Global poke failed:', e);
      }
    }

    if (!url) {
      const gate = UVP.Extractors.isYouTube() ? UVP.Extractors.ytGateSummary() : null;
      console.warn('[UVP] No direct video URL found. Hiding button for this video.' + (gate ? ' YouTube playability: ' + gate : ''));
      state.buttonDismissed = true;
      const btn = document.getElementById('uvp-native-btn');
      if (btn) btn.style.display = 'none';
      UVP.Overlay.showToast(gate ? 'No video URL - YouTube gated this session (' + gate.slice(0, 80) + ')' : 'No video URL found on this page', 5000);
      return;
    }

    // Locked-URL guard (YouTube) — see CONFIG.playDecipherWaitMs. A
    // googlevideo URL whose n-param is still undeciphered 403s on its first
    // segment and stalls the overlay in retry recovery until the solver
    // finishes; wait (bounded) for the decipher before opening.
    if (UVP.Extractors.isYouTube() && url && /googlevideo\.com/i.test(url)) {
      const _nInfo = ytFmtMap.get(url);
      if (_nInfo && !ytDecipheredUrls.has(url) && (_nInfo.hasN === true || (_nInfo.hasN !== false && /[?&]n=/.test(url)))) {
        const _nStart = Date.now();
        while (Date.now() - _nStart < CONFIG.playDecipherWaitMs) {
          if (isStale()) return;
          if (ytDecipheredUrls.has(url)) break;
          await new Promise(r => setTimeout(r, 250));
        }
      }
    }

    const opened = UVP.Overlay.openOverlay(url, { seekTo: initialTime, paused: false });
    if (!opened) {
      // openOverlay rejected the URL (unsafe) — mirror its toast and keep the
      // button hidden instead of silently leaving the UI in a stale state.
      state.buttonDismissed = true;
      const btn = document.getElementById('uvp-native-btn');
      if (btn) btn.style.display = 'none';
    }
    } catch (e) {
      if (DEBUG) console.warn('[UVP] showNativePlayer error:', e);
      state.buttonDismissed = true;
      const btn = document.getElementById('uvp-native-btn');
      if (btn) btn.style.display = 'none';
      UVP.Overlay.showToast('Extraction failed');
    } finally {
      _restoreBtn();
    }
  }
 
 
 
  // ==================== PLAYER STATE PERSISTENCE ====================
  UVP.State.savePlayerState = function() { if (!state.video || !state.overlayUrl || state.overlayIsLive) return; try { sessionStorage.setItem('uvp-player', JSON.stringify({ url: state.overlayUrl, t: state.video.currentTime || 0, paused: state.video.paused, pageUrl: location.href, ts: Date.now(), audio: state.targetAudioUrl || null })); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } } // Persist audio stream URL to support state restoration.
  UVP.State.readPlayerState = function() { try { const raw = sessionStorage.getItem('uvp-player'); if (!raw) return null; const p = JSON.parse(raw); if (!p || !p.url || (Date.now() - (p.ts || 0)) > CONFIG.playerTtlMs) return null; return p; } catch (e) { return null; } }
  // Restores active player session on page load/navigation, validating media URLs and time position.
  UVP.State.restorePlayerOnBoot = function() {
    const p = UVP.State.readPlayerState(); if (!p) return; if (p.pageUrl && p.pageUrl !== location.href) return;
    const go = () => {
      if (state.overlay) return;
      // Navigation guard: ensure user has not navigated to a different video during the restore delay.
      if (p.pageUrl && p.pageUrl !== location.href) return;
      state.targetVideo = UVP.Overlay.findBestVideo();
      state.targetAudioUrl = UVP.Utils.assertSafeVideoUrl(p.audio) || null;
      UVP.Overlay.openOverlay(p.url, { seekTo: p.t, paused: p.paused });
    };
    if (document.readyState === 'complete') setTimeout(go, CONFIG.overlayRestoreDelayMs);
    else window.addEventListener('load', () => setTimeout(go, CONFIG.overlayRestoreDelayMs), { once: true });
  }
 
  // ==================== DOWNLOAD RESUME ====================
  // Attempts to resume interrupted download across page reloads/navigations.
  UVP.State.maybeResumeDownload = function() {
    let raw; try { raw = sessionStorage.getItem('uvp-dl-job'); } catch (e) { if (DEBUG) console.warn('[UVP]', e); return; }
    if (!raw) return;
    if (state.isDownloading) return;
    if (resumeInProgress) return;
    // Parse the meta BEFORE the scope swap: cancelCurrent() emits
    // download:cancel whose handler synchronously removes the meta the resume
    // needs (that race made every non-cold-boot resume a silent no-op).
    let meta = null;
    try { meta = JSON.parse(raw); } catch (e) { meta = null; }
    if (!meta || !meta.url) { UVP.Download.cleanupDownload(); return; }
    const updateUI = UVP.Download.makeUpdateUI();
    UVP.Download._skipCancelCleanup = true;
    try { UVP.Cancel.cancelCurrent(); } catch (e) {}
    UVP.Download._skipCancelCleanup = false;
    const scope = UVP.Cancel.createScope();
    resumeInProgress = true;
    state.isDownloading = true;
    UVP.Download.resumeDownload(updateUI, scope, meta).then(ok => {
      resumeInProgress = false;
      // Only touch UI/state while still the current download. The old
      // `if (!state.isDownloading) return;` check raced with the job's own
      // cleanupDownload() (which clears that flag on success AND failure),
      // making the success/failure feedback below permanently unreachable.
      if (UVP.Cancel.current() !== scope) return;
      state.isDownloading = false;
      const saveBtn = state.overlay ? state.overlay.shadowRoot.querySelector('.uvp-save') : null;
      if (ok === true) {
        if (saveBtn) { saveBtn.textContent = 'Done!'; setTimeout(() => { if (UVP.Cancel.current() === scope) UVP.Download.endDownload(saveBtn, 'resume success'); }, 2500); }
        else UVP.Download.endDownload(null, 'resume success');
      } else {
        UVP.Download.endDownload(saveBtn, ok === null ? 'resume cancelled' : 'resume fail');
      }
    }).catch(e => {
      console.error('[UVP] Resume error:', e);
      resumeInProgress = false;
      if (UVP.Cancel.current() !== scope) return;
      state.isDownloading = false;
      UVP.Download.cleanupDownload();
      const saveBtn = state.overlay ? state.overlay.shadowRoot.querySelector('.uvp-save') : null;
      UVP.Download.endDownload(saveBtn, 'resume error');
    });
  }
 
  // ==================== VISIBILITY / LIFECYCLE ====================
  UVP.Boot.pauseForBackground = function() {
    UVP.State.savePlayerState();
    if (!state.backgroundPauseCaptured) {
      state.backgroundWasPlaying = !!(state.video && !state.video.paused && !state.video.ended);
      state.backgroundPauseCaptured = true;
    }
    state.suppressPlaybackStateEvents = true;
    // Pause both the overlay video and the site player so the app is silent
    // when tabbed/minimized (especially Pornhub, which restarts aggressively).
    [state.video, state.targetVideo].forEach(v => {
      if (v) { try { v.pause(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
    });
    state.suppressPlaybackStateEvents = false;
    // Stop HLS.js from fetching segments while hidden; it will be resumed in
    // resumeFromBackground().
    if (state.hls) { try { state.hls.stopLoad(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
    state.recoveryAttempts = 0;
  };

  UVP.Boot.resumeFromBackground = function() {
    if (state.hls) { try { state.hls.startLoad(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
    const video = state.video;
    const overlay = state.overlay;
    const generation = state.overlayGeneration;
    if (overlay && video && state.backgroundWasPlaying) {
      setTimeout(() => {
        if (state.overlay === overlay && state.video === video && state.overlayGeneration === generation) UVP.Overlay.resumeOrPauseVideo(video);
      }, CONFIG.resumeDelayMs);
    }
    state.backgroundWasPlaying = false;
    state.backgroundPauseCaptured = false;
    UVP.State.maybeResumeDownload();
  };

  UVP.Boot.onVisibilityChange = function() {
    if (document.hidden) UVP.Boot.pauseForBackground();
    else UVP.Boot.resumeFromBackground();
  };
 
  // ==================== SITE OBSERVER HELPER ====================
  // A1: deduplicates the MutationObserver + initial extraction pattern used by 7 sites
  UVP.Boot.setupSiteObserver = function(isSiteFn, extractFn) {
    if (!isSiteFn()) return;
    const extract = () => { extractFn(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(extract, CONFIG.siteExtractInitialDelayMs), { once: true });
    else setTimeout(extract, CONFIG.siteExtractInitialDelayMs);
    let timer = null;
    const observer = new MutationObserver(() => { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; UVP.Utils.invalidateInlineScriptCache(); extractFn(); }, CONFIG.observerDebounceMs); });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    else document.addEventListener('DOMContentLoaded', () => observer.observe(document.body, { childList: true, subtree: true }), { once: true });
  }

  // A2: config array for SPA nav re-extraction (deduplicates UVP.Boot.onSpaNav if-chain)
  const SPA_NAV_EXTRACTORS = [
    { test: UVP.Extractors.isPornhub,   extract: UVP.Extractors.extractPornhubUrls },
    { test: UVP.Extractors.isXVideos,    extract: UVP.Extractors.extractXVideosUrls },
    { test: UVP.Extractors.isPHNetwork,  extract: UVP.Extractors.extractPHNetworkUrls },
    { test: UVP.Extractors.isEporner,     extract: UVP.Extractors.extractEpornerUrls },
    { test: UVP.Extractors.isSpankBang,   extract: UVP.Extractors.extractSpankBangUrls },
    { test: UVP.Extractors.isXHamster,    extract: UVP.Extractors.extractXHamsterUrls },
    { test: UVP.Extractors.isPMVHaven,    extract: UVP.Extractors.extractPMVHavenUrls },
    { test: UVP.Extractors.isX,          extract: UVP.Extractors.extractXUrls },
  ];

  // ==================== SAFE MENU REGISTRATION ====================
  // Userscript-manager menu commands differ across engines: Tampermonkey/
  // Violentmonkey/AdGuard expose GM_registerMenuCommand and/or the GM.* namespace.
  // Register through available surfaces in a safe try-catch wrapper.
  UVP.Boot.registerMenuCommand = function(label, fn) {
    try {
      if (typeof GM_registerMenuCommand === 'function') { return GM_registerMenuCommand(label, fn); }
    } catch (e) { if (DEBUG) console.warn('[UVP] GM_registerMenuCommand failed for "' + label + '":', e); }
    try {
      const gm = (typeof GM === 'object' && GM) ? GM : ((typeof unsafeWindow !== 'undefined' && unsafeWindow && unsafeWindow.GM) || null);
      if (gm && typeof gm.registerMenuCommand === 'function') {
        const str = String(gm.registerMenuCommand);
        if (str.indexOf('not supported') === -1) {
          return gm.registerMenuCommand(label, fn);
        }
      }
    } catch (e) { if (DEBUG) console.warn('[UVP] GM.registerMenuCommand failed for "' + label + '":', e); }
    if (DEBUG) console.warn('[UVP] Menu commands unavailable in this userscript manager — skipping "' + label + '"');
    return false;
  };

  let _menuCommandIds = [];
  UVP.Boot.updateMenuCommands = function() {
    if (typeof GM_unregisterMenuCommand === 'function') {
      for (const id of _menuCommandIds) {
        try { if (id !== false && id !== null && id !== undefined) GM_unregisterMenuCommand(id); } catch (e) {}
      }
    }
    _menuCommandIds = [];

    const playQ = UVP.Utils.getPlaybackQuality();
    const dlQ = UVP.Utils.getDownloadQuality();

    const playLabel = playQ === 'max' ? 'Max (1080p/4K)' : 'Auto (ABR)';
    const id1 = UVP.Boot.registerMenuCommand(`▶ Playback Quality: [${playLabel}] (click to toggle)`, () => {
      const next = UVP.Utils.getPlaybackQuality() === 'max' ? 'auto' : 'max';
      UVP.Utils.setPlaybackQuality(next);
      UVP.Overlay.showToast(`UVP playback quality: ${next === 'max' ? 'Max ladder (adaptive startup)' : 'Auto (production ABR)'}`);
      try {
        if (state.hls) {
          const topIdx = (next === 'max') ? UVP.Overlay.topHlsLevelIndex(state.hls) : -1;
          if (topIdx >= 0 || next === 'auto') state.hls.nextLevel = topIdx;
        } else if (state.overlay && state.overlayUrl && UVP.Extractors.isYouTube() && !state.overlayIsLive && !state.dashPlayer) {
          const video = state.video;
          const newUrl = UVP.Extractors.pickYouTubeUrl();
          if (newUrl && newUrl !== state.overlayUrl) {
            UVP.Overlay.openOverlay(newUrl, { seekTo: video ? video.currentTime : 0, paused: video ? video.paused : false });
          }
        }
      } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
      UVP.Boot.updateMenuCommands();
    });
    if (id1 !== false && id1 !== null && id1 !== undefined) _menuCommandIds.push(id1);

    const dlLabel = dlQ === 'muxed' ? '720p HD (Audio+Video)' : (dlQ === 'max' ? 'Max 1080p/4K (Video+Audio)' : 'Lowest 360p (Audio+Video)');
    const id2 = UVP.Boot.registerMenuCommand(`💾 Download Format: [${dlLabel}] (click to toggle)`, () => {
      const next = dlQ === 'muxed' ? 'max' : (dlQ === 'max' ? 'lowest' : 'muxed');
      UVP.Utils.setDownloadQuality(next);
      const nextLabel = next === 'muxed' ? '720p HD (Muxed Audio + Video)' : (next === 'max' ? 'Max 1080p/4K (Separate Video + Audio)' : 'Lowest 360p (Muxed Audio + Video)');
      UVP.Overlay.showToast(`UVP download format: ${nextLabel}`);
      UVP.Boot.updateMenuCommands();
    });
    if (id2 !== false && id2 !== null && id2 !== undefined) _menuCommandIds.push(id2);

    const id3 = UVP.Boot.registerMenuCommand('📥 Download Audio Only (.m4a/.opus)', () => {
      try {
        const p = UVP.Download.downloadAudioOnly();
        if (p && typeof p.catch === 'function') p.catch(e => { if (DEBUG) console.warn('[UVP] audio download failed:', e); UVP.Overlay.showToast('Audio download failed'); });
      } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    });
    if (id3 !== false && id3 !== null && id3 !== undefined) _menuCommandIds.push(id3);

    const id4 = UVP.Boot.registerMenuCommand(`🐞 Debug Logging: [${DEBUG ? 'ON' : 'OFF'}] (click to toggle)`, () => {
      DEBUG = !DEBUG;
      UVP.Overlay.showToast('UVP debug logging: ' + (DEBUG ? 'ON' : 'OFF'));
      UVP.Boot.updateMenuCommands();
    });
    if (id4 !== false && id4 !== null && id4 !== undefined) _menuCommandIds.push(id4);

    const id5 = UVP.Boot.registerMenuCommand('🔄 Re-scan page for videos', () => {
      state.buttonDismissed = false;
      state.sitePlayerFailed = false;
      try { sessionStorage.removeItem('uvp-failed'); } catch (e) {}
      UVP.Utils.invalidateUrlCache();
      UVP.Utils.invalidateInlineScriptCache();
      if (CONFIG.showButton) { UVP.Overlay.ensureButton(); UVP.Overlay.updateButtonPosition(); }
      UVP.Overlay.showToast('UVP: re-scanning page');
    });
    if (id5 !== false && id5 !== null && id5 !== undefined) _menuCommandIds.push(id5);
  };

  UVP.Boot.syncButtonWithOverlay = function() {
    const btn = document.getElementById('uvp-native-btn');
    if (!btn) return;
    const isFloating = state.isDetachedPip || state.isMiniPlayer;
    if ((document.querySelector('.uvp-overlay') || state.overlay) && !isFloating) {
      btn.style.display = 'none';
    } else {
      UVP.Overlay.updateButtonPosition();
    }
  };

  UVP.Boot.boot = function() {
    UVP.Overlay.injectStyles();
    // Clean up IndexedDB chunks if the tab is closed during an active download.
    // Without this, orphaned segment data persists forever and wastes storage.
    window.addEventListener('beforeunload', () => {
      if (state.isDownloading) {
        // Scoped to THIS job — a full-store clear here raced the unload and
        // could wipe a download running in another tab of the same origin.
        try { UVP.Download.cleanupDownload(currentDownloadJob); } catch (e) {}
      }
    });
    // Register dynamic status-aware userscript menu commands
    UVP.Boot.updateMenuCommands();
    try { state.sitePlayerFailed = sessionStorage.getItem('uvp-failed') === '1'; } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
    if (CONFIG.showButton) {
      // Delay initial button creation so the website's player has time to
      // start autoplaying before the overlay button pauses it.
      setTimeout(() => {
        let scrollTimer = null;
        UVP.Overlay.ensureButton();
        UVP.Overlay.startButtonSync();
        // Skip the rescan while the tab is hidden - findBestVideo() forces
        // layout reads that are wasted work in a background tab.
        state.buttonRescanInterval = setInterval(() => {
          if (document.hidden) return;
          const isFloating = state.isDetachedPip || state.isMiniPlayer;
          if ((isFloating || (!state.buttonDismissed && !state.overlay)) && !state.buttonHiddenByScroll) UVP.Overlay.ensureButton();
        }, CONFIG.rescanIntervalMs);
        const onScrollOrWheel = () => {
          const btn = document.getElementById('uvp-native-btn');
          if (btn) {
            if (!state.buttonHiddenByScroll) {
              btn.style.transition = 'opacity 0.1s ease';
              btn.style.opacity = '0';
              state.buttonHiddenByScroll = true;
            }
            if (scrollTimer) clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
              scrollTimer = null;
              state.buttonHiddenByScroll = false;
              UVP.Overlay.updateButtonPosition();
              if (btn) {
                btn.style.opacity = '1';
                btn.style.transition = ''; // restore CSS transition: transform 0.1s
              }
            }, CONFIG.scrollDebounceMs);
          }
        };
        document.addEventListener('scroll', onScrollOrWheel, { capture: true, passive: true });
        window.addEventListener('wheel', onScrollOrWheel, { capture: true, passive: true });
        window.addEventListener('touchmove', onScrollOrWheel, { capture: true, passive: true });
        window.addEventListener('resize', UVP.Overlay.updateButtonPosition, { passive: true });
      }, CONFIG.buttonLoadDelayMs);
      // Watch for overlay DOM changes and force the button hidden whenever an overlay is present.
      // This is the event-driven counterpart to the button sync loop; it handles cases where
      // state.overlay and the actual DOM fall out of sync.
      const overlayObserver = new MutationObserver((muts) => {
        for (const m of muts) {
          let touched = false;
          for (const n of m.addedNodes) { if (n.classList && n.classList.contains('uvp-overlay')) { touched = true; break; } }
          if (!touched) for (const n of m.removedNodes) { if (n.classList && n.classList.contains('uvp-overlay')) { touched = true; break; } }
          if (touched) { UVP.Boot.syncButtonWithOverlay(); break; }
        }
      });
      if (document.body) overlayObserver.observe(document.body, { childList: true, subtree: true });
      else document.addEventListener('DOMContentLoaded', () => overlayObserver.observe(document.body, { childList: true, subtree: true }), { once: true, passive: true });
    }
    document.addEventListener('visibilitychange', UVP.Boot.onVisibilityChange, { capture: true, passive: true });
    document.addEventListener('freeze', UVP.Boot.pauseForBackground, { passive: true });
    window.addEventListener('pagehide', (e) => {
      UVP.Boot.pauseForBackground();
      if (!e.persisted) {
        if (state.isDownloading) UVP.Cancel.cancelCurrent();
        state.isDownloading = false;
        resumeInProgress = false;
        if (state.buttonRescanInterval) { clearInterval(state.buttonRescanInterval); state.buttonRescanInterval = null; }
        try { sessionStorage.removeItem('uvp-dl-job'); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
        try { UVP.State.scheduleDbClear(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
      }
    }, { capture: true, passive: true });
    window.addEventListener('pageshow', (e) => { if (e.persisted) setTimeout(UVP.Boot.resumeFromBackground, CONFIG.resumeDelayMs); }, { passive: true });
    document.addEventListener('resume', () => setTimeout(UVP.Boot.resumeFromBackground, CONFIG.resumeDelayMs), { passive: true });
 
    // On manual page reload, clear persisted recovery state to avoid stale restoration.
    //   bfcache restore (pageshow persisted=true) and tab-switch (visibilitychange) still work.
    //   Download resume only fires for tab-switch / bfcache / app-switch, not after page close
    //   (pagehide with persisted=false clears all download state on actual close/navigation).
    if (UVP.Utils.isPageReload()) {
      console.log('[UVP] Page reloaded — clearing persisted recovery state');
      try { sessionStorage.removeItem('uvp-player'); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
      try { sessionStorage.removeItem('uvp-dl-job'); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
      UVP.State.clearOrphanedChunks().catch(() => {}); // fire-and-forget; job-scoped, so other tabs' active downloads are safe
    } else {
      UVP.State.restorePlayerOnBoot();
      let hasDlJob = false;
      try { hasDlJob = !!sessionStorage.getItem('uvp-dl-job'); } catch (e) { if (DEBUG) console.warn('[UVP]', e); }
      if (!hasDlJob) { try { UVP.State.scheduleDbClear(); } catch (e) { if (DEBUG) console.warn('[UVP]', e); } }
      UVP.State.maybeResumeDownload();
    }
 
    if (UVP.Extractors.isRedgifs()) {
      const rgObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'attributes' && m.target.tagName === 'VIDEO') { const video = m.target; if (video.dataset) delete video.dataset.rgId; if (video.poster) UVP.Extractors.deriveRgUrlsFromMedia(video.poster); const src = video.currentSrc || video.src || ''; if (src && !src.startsWith('blob:')) UVP.Extractors.deriveRgUrlsFromMedia(src); UVP.Overlay.updateButtonPosition(); }
          if (m.type === 'childList') { m.addedNodes.forEach(node => { if (node.nodeType === Node.ELEMENT_NODE) { if (node.tagName === 'VIDEO') { if (node.poster) UVP.Extractors.deriveRgUrlsFromMedia(node.poster); const src = node.currentSrc || node.src || ''; if (src && !src.startsWith('blob:')) UVP.Extractors.deriveRgUrlsFromMedia(src); } if (node.querySelectorAll) node.querySelectorAll('video').forEach(v => { if (v.poster) UVP.Extractors.deriveRgUrlsFromMedia(v.poster); const s = v.currentSrc || v.src || ''; if (s && !s.startsWith('blob:')) UVP.Extractors.deriveRgUrlsFromMedia(s); }); UVP.Overlay.updateButtonPosition(); } }); }
        }
      });
      const startObserver = () => { rgObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['poster', 'src', 'data-feed-item-id'] }); document.querySelectorAll('video').forEach(v => { if (v.poster) UVP.Extractors.deriveRgUrlsFromMedia(v.poster); const src = v.currentSrc || v.src || ''; if (src && !src.startsWith('blob:')) UVP.Extractors.deriveRgUrlsFromMedia(src); }); };
      if (document.body) startObserver(); else document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    }
    // A1: deduplicated site observer setup (was ~7 identical blocks)
    UVP.Boot.setupSiteObserver(UVP.Extractors.isXVideos, UVP.Extractors.extractXVideosUrls);
    UVP.Boot.setupSiteObserver(UVP.Extractors.isPHNetwork, UVP.Extractors.extractPHNetworkUrls);
    UVP.Boot.setupSiteObserver(UVP.Extractors.isEporner, UVP.Extractors.extractEpornerUrls);
    UVP.Boot.setupSiteObserver(UVP.Extractors.isPornhub, UVP.Extractors.extractPornhubUrls);

    if (UVP.Extractors.isYouTube()) {
      let ytExtractTimer = null;
      let ytHasFormats = false;
      const ytExtract = () => {
        if (ytExtractTimer) clearTimeout(ytExtractTimer);
        ytExtractTimer = setTimeout(async () => {
          ytExtractTimer = null;
          if (ytHasFormats && ytFmtMap.size > 0 && UVP.Extractors.ytFormatsCurrent()) return; // Formats already current for active video; skip re-extraction
          UVP.Utils.invalidateInlineScriptCache();
          await UVP.Utils.safeAwait(UVP.Extractors.extractYouTubeUrls(), 'extractYouTubeUrls');
          if (ytFmtMap.size > 0) ytHasFormats = true;
        }, CONFIG.ytExtractDebounceMs); // debounce — YouTube mutates constantly
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(ytExtract, CONFIG.siteExtractInitialDelayMs), { once: true });
      else setTimeout(ytExtract, CONFIG.siteExtractInitialDelayMs);
      // Re-extract on SPA nav (URL change = new video)
      let ytLastUrl = location.href;
      const ytObserver = new MutationObserver(() => {
        if (location.href !== ytLastUrl) {
          // De-raced observer synchronization: batches DOM mutations to prevent duplicate InnerTube calls
          // microtask checkpoint, so this branch can run AFTER yt-navigate-
          // finish already processed the NEW video's playerResponse into
          // ytFmtMap. The old unconditional wipe destroyed those fresh
          // formats and forced a full 5-client InnerTube re-walk (worst case
          // 5 x 15s) that could fail entirely — the root cause behind dead
          // buttons, failed captures, and "previous video" symptoms.
          // Freshness gate: keep formats that belong to the CURRENT URL's
          // videoId and were captured recently.
          const keepFormats = UVP.Extractors.ytFormatsCurrent();
          ytLastUrl = location.href;
          if (keepFormats) {
            // Still route through onSpaNav for the overlay close + generic
            // per-video reset (self-dedupes via lastSpaUrl). v4.3.0: nothing
            // to restore — pickYouTubeFormats reads the videoId-keyed
            // ytFmtMap directly, and these formats are current for THIS
            // videoId.
            UVP.Boot.onSpaNav();
            ytHasFormats = true;
          } else {
            ytHasFormats = false; ytFmtMap.clear(); ytDecipheredUrls.clear(); ytPlayerData.isLive = false; ytPlayerData.videoId = null; ytPlayerData.fmtTs = 0;
            // Route through onSpaNav: it closes the overlay and resets all
            // per-video state. The observer alone never closed the overlay —
            // under AdGuard, where the history patches/onurlchange may not
            // reach the page, this observer was the ONLY nav detector, so the
            // overlay kept playing the previous video after a playlist/sidebar
            // selection. Self-dedupes via lastSpaUrl when the other nav hooks
            // already fired.
            UVP.Boot.onSpaNav();
            // Clear stale googlevideo URLs from the previous watch page so they
            // don't bleed into the new page's extraction. onSpaNav also clears
            // capturedUrls, but this MutationObserver fires independently and
            // its subsequent extractYouTubeUrls call could re-capture stale
            // inline ytInitialPlayerResponse data if not cleared here.
            for (const u of [...capturedUrls]) {
              if (/googlevideo\.com/i.test(u)) {
                capturedUrls.delete(u);
                capturedUrlKinds.delete(u);
              }
            }
            UVP.Utils.invalidateUrlCache();
          }
        }
        ytExtract();
      });
      if (document.body) ytObserver.observe(document.body, { childList: true, subtree: true });
      else document.addEventListener('DOMContentLoaded', () => ytObserver.observe(document.body, { childList: true, subtree: true }), { once: true });
      // YouTube's own SPA events: yt-navigate-finish's detail carries the
      // full playerResponse for the navigation — free streaming data with no
      // API round-trip, and it fires even when the page reuses prefetched
      // data and never issues a fresh /youtubei/v1/player request (the
      // capture-without-manual-play gap). Processed through the same
      // staleness-guarded path as the intercepted API responses.
      // Dual registration on window and document to intercept navigation events in capture phase
      // may dispatch these on the page's window — window-targeted events
      // never propagate to document, so a document-only listener was dead
      // code under that dispatch model (no format loading, no tracker sync,
      // no overlay close from this hook). Double invocation when the event
      // DOES reach both targets is harmless: onSpaNav dedupes via
      // lastSpaUrl, processYtStreamingData is idempotent (Map keyed by URL),
      // ensureYtNDeciphered coalesces in-flight work.
      // yt-navigate-start additionally closes the overlay at nav START —
      // the earliest possible moment the user has left the current video.
      const onYtNavStart = () => { try { UVP.Boot.onSpaNav(); } catch (err) { if (DEBUG) console.warn('[UVP] yt-navigate-start handler failed:', err); } };
      const onYtNavFinish = (e) => {
        try {
          UVP.Boot.onSpaNav();
          const pr = e && e.detail && e.detail.response && e.detail.response.playerResponse;
          if (!pr || !pr.streamingData) return;
          const vid = UVP.Extractors.getYtVideoId();
          if (!vid) return;
          if (pr.videoDetails && pr.videoDetails.videoId && pr.videoDetails.videoId !== vid) return;
          UVP.Extractors.processYtStreamingData(pr.streamingData, pr.videoDetails);
          if (pr.assets && pr.assets.js) ytPlayerData.playerJsUrl = pr.assets.js;
          // Ensure player JS reference exists even if navigation response omitted assets.js
          // playerJsUrl gap from DOM sources (inline ytcfg / script tags work
          // in AdGuard's isolated world) so the n-param decipher can run.
          else if (!ytPlayerData.playerJsUrl) UVP.Extractors.ensureYtPlayerJsUrl();
          // Synchronize observer trackers with active route generation
          // this, the MutationObserver (deferred to its microtask checkpoint,
          // so it runs AFTER this handler) saw a stale ytLastUrl and wiped
          // the formats this handler just loaded.
          ytHasFormats = ytFmtMap.size > 0;
          ytLastUrl = location.href;
          UVP.Utils.invalidateUrlCache();
          // Freshness gate: skip InnerTube query if current formats are valid
          // decipher block — decipher the n-param challenge right here.
          if (ytFmtMap.size > 0) UVP.Extractors.ensureYtNDeciphered(ytRouteGeneration);
        } catch (err) { if (DEBUG) console.warn('[UVP] yt-navigate-finish handler failed:', err); }
      };
      window.addEventListener('yt-navigate-start', onYtNavStart, true);
      document.addEventListener('yt-navigate-start', onYtNavStart, true);
      window.addEventListener('yt-navigate-finish', onYtNavFinish, true);
      document.addEventListener('yt-navigate-finish', onYtNavFinish, true);
    }

    UVP.Boot.setupSiteObserver(UVP.Extractors.isSpankBang, UVP.Extractors.extractSpankBangUrls);
    UVP.Boot.setupSiteObserver(UVP.Extractors.isXHamster, UVP.Extractors.extractXHamsterUrls);
    UVP.Boot.setupSiteObserver(UVP.Extractors.isPMVHaven, UVP.Extractors.extractPMVHavenUrls);
    UVP.Boot.setupSiteObserver(UVP.Extractors.isX, UVP.Extractors.extractXUrls);
    // Generic JSON-LD VideoObject extraction for every site (yt-dlp generic
    // extractor pattern) — catches server-rendered stream URLs on sites with
    // no dedicated extractor. Idempotent via the capturedUrls Set.
    setTimeout(() => UVP.Utils.safeCall(UVP.Extractors.extractJsonLdVideoUrls, 'extractJsonLdVideoUrls'), CONFIG.siteExtractInitialDelayMs);

    console.log('%c[UVP] Native Overlay Universal Player ready.', 'color:#19c3ff;font-weight:bold');
  }
 
  // Harness hook for pipeline verification and behavioral test suite
  // loads this script inside a vm sandbox with window.name='uvp-test' and
  // drives the REAL module registry against synthetic playerResponses, MPD
  // fixtures and dash.js mocks. Never exposed on normal page loads — a page that
  // sets its own window.name to 'uvp-test' gains nothing it couldn't already
  // do by dispatching the same DOM events.
  try {
    if (typeof window !== 'undefined' && window.name === 'uvp-test') {
      window.__UVP__ = UVP;
      // Playback session harness hook for driving DASH and HLS state machines
      // branch and the decode step-down against a mock dash.js player,
      // which requires steering the module-private session state. Same
      // gate as __UVP__: never exposed on normal page loads.
      window.__UVP_STATE__ = state;
    }
  } catch (e) {}

  // Boot is failure-isolated: an exception during boot (e.g. a userscript
  // manager with a broken/throwing GM shim) must never leave the script dead.
  const _safeBoot = () => { try { UVP.Boot.boot(); } catch (e) { console.error('[UVP] boot failed:', e); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _safeBoot, { once: true });
  else _safeBoot();
})();

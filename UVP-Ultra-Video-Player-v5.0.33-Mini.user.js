  const UVP = {}; const state = {}; let DEBUG = false; // DEBUG now OFF by default
  const CONFIG = {}; const ytPlayerData = {}; const ytRouteGeneration = 0; const ytFmtMap = new Map();
  const ytDecipheredUrls = new Set(); const capturedUrls = new Set();
  const _videoCache = { list: null, at: 0 }; let _urlCache = null; let _inlineScripts = null;
  const lastFragmentFetch = {}; const _hostSlots = new Map(); let _pendingDbClear = null;
  const STORE = 'chunks'; const DB_NAME = 'uvp-dl'; const ACTIVE_JOB_PREFIX = 'uvp-job:';
  const ytGateLog = []; let dbPromise = null; const PREFETCH = 3;

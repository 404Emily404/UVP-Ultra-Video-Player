# UVP Ultra Video Player v5.0.1

**Universal Native Overlay Player • Stream Grabber • In-Browser Remuxing Engine**

UVP replaces bloated, ad-heavy web players with a clean, hardware-accelerated native overlay.  
It automatically detects video streams across the web and gives you a fast, isolated HTML5 player with full HLS/DASH support and zero-loss local downloading.

---

## Features

### Playback
- **Native Overlay Player** – Lightweight, isolated HTML5 player with standard browser controls
- **Modern viewing modes** – True Picture-in-Picture, browser fullscreen, and automatic floating mini-player
- **Full HD & 4K DASH** – Plays separate high-resolution video + audio tracks (1080p / 1440p / 4K) via client-generated MPDs and dash.js
- **Anti-throttling** – Built-in n-signature deciphering (YouTube) to avoid bandwidth throttling
- **Smart recovery** – Automatic stall detection, progressive recovery, and cold-start protection for large segments

### Downloading & Remuxing
- **Zero-loss in-browser remuxing** – Merges separate video (VP9/AV1/H.264) and audio (Opus/AAC) streams into single `.mp4` / `.webm` files in pure JavaScript
- **Direct-to-disk streaming** – Uses the File System Access API so large downloads go straight to disk instead of filling RAM
- **Resilient HLS downloader** – Concurrent segment fetching, token refresh, exponential backoff, and IndexedDB resume after page reload
- **One-click audio extraction** – Download standalone `.m4a` or `.opus` tracks from the userscript menu

### Detection Engine
- Network request interception (fetch + XHR)
- JSON-LD / structured data scanning
- Generic DOM + inline script extraction
- Specialized extractors for sites that require them (YouTube, X/Twitter, and others that use non-standard players or signed URLs)

---

## Supported Formats
- HLS (`.m3u8`)
- DASH (`.mpd`)
- Direct media (`.mp4`, `.webm`, `.m4v`)

Works on the majority of non-DRM video sites.  
Specialized logic is included only where generic detection is insufficient.

---

## Installation

1. Install a userscript manager:
   - [Tampermonkey](https://www.tampermonkey.net/) (recommended)
   - [Violentmonkey](https://violentmonkey.github.io/)
   - [AdGuard](https://adguard.com/en/download.html) (recommended for Android)
   - Greasemonkey 4

2. Install the script from one of these sources:
   - [Greasy Fork](https://greasyfork.org/en/scripts/591828-uvp-ultra-video-player-v5-0-1)
   - Direct install from this repository:  
     [`UVP.user.js`](./UVP.user.js)

---

## Menu Options

Open your userscript manager menu while on a page to access:

| Option | Description |
|--------|-------------|
| **Playback Quality** | Auto (ABR) ↔ Max (1080p/4K) |
| **Download Format** | 720p HD (muxed) ↔ Max 1080p/4K (auto-mux) ↔ Lowest 360p |
| **Download Audio Only** | Extract standalone audio track |
| **Re-scan Page** | Force a fresh extraction (useful on SPAs) |
| **Debug Logging** | Toggle detailed console logging |

---

## Compatibility

**Browsers**  
Chrome • Brave • Firefox • Edge • Safari • Opera • Vivaldi

**Userscript Managers**  
Tampermonkey • Violentmonkey • AdGuard (Desktop & Android) • Greasemonkey 4

**Platforms**  
Windows • macOS • Linux • Android • iOS

---

## Security & Architecture

- **CSP & Trusted Types compliant** – Works on sites that enforce `require-trusted-types-for 'script'`
- **Shadow DOM isolation** – Overlay runs in a closed shadow root so host page scripts cannot easily pause, mute, or hijack the player
- **SSRF protection** – Rejects private/loopback IPs and cloud metadata endpoints
- **No external tracking** – Fully client-side

---

## License

[PolyForm Strict License 1.0.0](./LICENSE)

---

## Support the Project

If UVP saves you time or frustration, you can support continued development:

**[☕ Buy Me a Coffee](https://buymeacoffee.com/dragon.magic)**

---

**Author:** Dragon.Magic (404Emily404)  
**Version:** 5.0.1

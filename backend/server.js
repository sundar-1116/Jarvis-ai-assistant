const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const os = require('os');
const WebSocket = require('ws');
const crypto = require('crypto');
const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const execAsync = util.promisify(exec);

const app = express();
const port = 5001;

app.use(cors());
app.use(express.json());

// Setup file upload handling for audio streams
const upload = multer({ dest: 'uploads/' });

require('dotenv').config();
const GROQ_API_KEY = process.env.GROQ_API_KEY || "YOUR_GROQ_API_KEY";

// Health Check Endpoint for HUD Status Panel
app.get('/api/status', (req, res) => {
  res.json({ status: "online", version: "v5_fixed" });
});

// -------------------------------------------------------------
// ULTRA-REALISTIC EDGE TTS GENERATOR (Python CLI Wrapper)
// -------------------------------------------------------------
async function generateEdgeTTS(text, voice = "en-GB-RyanNeural") {
  const safeText = text.replace(/"/g, '\\"').replace(/\$/g, '\\$');
  const tempFile = path.join(__dirname, `temp_${Date.now()}_${Math.floor(Math.random()*1000)}.mp3`);
  
  try {
    await execAsync(`edge-tts --voice "${voice}" --rate="+60%" --text "${safeText}" --write-media "${tempFile}"`);
  } catch (err1) {
    try {
      await execAsync(`python3 -m edge_tts --voice "${voice}" --rate="+60%" --text "${safeText}" --write-media "${tempFile}"`);
    } catch (err2) {
      throw new Error("Edge TTS CLI not installed on system.");
    }
  }

  if (fs.existsSync(tempFile)) {
    const audioBuffer = fs.readFileSync(tempFile);
    fs.unlinkSync(tempFile);
    return audioBuffer;
  } else {
    throw new Error("Audio file not generated");
  }
}

// Helper to use Google TTS as a bulletproof fallback
const googleTTS = require('google-tts-api');
async function generateFallbackTTS(text) {
  const urls = googleTTS.getAllAudioUrls(text, {
    lang: 'en-GB',
    slow: false,
    host: 'https://translate.google.com',
    splitPunct: ',.?'
  });
  const audioRes = await axios.get(urls[0].url, { responseType: 'arraybuffer' });
  return Buffer.from(audioRes.data);
}

// Local Speech Cache to eliminate generation delay for repeat sentences
const ttsCacheDir = path.join(__dirname, 'tts_cache');
if (!fs.existsSync(ttsCacheDir)) {
  fs.mkdirSync(ttsCacheDir);
}

async function getCachedTTS(text, voice = "en-GB-RyanNeural") {
  if (!text || text.trim() === '') {
    return Buffer.alloc(0);
  }
  const hash = crypto.createHash('md5').update(`${text}_${voice}`).digest('hex');
  const cacheFile = path.join(ttsCacheDir, `${hash}.mp3`);
  
  if (fs.existsSync(cacheFile)) {
    console.log(`[TTS CACHE HIT] for text: "${text}"`);
    return fs.readFileSync(cacheFile);
  }
  
  console.log(`[TTS CACHE MISS] Generating for text: "${text}"`);
  let audioBuffer;
  try {
    audioBuffer = await generateEdgeTTS(text, voice);
  } catch (err) {
    console.warn(`[WARNING] Edge TTS failed for "${text}". Trying Google fallback...`);
    try {
      audioBuffer = await generateFallbackTTS(text);
    } catch (fallbackErr) {
      console.error(`[ERROR] Google TTS fallback failed:`, fallbackErr.message);
      audioBuffer = Buffer.alloc(0);
    }
  }
  
  if (audioBuffer && audioBuffer.length > 0) {
    try {
      fs.writeFileSync(cacheFile, audioBuffer);
    } catch (writeErr) {
      console.error("[ERROR] Failed to write cache file:", writeErr.message);
    }
  }
  return audioBuffer;
}

// Nuclear-grade cleanup: strips ALL possible function/tool leak formats from LLM text
function cleanLLMText(text) {
  if (!text) return "";
  let cleaned = text;

  // Format 1: <function=name>{...}</function>
  cleaned = cleaned.replace(/<function=[^>]+>[\s\S]*?<\/function>/gi, '');
  // Format 2: <FUNCTION(name)>...</FUNCTION> or <FUNCTION(name)</FUNCTION>
  cleaned = cleaned.replace(/<FUNCTION\([^)]*\)>[\s\S]*?<\/FUNCTION>/gi, '');
  cleaned = cleaned.replace(/<FUNCTION\([^)]*\)[\s\S]*?<\/FUNCTION>/gi, '');
  cleaned = cleaned.replace(/<\/?FUNCTION[^>]*>/gi, '');
  // Format 3: [function_call: name] or [tool_call: name]
  cleaned = cleaned.replace(/\[(function|tool)_call[^\]]*\]/gi, '');
  // Format 4: raw JSON objects that look like tool arguments
  cleaned = cleaned.replace(/\{\s*"(urls|appNames|websiteNames|count)[^}]*\}/g, '');
  // Format 5: any remaining XML-style tags
  cleaned = cleaned.replace(/<[a-zA-Z_]+[^>]*>[\s\S]*?<\/[a-zA-Z_]+>/g, '');
  // Format 6: leftover lone angle-bracket tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // Clean up extra whitespace/newlines left behind
  cleaned = cleaned.replace(/\n{3,}/g, '\n').replace(/^\s+|\s+$/g, '');
  return cleaned;
}

// Helper to build properly formatted URL
function formatUrl(url) {
  // If it already has a protocol, keep it
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Search URLs and paths that contain slashes should use https
  return `https://${url}`;
}

// -------------------------------------------------------------
// MAC SYSTEM CONTROL TOOLS FOR GROQ LLM
// -------------------------------------------------------------
const GROQ_TOOLS = [
  {
    type: "function",
    function: {
      name: "open_website",
      description: "Opens one or more specific websites or URLs in Google Chrome. Use this for any request to open, visit, browse, search, or play something online. Build search query URLs for music/video requests (e.g. youtube.com/results?search_query=telugu+music).",
      parameters: {
        type: "object",
        properties: {
          urls: { 
            type: "array", 
            items: { type: "string" },
            description: "Full URLs to open, e.g. ['youtube.com/results?search_query=telugu+music', 'instagram.com']" 
          }
        },
        required: ["urls"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "open_application",
      description: "Opens one or more Mac applications by their exact name.",
      parameters: {
        type: "object",
        properties: {
          appNames: { 
            type: "array", 
            items: { type: "string" },
            description: "Exact app names to open, e.g. ['Spotify', 'CapCut', 'Google Chrome']" 
          }
        },
        required: ["appNames"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "close_application",
      description: "Quits/closes one or more Mac applications completely.",
      parameters: {
        type: "object",
        properties: {
          appNames: { 
            type: "array", 
            items: { type: "string" },
            description: "Exact app names to quit, e.g. ['Spotify', 'CapCut']" 
          }
        },
        required: ["appNames"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "close_specific_website",
      description: "Closes all browser tabs matching one or more website names or domains in Google Chrome.",
      parameters: {
        type: "object",
        properties: {
          websiteNames: { 
            type: "array", 
            items: { type: "string" },
            description: "Website names or domains to close, e.g. ['youtube', 'instagram.com']" 
          }
        },
        required: ["websiteNames"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "close_chrome_tabs",
      description: "Closes a specific number of the most recently active tabs in Google Chrome.",
      parameters: {
        type: "object",
        properties: {
          count: { type: "integer", description: "Number of tabs to close. Default 1." }
        },
        required: ["count"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "count_desktop_folders",
      description: "Counts and reports the number of folders on the user's Desktop.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  }
];

// -------------------------------------------------------------
// APPLESCRIPT HELPERS
// -------------------------------------------------------------

// Open a URL in Google Chrome (or system default as fallback)
async function openUrlInChrome(url) {
  const formattedUrl = formatUrl(url);
  try {
    await execAsync(`open -a "Google Chrome" "${formattedUrl}"`);
  } catch (e) {
    await execAsync(`open "${formattedUrl}"`);
  }
}

// Close tabs in Chrome matching a domain/keyword
function buildCloseTabScript(site) {
  return [
    `osascript`,
    `-e 'try'`,
    `-e '  if application "Google Chrome" is running then'`,
    `-e '    tell application "Google Chrome"'`,
    `-e '      repeat with w in windows'`,
    `-e '        set i to 1'`,
    `-e '        repeat while i ≤ (count tabs of w)'`,
    `-e '          if URL of tab i of w contains "${site}" then'`,
    `-e '            close tab i of w'`,
    `-e '          else'`,
    `-e '            set i to i + 1'`,
    `-e '          end if'`,
    `-e '        end repeat'`,
    `-e '      end repeat'`,
    `-e '    end tell'`,
    `-e '  end if'`,
    `-e 'end try'`,
    `-e 'try'`,
    `-e '  if application "Safari" is running then'`,
    `-e '    tell application "Safari"'`,
    `-e '      repeat with w in windows'`,
    `-e '        set i to 1'`,
    `-e '        repeat while i ≤ (count tabs of w)'`,
    `-e '          if URL of tab i of w contains "${site}" then'`,
    `-e '            close tab i of w'`,
    `-e '          else'`,
    `-e '            set i to i + 1'`,
    `-e '          end if'`,
    `-e '        end repeat'`,
    `-e '      end repeat'`,
    `-e '    end tell'`,
    `-e '  end if'`,
    `-e 'end try'`
  ].join(' ');
}

// Close N most-recent tabs in Chrome or Safari
function buildCloseNTabsScript(count) {
  return [
    `osascript`,
    `-e 'try'`,
    `-e '  if application "Google Chrome" is running then'`,
    `-e '    tell application "Google Chrome"'`,
    `-e '      repeat ${count} times'`,
    `-e '        if (count of windows) > 0 then'`,
    `-e '          if (count of tabs of front window) > 0 then close active tab of front window'`,
    `-e '        end if'`,
    `-e '      end repeat'`,
    `-e '    end tell'`,
    `-e '  end if'`,
    `-e 'end try'`,
    `-e 'try'`,
    `-e '  if application "Safari" is running then'`,
    `-e '    tell application "Safari"'`,
    `-e '      repeat ${count} times'`,
    `-e '        if (count of windows) > 0 then'`,
    `-e '          if (count of tabs of front window) > 0 then close current tab of front window'`,
    `-e '        end if'`,
    `-e '      end repeat'`,
    `-e '    end tell'`,
    `-e '  end if'`,
    `-e 'end try'`
  ].join(' ');
}

// ─── Gender-aware honorific helper ───────────────────────────
function getHonorific(gender) {
  const g = (gender || 'male').toLowerCase();
  if (g === 'female') return "ma'am";
  if (g === 'other' || g === 'others') return 'them';
  return 'sir';
}

// ─── Natural language response generator ─────────────────────
function naturalResponse(functionName, args, gender) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const hon = getHonorific(gender);

  if (functionName === "open_website" || functionName === "open_application") {
    const urls = args.urls || [];
    const apps = args.appNames || [];
    const names = [
      ...urls.map(u => u.replace(/https?:\/\/(www\.)?/, '').split('/')[0].split('?')[0]),
      ...apps
    ];
    if (names.length === 0) return `Right away, ${hon}.`;
    if (names.length === 1) {
      return pick([
        `Opening ${names[0]} for you, ${hon}.`,
        `On it. Bringing up ${names[0]} now.`,
        `${names[0]} is loading, ${hon}.`
      ]);
    }
    return pick([
      `Opening ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} simultaneously, ${hon}.`,
      `All ${names.length} items are loading now.`,
      `Right away. Launching ${names.join(', ')}.`
    ]);
  }

  if (functionName === "close_application" || functionName === "close_specific_website") {
    const apps = args.appNames || [];
    const sites = args.websiteNames || [];
    const names = [
      ...sites.map(s => s.charAt(0).toUpperCase() + s.slice(1)),
      ...apps
    ];
    if (names.length === 0) return `Done, ${hon}.`;
    if (names.length === 1) {
      return pick([
        `${names[0]} has been closed, ${hon}.`,
        `Closing ${names[0]} now.`,
        `Done — ${names[0]} is closed.`
      ]);
    }
    return pick([
      `Closed all tabs and windows for ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}, ${hon}.`,
      `All requested items have been closed.`
    ]);
  }

  if (functionName === "close_chrome_tabs") {
    const count = args.count || 1;
    return pick([
      `Closed ${count} tab${count > 1 ? 's' : ''} for you, ${hon}.`,
      `Done. ${count} tab${count > 1 ? 's have' : ' has'} been closed.`
    ]);
  }

  if (functionName === "count_desktop_folders") {
    return null; // Will be filled in after we get the count
  }

  return null;
}

// -------------------------------------------------------------
// EXECUTE TOOL CALL (server-side Mac actions)
// -------------------------------------------------------------
async function executeToolCall(functionName, args, gender) {
  const hon = getHonorific(gender);

  if (functionName === "open_website") {
    const urls = args.urls || [];
    for (const url of urls) {
      await openUrlInChrome(url);
    }
    const apps = args.appNames || [];
    for (const app of apps) {
      await execAsync(`open -a "${app}"`).catch(async () => {
        await execAsync(`open "${app}"`).catch(() => {});
      });
    }
    return naturalResponse(functionName, args, gender);
  }

  if (functionName === "open_application") {
    const apps = args.appNames || [];
    for (const app of apps) {
      await execAsync(`open -a "${app}"`).catch(async () => {
        await execAsync(`open "${app}"`).catch(() => {});
      });
    }
    const urls = args.urls || [];
    for (const url of urls) {
      await openUrlInChrome(url);
    }
    return naturalResponse(functionName, args, gender);
  }

  if (functionName === "close_application") {
    const apps = args.appNames || [];
    for (const app of apps) {
      await execAsync(`osascript -e 'tell application "${app}" to quit'`).catch(() => {});
    }
    const sites = args.websiteNames || [];
    for (const site of sites) {
      const script = buildCloseTabScript(site);
      await execAsync(script).catch(() => {});
    }
    return naturalResponse(functionName, args, gender);
  }

  if (functionName === "close_specific_website") {
    const sites = args.websiteNames || [];
    for (const site of sites) {
      const script = buildCloseTabScript(site);
      await execAsync(script).catch(() => {});
    }
    const apps = args.appNames || [];
    for (const app of apps) {
      await execAsync(`osascript -e 'tell application "${app}" to quit'`).catch(() => {});
    }
    return naturalResponse(functionName, args, gender);
  }

  if (functionName === "close_chrome_tabs") {
    const count = args.count || 1;
    const script = buildCloseNTabsScript(count);
    await execAsync(script).catch(() => {});
    return naturalResponse(functionName, args, gender);
  }

  if (functionName === "count_desktop_folders") {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const { stdout } = await execAsync(`ls -l "${desktopPath}" | grep "^d" | wc -l`);
    const count = stdout.trim();
    return `I'm reading ${count} folder${count !== '1' ? 's' : ''} on your Desktop, ${hon}.`;
  }

  return null;
}
// Clean wake words, filler words, and politeness markers from anywhere in the text
function cleanFillers(text) {
  let cleaned = text.toLowerCase().trim();
  // Remove wake words / conversational phrases
  const fillers = [
    /\bhey jarvis\b/g,
    /\bokay jarvis\b/g,
    /\bok jarvis\b/g,
    /\bjarvis\b/g,
    /\bcan you please\b/g,
    /\bcould you please\b/g,
    /\bwould you please\b/g,
    /\bdo you mind\b/g,
    /\bcan you\b/g,
    /\bcould you\b/g,
    /\bwould you\b/g,
    /\bwill you\b/g,
    /\bplease\b/g,
    /\bjust\b/g,
    /\bhey\b/g,
    /\bhi\b/g,
    /\bok\b/g,
    /\bokay\b/g,
    /\bme\b/g,
    /\bfor me\b/g
  ];
  for (const regex of fillers) {
    cleaned = cleaned.replace(regex, "");
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

// Global lists populated by the app scanner
let appsList = [];
let appNameMapping = {};

// macOS Dynamic application discovery
function loadInstalledApps() {
  const searchDirs = [
    '/Applications',
    '/Applications/Utilities',
    '/System/Applications',
    '/System/Applications/Utilities',
    path.join(os.homedir(), 'Applications')
  ];
  
  const tempAppsList = [];
  const tempAppNameMapping = {};
  
  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.endsWith('.app')) {
            const appName = file.slice(0, -4); // Remove .app
            const lowerName = appName.toLowerCase();
            
            // Base matching
            tempAppsList.push(lowerName);
            tempAppNameMapping[lowerName] = appName;
            
            // stripped space variations (e.g. VSCode -> vs code / vscode)
            const stripped = lowerName.replace(/\s+/g, "");
            if (stripped !== lowerName) {
              tempAppsList.push(stripped);
              tempAppNameMapping[stripped] = appName;
            }

            // Custom aliases
            if (lowerName === "visual studio code") {
              tempAppsList.push("vs code");
              tempAppNameMapping["vs code"] = "Visual Studio Code";
              tempAppsList.push("vscode");
              tempAppNameMapping["vscode"] = "Visual Studio Code";
            }
            if (lowerName === "google chrome") {
              tempAppsList.push("chrome");
              tempAppNameMapping["chrome"] = "Google Chrome";
            }
          }
        }
      } catch (err) {
        console.error(`[APP SCANNER] Error reading ${dir}:`, err.message);
      }
    }
  }
  
  appsList = [...new Set(tempAppsList)];
  appNameMapping = tempAppNameMapping;
  console.log(`[APP SCANNER] Loaded ${appsList.length} application aliases dynamically.`);
}

// Initialize on backend start
loadInstalledApps();

// -------------------------------------------------------------
// FAST-PATH HYBRID NLU PARSER (Zero-Latency Local Execution)
// -------------------------------------------------------------
function matchFastPathCommand(text) {
  // Normalize variations of youtube
  let cleaned = text.toLowerCase().trim();
  cleaned = cleaned.replace(/\byou\s*tube\b/g, "youtube");
  cleaned = cleaned.replace(/\byou\s*tuve\b/g, "youtube");
  cleaned = cleaned.replace(/\butube\b/g, "youtube");

  cleaned = cleanFillers(cleaned);
  if (!cleaned) return null;

  // Common websites mapping (excluding spotify to avoid overlap)
  const webMap = {
    "youtube": "youtube.com",
    "google": "google.com",
    "github": "github.com",
    "reddit": "reddit.com",
    "netflix": "netflix.com",
    "gmail": "mail.google.com",
    "chatgpt": "chatgpt.com",
    "claude": "claude.ai",
    "facebook": "facebook.com",
    "instagram": "instagram.com",
    "twitter": "twitter.com",
    "wikipedia": "wikipedia.org",
    "amazon": "amazon.com",
    "whatsapp": "web.whatsapp.com",
    "linkedin": "linkedin.com",
    "figma": "figma.com",
    "stackoverflow": "stackoverflow.com",
    "stack overflow": "stackoverflow.com"
  };

  const openVerbs = ["open", "launch", "start", "visit", "go to", "go", "run", "bring up", "show"];
  const closeVerbs = ["close", "quit", "exit", "terminate", "shut down", "kill", "stop"];

  // 1. YouTube searches/plays (highest priority)
  let ytQuery = null;
  let isPlayCommand = false;

  if (cleaned.includes("youtube")) {
    const match1 = cleaned.match(/(?:play|search for|search)\s+(.+?)\s+on\s+youtube/);
    if (match1) {
      ytQuery = match1[1];
      if (cleaned.includes("play")) isPlayCommand = true;
    }
    
    const match2 = cleaned.match(/search\s+youtube\s+for\s+(.+)/);
    if (match2) ytQuery = match2[1];
    
    const match3 = cleaned.match(/youtube\s+search\s+(.+)/);
    if (match3) ytQuery = match3[1];
    
    const match4 = cleaned.match(/play\s+(.+)/);
    if (match4 && !ytQuery) {
      ytQuery = match4[1];
      isPlayCommand = true;
    }
  } else if (cleaned.startsWith("play ")) {
    const query = cleaned.replace(/^play\s+/, "").trim();
    if (query && !query.includes("spotify")) {
      ytQuery = query;
      isPlayCommand = true;
    }
  }

  if (ytQuery) {
    if (isPlayCommand) {
      return {
        tool: "open_website",
        args: { urls: [`duckduckgo.com/?q=%21ducky+site%3Ayoutube.com+${encodeURIComponent(ytQuery.trim())}`] }
      };
    } else {
      return {
        tool: "open_website",
        args: { urls: [`youtube.com/results?search_query=${encodeURIComponent(ytQuery.trim())}`] }
      };
    }
  }

  // 2. Google searches
  let googleQuery = null;
  if (cleaned.includes("google") && !cleaned.includes("chrome") && !cleaned.startsWith("open google") && !cleaned.startsWith("go to google")) {
    const match1 = cleaned.match(/(?:search for|search)\s+(.+?)\s+on\s+google/);
    if (match1) googleQuery = match1[1];
    
    const match2 = cleaned.match(/search\s+google\s+for\s+(.+)/);
    if (match2) googleQuery = match2[1];
    
    const match3 = cleaned.match(/google\s+search\s+(.+)/);
    if (match3) googleQuery = match3[1];
    
    const match4 = cleaned.match(/^google\s+(.+)/);
    if (match4 && !googleQuery) googleQuery = match4[1];
  }

  if (googleQuery) {
    return {
      tool: "open_website",
      args: { urls: [`google.com/search?q=${encodeURIComponent(googleQuery.trim())}`] }
    };
  }

  // 3. Count folders
  if (/\bcount\b.*\bfolders?\b/i.test(cleaned) || /\bhow many\b.*\bfolders?\b/i.test(cleaned)) {
    return {
      tool: "count_desktop_folders",
      args: {}
    };
  }

  const hasOpenVerb = openVerbs.some(verb => new RegExp(`\\b${verb}\\b`, 'i').test(cleaned));
  const hasCloseVerb = closeVerbs.some(verb => new RegExp(`\\b${verb}\\b`, 'i').test(cleaned));

  // Extract all matching websites & apps from lists
  let tempCleanedWeb = cleaned;
  const matchedWebsites = [];
  const sortedWebs = Object.keys(webMap).sort((a, b) => b.length - a.length);
  for (const ws of sortedWebs) {
    const regex = new RegExp(`\\b${ws}\\b`, 'i');
    if (regex.test(tempCleanedWeb)) {
      matchedWebsites.push(webMap[ws]);
      tempCleanedWeb = tempCleanedWeb.replace(regex, "");
    }
  }
  const uniqueWebs = [...new Set(matchedWebsites)];

  let tempCleanedApp = cleaned;
  const matchedApps = [];
  const sortedApps = [...appsList].sort((a, b) => b.length - a.length);
  for (const app of sortedApps) {
    const regex = new RegExp(`\\b${app}\\b`, 'i');
    if (regex.test(tempCleanedApp)) {
      matchedApps.push(appNameMapping[app]);
      tempCleanedApp = tempCleanedApp.replace(regex, "");
    }
  }
  const uniqueApps = [...new Set(matchedApps)];

  // 4. Close actions
  if (hasCloseVerb) {
    if (uniqueWebs.length > 0 && uniqueApps.length > 0) {
      const sitesToClose = uniqueWebs.map(url => url.replace(/https?:\/\/(www\.)?/, '').split('.')[0]);
      return {
        tool: "close_specific_website",
        args: { websiteNames: sitesToClose, appNames: uniqueApps }
      };
    }

    if (uniqueWebs.length > 0) {
      const sitesToClose = uniqueWebs.map(url => url.replace(/https?:\/\/(www\.)?/, '').split('.')[0]);
      return {
        tool: "close_specific_website",
        args: { websiteNames: sitesToClose }
      };
    }

    if (uniqueApps.length > 0) {
      return {
        tool: "close_application",
        args: { appNames: uniqueApps }
      };
    }

    if (cleaned.includes("tab") || cleaned.includes("tabs")) {
      const numMatch = cleaned.match(/\d+/);
      const count = numMatch ? parseInt(numMatch[0]) : 1;
      return {
        tool: "close_chrome_tabs",
        args: { count }
      };
    }

    for (const verb of closeVerbs) {
      const match = cleaned.match(new RegExp(`\\b${verb}\\s+([^\\s]+)`, 'i'));
      if (match) {
        return {
          tool: "close_specific_website",
          args: { websiteNames: [match[1]] }
        };
      }
    }
  }

  // 5. Open actions
  if (hasOpenVerb) {
    if (uniqueWebs.length > 0 && uniqueApps.length > 0) {
      return {
        tool: "open_website",
        args: { urls: uniqueWebs, appNames: uniqueApps }
      };
    }
    if (uniqueWebs.length > 0) {
      return {
        tool: "open_website",
        args: { urls: uniqueWebs }
      };
    }
    if (uniqueApps.length > 0) {
      return {
        tool: "open_application",
        args: { appNames: uniqueApps }
      };
    }

    for (const verb of openVerbs) {
      const match = cleaned.match(new RegExp(`\\b${verb}\\s+([^\\s]+)`, 'i'));
      if (match) {
        const target = match[1];
        const url = target.includes('.') ? target : `${target}.com`;
        return {
          tool: "open_website",
          args: { urls: [url] }
        };
      }
    }
  }

  // 6. Direct website or app name (e.g. "youtube", "spotify")
  const sortedAppsDirect = [...appsList].sort((a, b) => b.length - a.length);
  const directAppMatch = sortedAppsDirect.find(app => cleaned === app);
  if (directAppMatch) {
    const exactName = appNameMapping[directAppMatch];
    return {
      tool: "open_application",
      args: { appNames: [exactName] }
    };
  }

  const directWebMatch = sortedWebs.find(ws => cleaned === ws || cleaned === `${ws} com` || cleaned === `www ${ws} com`);
  if (directWebMatch) {
    return {
      tool: "open_website",
      args: { urls: [webMap[directWebMatch]] }
    };
  }

  return null;
}

// -------------------------------------------------------------
// COMPOUND COMMAND PARSER — handles "open X and Y and close Z"
// Splits mixed open/close commands into segments and processes each
// -------------------------------------------------------------
function matchAllFastPathCommands(text) {
  // Normalize
  let cleaned = text.toLowerCase().trim();
  cleaned = cleaned.replace(/\byou\s*tube\b/g, "youtube");
  cleaned = cleaned.replace(/\byou\s*tuve\b/g, "youtube");
  cleaned = cleaned.replace(/\butube\b/g, "youtube");
  cleaned = cleanFillers(cleaned);
  if (!cleaned) return null;

  const openVerbs  = ["open", "launch", "start", "visit", "go to", "run", "bring up", "show", "play"];
  const closeVerbs = ["close", "quit", "exit", "terminate", "shut down", "kill", "stop"];

  const hasOpen  = openVerbs.some(v => new RegExp(`\\b${v}\\b`, 'i').test(cleaned));
  const hasClose = closeVerbs.some(v => new RegExp(`\\b${v}\\b`, 'i').test(cleaned));

  // If BOTH open and close intents detected → split at verb boundaries
  if (hasOpen && hasClose) {
    const allVerbDefs = [
      ...openVerbs.map(v => ({ verb: v, type: 'open' })),
      ...closeVerbs.map(v => ({ verb: v, type: 'close' }))
    ];

    // Find all verb positions in the cleaned text
    const positions = [];
    for (const def of allVerbDefs) {
      const escaped = def.verb.replace(/\s+/g, '\\s+');
      const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
      let m;
      while ((m = pattern.exec(cleaned)) !== null) {
        positions.push({ idx: m.index, type: def.type, len: m[0].length });
      }
    }
    positions.sort((a, b) => a.idx - b.idx);

    if (positions.length >= 2) {
      // Split into segments: each segment starts at a verb
      const segments = [];
      for (let i = 0; i < positions.length; i++) {
        const start = positions[i].idx;
        const end = (i + 1 < positions.length) ? positions[i + 1].idx : cleaned.length;
        let seg = cleaned.substring(start, end).trim();
        // Strip trailing connectors like "and", "also", "then", commas
        seg = seg.replace(/\s+(and|also|then)\s*$/i, '').trim();
        seg = seg.replace(/,\s*$/, '').trim();
        if (seg) segments.push(seg);
      }

      // De-duplicate overlapping segments (if two verbs hit the same position)
      const uniqueSegments = [...new Set(segments)];

      const results = [];
      for (const seg of uniqueSegments) {
        const r = matchFastPathCommand(seg);
        if (r) {
          // Avoid duplicate tool calls with identical args
          const isDupe = results.some(existing =>
            existing.tool === r.tool && JSON.stringify(existing.args) === JSON.stringify(r.args)
          );
          if (!isDupe) results.push(r);
        }
      }
      if (results.length > 0) {
        console.log(`[COMPOUND NLU] Split into ${results.length} actions from ${uniqueSegments.length} segments`);
        return results;
      }
    }
  }

  // Single-action or couldn't split → standard parser
  const result = matchFastPathCommand(text);
  return result ? [result] : null;
}

// Helper to personalize response based on gender
function formatResponseForGender(text, gender) {
  if (!text) return text;
  const g = (gender || 'male').toLowerCase();
  
  if (g === 'female') {
    return text.replace(/\bsir\b/gi, (match) => {
      return match === 'Sir' ? 'Ma\'am' : 'ma\'am';
    });
  } else if (g === 'other' || g === 'others') {
    // Replace "sir" with "them"
    let formatted = text.replace(/\bsir\b/gi, (match) => {
      return match === 'Sir' ? 'Them' : 'them';
    });
    // Replace time-based greetings: "Good morning/afternoon/evening" with "System active"
    formatted = formatted.replace(/\b(good\s+morning|good\s+afternoon|good\s+evening)\b/gi, "System active");
    return formatted;
  }
  
  return text;
}

// -------------------------------------------------------------
// TEXT PROCESSING ENDPOINT
// -------------------------------------------------------------
app.post('/api/process-text', async (req, res) => {
  try {
    const userText = req.body.text;
    const isLocal = req.body.isLocal !== false; // default true if not specified
    const gender = req.body.gender || 'male';
    if (!userText) {
      return res.status(400).json({ error: "No text received by backend." });
    }

    console.log(`\n[USER]: ${userText}`);

    // Fast-path command routing (compound + single commands)
    const fastPaths = matchAllFastPathCommands(userText);
    if (fastPaths && fastPaths.length > 0) {
      console.log(`[FAST PATH] ${fastPaths.length} action(s) matched`);
      for (const fp of fastPaths) {
        console.log(`  → ${fp.tool}`, JSON.stringify(fp.args));
      }
      const hon = getHonorific(gender);
      const responseTexts = [];
      
      try {
        // Execute ALL actions concurrently for speed
        const execPromises = fastPaths.map(async (fp) => {
          if (isLocal) {
            return await executeToolCall(fp.tool, fp.args, gender);
          } else {
            return naturalResponse(fp.tool, fp.args, gender);
          }
        });
        const results = await Promise.all(execPromises);
        for (const r of results) {
          if (r) responseTexts.push(r);
        }
      } catch (err) {
        console.error("Fast Path Execution Failed:", err.message);
        responseTexts.push(`Something went wrong on my end, ${hon}.`);
      }
      
      let jarvisText = responseTexts.join(' ') || `Right away, ${hon}.`;
      jarvisText = cleanLLMText(jarvisText);
      jarvisText = formatResponseForGender(jarvisText, gender);

      console.log(`[J.A.R.V.I.S. (FAST PATH)]: ${jarvisText}`);

      const audioBuffer = await getCachedTTS(jarvisText, "en-GB-RyanNeural");
      const audioBase64 = audioBuffer.toString('base64');

      return res.json({
        jarvisText,
        audioBase64: `data:audio/mp3;base64,${audioBase64}`,
        toolCall: fastPaths[0],
        toolCalls: fastPaths
      });
    }

    console.log("[J.A.R.V.I.S.] Querying Neural Net...");

    let pronounPrompt = 'Address the user as "sir" occasionally.';
    if (gender === 'female') {
      pronounPrompt = 'Address the user as "ma\'am" occasionally.';
    } else if (gender === 'other' || gender === 'others') {
      pronounPrompt = 'Address the user as "them" occasionally. Never use time-based greetings like "good morning", "good afternoon", or "good evening" to greet the user; instead, start with neutral acknowledgments like "System operational, them" or "At your service, them".';
    }

    const SYSTEM_PROMPT = `You are J.A.R.V.I.S. — Tony Stark's personal assistant.
Speak naturally, warmly, and intelligently as a calm British butler. ${pronounPrompt}

You control the user's Mac. Use tools silently and confirm conversationally in one short sentence.

CRITICAL TOOL CHOICE RULES:
1. To open a website, call open_website.
2. To close a website, call close_specific_website. Never mix them up.
3. To open a Mac application, call open_application.
4. To close a Mac application, call close_application.
5. Your spoken reply must be a simple, conversational one-sentence confirmation. Never mention function names or parameters.`;

    const payload = {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userText }
      ],
      tools: GROQ_TOOLS,
      tool_choice: "auto",
      max_tokens: 512
    };

    const headers = {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    };

    let llmResponse;
    try {
      llmResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, { headers });
    } catch (apiErr) {
      const errStatus = apiErr.response?.status;
      const errMsg = (apiErr.response?.data?.error?.message || "").toLowerCase();
      const isToolError = errMsg.includes("tool") || errMsg.includes("validation") || errMsg.includes("function") || errStatus === 400;
      const isRateLimit = errStatus === 429 || errMsg.includes("rate");

      if (isToolError || isRateLimit) {
        // Retry #1: same request with smaller/faster model but keep tools
        console.warn("[WARNING] Groq API error. Retrying with fallback model + tools...");
        try {
          const retryPayload = {
            ...payload,
            model: "llama-3.1-8b-instant"
          };
          llmResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', retryPayload, { headers });
        } catch (retryErr) {
          // Retry #2: no tools at all
          console.warn("[WARNING] Retry with tools failed. Trying without tools...");
          const fallbackPayload = {
            model: "llama-3.1-8b-instant",
            messages: payload.messages,
            max_tokens: 512
          };
          llmResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', fallbackPayload, { headers });
        }
      } else {
        throw apiErr;
      }
    }

    const responseMessage = llmResponse.data.choices[0].message;
    let jarvisText = cleanLLMText(responseMessage.content || "");
    let toolCallData = null;
    let allToolCallData = [];

    // Process ALL tool calls from LLM (not just the first one)
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const hon = getHonorific(gender);
      const responseTexts = [];
      
      console.log(`[LLM] ${responseMessage.tool_calls.length} tool call(s) returned`);

      // Parse all tool calls
      const parsedCalls = responseMessage.tool_calls.map(tc => {
        let args;
        try {
          args = JSON.parse(tc.function.arguments);
        } catch (e) {
          console.error("Failed to parse tool arguments:", tc.function.arguments);
          args = {};
        }
        return { name: tc.function.name, arguments: args };
      });

      allToolCallData = parsedCalls;
      toolCallData = parsedCalls[0]; // backwards compat

      for (const tc of parsedCalls) {
        console.log(`  [TOOL CALL]: ${tc.name}`, JSON.stringify(tc.arguments));
      }

      try {
        // Execute ALL tool calls concurrently
        const execPromises = parsedCalls.map(async (tc) => {
          if (isLocal) {
            return await executeToolCall(tc.name, tc.arguments, gender);
          } else {
            return naturalResponse(tc.name, tc.arguments, gender);
          }
        });
        const results = await Promise.all(execPromises);
        for (const r of results) {
          if (r) responseTexts.push(r);
        }
      } catch (execErr) {
        console.error("Tool Execution Failed:", execErr.message);
        responseTexts.push(`Something went wrong on my end, ${hon}. Please try again.`);
      }

      if (responseTexts.length > 0) {
        jarvisText = responseTexts.join(' ');
      }
      jarvisText = cleanLLMText(jarvisText);
    }

    // Ensure there's always a response
    const hon = getHonorific(gender);
    if (!jarvisText || jarvisText.trim() === "") {
      jarvisText = `I have processed your request, ${hon}.`;
    }

    // Personalize response for gender
    jarvisText = formatResponseForGender(jarvisText, gender);

    console.log(`[J.A.R.V.I.S.]: ${jarvisText}`);

    // Generate voice audio via Cache
    console.log("[J.A.R.V.I.S.] Synthesizing voice...");
    const audioBuffer = await getCachedTTS(jarvisText, "en-GB-RyanNeural");

    const audioBase64 = audioBuffer.toString('base64');
    console.log("[J.A.R.V.I.S.] Transmitting to HUD.");

    res.json({
      jarvisText,
      audioBase64: `data:audio/mp3;base64,${audioBase64}`,
      toolCall: toolCallData,
      toolCalls: allToolCallData.length > 0 ? allToolCallData : (toolCallData ? [toolCallData] : [])
    });

  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message || "Neural Net processing failure";
    console.error("Backend Core Failure:", errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});

// -------------------------------------------------------------
// AUDIO PROCESSING ENDPOINT (File Uploads)
// -------------------------------------------------------------
app.post('/api/process-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file received by backend." });
    }

    const isLocal = req.body.isLocal !== 'false';
    const gender = req.body.gender || 'male';

    console.log("[J.A.R.V.I.S.] Audio file received. Transcribing...");

    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path));
    formData.append('model', 'whisper-large-v3');
    
    const whisperResponse = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        ...formData.getHeaders()
      }
    });
    
    const userText = whisperResponse.data.text;
    fs.unlinkSync(req.file.path);

    if (!userText || userText.trim() === '') {
      return res.status(400).json({ error: "Silence detected. No transcription generated." });
    }
    console.log(`[USER]: ${userText}`);

    let pronounPrompt = 'Address the user as "sir" occasionally.';
    if (gender === 'female') {
      pronounPrompt = 'Address the user as "ma\'am" occasionally.';
    } else if (gender === 'other' || gender === 'others') {
      pronounPrompt = 'Address the user as "them" occasionally. Never use time-based greetings like "good morning", "good afternoon", or "good evening" to greet the user; instead, start with neutral acknowledgments like "System operational, them" or "At your service, them".';
    }

    const SYSTEM_PROMPT = `You are J.A.R.V.I.S. — Tony Stark's personal assistant.
Speak naturally, warmly, and intelligently as a calm British butler. ${pronounPrompt}

You control the user's Mac. Use tools silently and confirm conversationally in one short sentence.

CRITICAL TOOL CHOICE RULES:
1. To open a website, call open_website.
2. To close a website, call close_specific_website. Never mix them up.
3. To open a Mac application, call open_application.
4. To close a Mac application, call close_application.
5. Your spoken reply must be a simple, conversational one-sentence confirmation. Never mention function names or parameters.`;

    const payload = {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userText }
      ],
      tools: GROQ_TOOLS,
      tool_choice: "auto",
      max_tokens: 512
    };

    const headers = {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    };

    let llmResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, { headers });
    const responseMessage = llmResponse.data.choices[0].message;
    let jarvisText = cleanLLMText(responseMessage.content || "");
    let toolCallData = null;
    let allToolCallData = [];

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const hon = getHonorific(gender);
      const responseTexts = [];

      const parsedCalls = responseMessage.tool_calls.map(tc => {
        let args = {};
        try { args = JSON.parse(tc.function.arguments); } catch (e) {}
        return { name: tc.function.name, arguments: args };
      });

      allToolCallData = parsedCalls;
      toolCallData = parsedCalls[0];

      for (const tc of parsedCalls) {
        console.log(`[TOOL CALL]: ${tc.name}`, JSON.stringify(tc.arguments));
      }

      try {
        const execPromises = parsedCalls.map(async (tc) => {
          if (isLocal) {
            return await executeToolCall(tc.name, tc.arguments, gender);
          } else {
            return naturalResponse(tc.name, tc.arguments, gender);
          }
        });
        const results = await Promise.all(execPromises);
        for (const r of results) {
          if (r) responseTexts.push(r);
        }
      } catch (err) {
        console.error("Tool Execution Failed:", err.message);
        responseTexts.push(`Something went wrong on my end, ${hon}.`);
      }

      if (responseTexts.length > 0) {
        jarvisText = responseTexts.join(' ');
      }
      jarvisText = cleanLLMText(jarvisText);
    }

    const hon = getHonorific(gender);
    if (!jarvisText || jarvisText.trim() === "") jarvisText = `I have processed your request, ${hon}.`;
    
    // Personalize response for gender
    jarvisText = formatResponseForGender(jarvisText, gender);
    
    console.log(`[J.A.R.V.I.S.]: ${jarvisText}`);

    // Generate voice audio via Cache
    const audioBuffer = await getCachedTTS(jarvisText, "en-GB-RyanNeural");
    const audioBase64 = audioBuffer.toString('base64');

    console.log("[J.A.R.V.I.S.] Transmitting to HUD.");
    res.json({
      userText,
      jarvisText,
      audioBase64: `data:audio/mp3;base64,${audioBase64}`,
      toolCall: toolCallData,
      toolCalls: allToolCallData.length > 0 ? allToolCallData : (toolCallData ? [toolCallData] : [])
    });

  } catch (error) {
    console.error("Backend Core Failure:", error.response ? error.response.data : error.message);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: "Neural Net processing failure" });
  }
});

// Endpoint to fetch real-time hardware status from the Mac Host
app.get('/api/sys-metrics', async (req, res) => {
  try {
    const { stdout } = await execAsync(`osascript -e 'output volume of (get volume settings)'`);
    const volume = stdout.trim();
    res.json({ volume: volume, brightness: "AUTO" });
  } catch (err) {
    res.json({ volume: "N/A", brightness: "AUTO" });
  }
});

app.listen(port, () => {
  console.log(`=========================================`);
  console.log(`J.A.R.V.I.S. BACKEND SERVER ONLINE`);
  console.log(`Port: ${port}`);
  console.log(`Engines: Whisper-v3 | Llama-3.3 | GB-TTS`);
  console.log(`=========================================`);
});

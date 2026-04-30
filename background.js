import { config } from './config.js';

// Cache for translations to prevent redundant API calls
const translationCache = new Map();

let isTracking = false;
let trackingQueue = [];

async function processTrackingQueue() {
  if (isTracking) return;
  isTracking = true;
  
  while (trackingQueue.length > 0) {
    const text = trackingQueue.shift();
    
    // Tokenize by splitting on whitespace and punctuation
    const tokens = text.split(/[\s.,!?()"'“”-]+/).filter(t => t.trim().length > 0);
    if (tokens.length === 0) continue;
    
    // Fetch latest state to avoid Service Worker race conditions
    const data = await chrome.storage.local.get(['vocabulary', 'edges']);
    let vocab = data.vocabulary || {};
    let edg = data.edges || {};
    
    let modified = false;
    const validTokens = [];
    tokens.forEach(token => {
      const t = token.toLowerCase();
      if (t.length > 0) { 
        vocab[t] = (vocab[t] || 0) + 1;
        validTokens.push(t);
        modified = true;
      }
    });
    
    for (let i = 0; i < validTokens.length - 1; i++) {
      for (let j = i + 1; j < Math.min(i + 4, validTokens.length); j++) {
        const w1 = validTokens[i];
        const w2 = validTokens[j];
        if (w1 === w2) continue;
        const edgeKey = w1 < w2 ? `${w1}-${w2}` : `${w2}-${w1}`;
        edg[edgeKey] = (edg[edgeKey] || 0) + 1;
      }
    }
    
    if (modified) {
      await chrome.storage.local.set({ vocabulary: vocab, edges: edg });
      console.log(`[Tamang Immersion] 📈 Updated Knowledge Graph! Total Unique Words: ${Object.keys(vocab).length}`);
    } else {
      console.log(`[Tamang Immersion] ℹ️ No new words added from text.`);
    }
  }
  
  isTracking = false;
}

function trackVocabulary(text) {
  trackingQueue.push(text);
  processTrackingQueue();
}

// Helper to interact with the TMT API
async function translateText(text, srcLang, tgtLang) {
  const cacheKey = `${srcLang}-${tgtLang}:${text}`;
  let translatedText = text;

  if (translationCache.has(cacheKey)) {
    console.log(`[Tamang Immersion] ⚡ Cache Hit for: "${text}"`);
    translatedText = translationCache.get(cacheKey);
  } else {
    try {
      console.log(`[Tamang Immersion] 🌐 API Call for: "${text}"`);
      const response = await fetch("https://tmt.ilprl.ku.edu.np/lang-translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + config.TMT_API_KEY
        },
        body: JSON.stringify({
          text: text,
          src_lang: srcLang,
          tgt_lang: tgtLang
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.message_type === "SUCCESS") {
        translatedText = data.output;
        
        // Validate translation length — overly long output is likely an API error
        if (translatedText.length > 50) {
          console.warn(`[Tamang Immersion] ⚠️ Translation too long (${translatedText.length} chars), marking as error: "${text}"`);
          translatedText = '<error-in-translation>';
        } else {
          console.log(`[Tamang Immersion] ✅ API Success: "${translatedText}"`);
        }
        
        translationCache.set(cacheKey, translatedText);
      } else {
        console.error(`[Tamang Immersion] ❌ TMT Error:`, data.message);
      }
    } catch (error) {
      console.error(`[Tamang Immersion] 🚨 Translation API request failed:`, error);
    }
  }

  // Only track successful translations
  if (translatedText && translatedText !== text) {
    trackVocabulary(text);
  }

  return translatedText;
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    // We must return true to indicate we will respond asynchronously
    translateText(request.text, request.srcLang, request.tgtLang)
      .then(translatedText => sendResponse({ text: translatedText }))
      .catch(err => {
        console.error("Translation error:", err);
        sendResponse({ text: request.text });
      });
    return true; 
  }
});

import { config } from './config.js';

// Cache for translations to prevent redundant API calls
const translationCache = new Map();

let vocabulary = {};
let edges = {};

// Load existing data
chrome.storage.local.get(['vocabulary', 'edges'], (data) => {
  if (data.vocabulary) vocabulary = data.vocabulary;
  if (data.edges) edges = data.edges;
});

// Helper to interact with the TMT API
async function translateText(text, srcLang, tgtLang) {
  // Track vocabulary
  const lowerText = text.toLowerCase();
  const tokens = lowerText.match(/\b[a-z]+\b/g) || [];
  
  if (tokens.length > 0) {
    let modified = false;
    tokens.forEach(token => {
      if (token.length > 2) {
        vocabulary[token] = (vocabulary[token] || 0) + 1;
        modified = true;
      }
    });
    
    // Create edges for co-occurrence in the same translation unit
    const validTokens = tokens.filter(t => t.length > 2);
    for (let i = 0; i < validTokens.length - 1; i++) {
      for (let j = i + 1; j < Math.min(i + 4, validTokens.length); j++) {
        const w1 = validTokens[i];
        const w2 = validTokens[j];
        if (w1 === w2) continue;
        const edgeKey = w1 < w2 ? `${w1}-${w2}` : `${w2}-${w1}`;
        edges[edgeKey] = (edges[edgeKey] || 0) + 1;
      }
    }
    
    if (modified) {
      chrome.storage.local.set({ vocabulary, edges });
    }
  }

  // Check cache first
  const cacheKey = `${srcLang}-${tgtLang}:${text}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  try {
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
      const translated = data.output;
      // Save to cache
      translationCache.set(cacheKey, translated);
      return translated;
    } else {
      console.error("TMT Error:", data.message);
      return text; // fallback to original
    }
  } catch (error) {
    console.error("Translation API request failed:", error);
    return text; // fallback to original
  }
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

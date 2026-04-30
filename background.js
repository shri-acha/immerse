import { config } from './config.js';

// Cache for translations to prevent redundant API calls
const translationCache = new Map();

// Helper to interact with the TMT API
async function translateText(text, srcLang, tgtLang) {
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

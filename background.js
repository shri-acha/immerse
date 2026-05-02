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
      console.log(`[Immerse] [GRAPH] Updated Knowledge Graph! Total Unique Words: ${Object.keys(vocab).length}`);
    } else {
      console.log(`[Immerse] [INFO] No new words added from text.`);
    }
  }
  
  isTracking = false;
}

function trackVocabulary(text) {
  trackingQueue.push(text);
  processTrackingQueue();
}

const gtCache = new Map();

async function translateToEnglish(text, srcLang) {
  if (gtCache.has(text)) return gtCache.get(text);
  try {
    const sl = srcLang || 'auto';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    const result = data[0].map(x => x[0]).join('');
    gtCache.set(text, result);
    return result;
  } catch (e) {
    console.error("[Immerse] [ERROR] Google Translate error:", e);
    return text;
  }
}

// Helper to interact with the TMT API
async function translateText(text, srcLang, tgtLang) {
  // First, force an intermediate translation to English to support source languages like Chinese, French, etc.
  let englishText = await translateToEnglish(text, srcLang);

  if (tgtLang === 'en') {
    return englishText;
  }

  const cacheKey = `en-${tgtLang}:${englishText}`;
  let translatedText = englishText;

  if (translationCache.has(cacheKey)) {
    console.log(`[Immerse] [CACHE] Hit for: "${englishText}"`);
    translatedText = translationCache.get(cacheKey);
  } else {
    try {
      console.log(`[Immerse] [API] Call TMT for: "${englishText}" (Original: "${text}", srcLang: ${srcLang})`);
      const response = await fetch("https://tmt.ilprl.ku.edu.np/lang-translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + config.TMT_API_KEY
        },
        body: JSON.stringify({
          text: englishText,
          src_lang: 'en', // Intermediate is always English
          tgt_lang: tgtLang // usually 'tmg'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.message_type === "SUCCESS") {
        translatedText = data.output;
        
        // Validate translation length
        const isSingleWord = englishText.trim().split(/\s+/).length === 1;
        if (isSingleWord && translatedText.length > 50) {
          console.warn(`[Immerse] [WARN] Translation too long (${translatedText.length} chars), marking as error: "${englishText}"`);
          translatedText = '<error-in-translation>';
        } else {
          console.log(`[Immerse] [OK] API Success: "${translatedText}"`);
          translationCache.set(cacheKey, translatedText);
        }
      } else {
        console.error(`[Immerse] [ERROR] TMT Error:`, data.message);
        translatedText = text; // fallback to original
      }
    } catch (error) {
      console.error(`[Immerse] [ERROR] Translation API request failed:`, error);
      translatedText = text; // fallback to original
    }
  }

  // Only track successful translations that are different from the source
  if (translatedText && translatedText !== text && translatedText !== englishText && translatedText !== '<error-in-translation>') {
    trackVocabulary(text);
  }

  return translatedText;
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    translateText(request.text, request.srcLang, request.tgtLang)
      .then(translatedText => sendResponse({ text: translatedText }))
      .catch(err => {
        console.error("Translation error:", err);
        sendResponse({ text: request.text });
      });
    return true; 
  }

  if (request.action === 'quiz_result') {
    console.log(`[Immerse] [RECV] Received quiz_result message:`, JSON.stringify(request));
    handleQuizResult(request)
      .then(() => sendResponse({ ok: true }))
      .catch(err => {
        console.error(`[Immerse] [ERROR] handleQuizResult failed:`, err);
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }
});

// --- Quiz Result Handler ---
async function handleQuizResult({ word, status, hintsUsed }) {
  console.log(`[Immerse] [QUIZ] Processing quiz result: word="${word}" status="${status}" hintsUsed=${hintsUsed}`);

  const data = await chrome.storage.local.get(['xp', 'streak', 'streakBest', 'todayXP', 'lastQuizDate', 'wordStats', 'quizMetrics']);
  
  let xp = data.xp || 0;
  let streak = data.streak || 0;
  let streakBest = data.streakBest || 0;
  let todayXP = data.todayXP || 0;
  let lastQuizDate = data.lastQuizDate || '';
  let wordStats = data.wordStats || {};
  let quizMetrics = data.quizMetrics || { correct: 0, wrong: 0, hinted: 0 };

  console.log(`[Immerse] [METRICS] Before update - quizMetrics:`, JSON.stringify(quizMetrics));

  const today = new Date().toISOString().split('T')[0];
  if (lastQuizDate !== today) {
    todayXP = 0;
    lastQuizDate = today;
  }

  // Calculate XP
  let earned = 0;
  if (status === 'correct') {
    earned = Math.max(1, 10 - (hintsUsed * 3));
    streak++;
  } else if (status === 'close') {
    earned = Math.max(1, 5 - (hintsUsed * 3));
    streak++;
  } else if (status === 'shown') {
    earned = 0;
    streak = 0;
  } else {
    earned = 0;
    streak = 0;
  }

  xp += earned;
  todayXP += earned;
  if (streak > streakBest) streakBest = streak;

  // Track aggregate quiz metrics
  if (status === 'correct' || status === 'close') {
    quizMetrics.correct++;
    console.log(`[Immerse] [+CORRECT] Incremented correct -> ${quizMetrics.correct}`);
  } else {
    quizMetrics.wrong++;
    console.log(`[Immerse] [+WRONG] Incremented wrong -> ${quizMetrics.wrong}`);
  }
  if (hintsUsed > 0) {
    quizMetrics.hinted++;
    console.log(`[Immerse] [+HINTED] Incremented hinted -> ${quizMetrics.hinted}`);
  }

  // Track per-word stats
  if (!wordStats[word]) {
    wordStats[word] = { correct: 0, incorrect: 0, hinted: 0, lastSeen: '' };
  }
  wordStats[word].lastSeen = new Date().toISOString();
  if (status === 'correct' || status === 'close') {
    wordStats[word].correct++;
  } else {
    wordStats[word].incorrect++;
  }
  if (hintsUsed > 0) {
    wordStats[word].hinted++;
  }

  console.log(`[Immerse] [METRICS] After update - quizMetrics:`, JSON.stringify(quizMetrics), `| wordStats["${word}"]:`, JSON.stringify(wordStats[word]));

  await chrome.storage.local.set({ xp, streak, streakBest, todayXP, lastQuizDate, wordStats, quizMetrics });
  
  console.log(`[Immerse] [SAVE] Saved to storage successfully`);
  console.log(`[Immerse] [QUIZ] "${word}" -> ${status} | +${earned} XP | Streak: ${streak} | Total XP: ${xp} | Metrics: C:${quizMetrics.correct} W:${quizMetrics.wrong} H:${quizMetrics.hinted}`);
}

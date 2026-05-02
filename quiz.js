// ============================================================
// Immerse — Active Recall Quiz System
// ============================================================

(function () {
  'use strict';

  let currentQuiz = null;

  // --- Levenshtein Distance ---
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  // --- Normalize input for comparison ---
  function normalize(str) {
    return str.toLowerCase().trim().replace(/[.,!?;:'"()\-]/g, '');
  }

  // ================================================================
  // Romanized Devanagari Transliteration
  // ================================================================
  const CONSONANT_MAP = {
    'ksh': 'क्ष', 'gny': 'ज्ञ',
    'chh': 'छ', 'kh': 'ख', 'gh': 'घ', 'ng': 'ङ',
    'ch': 'च', 'jh': 'झ', 'ny': 'ञ',
    'th': 'थ', 'dh': 'ध',
    'ph': 'फ', 'bh': 'भ',
    'sh': 'श',
    'k': 'क', 'g': 'ग',
    'j': 'ज', 'c': 'च',
    't': 'त', 'd': 'द', 'n': 'न',
    'p': 'प', 'b': 'ब', 'm': 'म',
    'y': 'य', 'r': 'र', 'l': 'ल', 'v': 'व', 'w': 'व',
    's': 'स', 'h': 'ह',
  };

  const VOWEL_INDEPENDENT = {
    'aa': 'आ', 'ai': 'ऐ', 'au': 'औ',
    'ee': 'ई', 'oo': 'ऊ', 'ri': 'ऋ',
    'a': 'अ', 'i': 'इ', 'u': 'उ',
    'e': 'ए', 'o': 'ओ',
  };

  const VOWEL_MATRA = {
    'aa': 'ा', 'ai': 'ै', 'au': 'ौ',
    'ee': 'ी', 'oo': 'ू', 'ri': 'ृ',
    'a': '', 'i': 'ि', 'u': 'ु',
    'e': 'े', 'o': 'ो',
  };

  const HALANT = '्';

  const DIGIT_MAP = {
    '0': '०', '1': '१', '2': '२', '3': '३', '4': '४',
    '5': '५', '6': '६', '7': '७', '8': '८', '9': '९',
  };

  function romanToDevanagari(roman) {
    let result = '';
    let i = 0;
    let afterConsonant = false;
    const text = roman.toLowerCase();

    while (i < text.length) {
      let matched = false;

      // Try longest match first (up to 3 chars)
      for (let len = Math.min(3, text.length - i); len >= 1; len--) {
        const chunk = text.substring(i, i + len);

        // After a consonant, try vowel matras first
        if (afterConsonant && VOWEL_MATRA[chunk] !== undefined) {
          result += VOWEL_MATRA[chunk];
          afterConsonant = false;
          i += len;
          matched = true;
          break;
        }

        // Standalone vowel
        if (!afterConsonant && VOWEL_INDEPENDENT[chunk]) {
          result += VOWEL_INDEPENDENT[chunk];
          afterConsonant = false;
          i += len;
          matched = true;
          break;
        }

        // Consonant
        if (CONSONANT_MAP[chunk]) {
          if (afterConsonant) {
            result += HALANT;
          }
          result += CONSONANT_MAP[chunk];
          afterConsonant = true;
          i += len;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Digits
        if (DIGIT_MAP[text[i]]) {
          afterConsonant = false;
          result += DIGIT_MAP[text[i]];
        } else {
          // Non-transliterable character (space, punctuation, etc.)
          afterConsonant = false;
          result += text[i];
        }
        i++;
      }
    }

    return result;
  }

  /**
   * Attach romanized Devanagari input handling to an input element.
   * Returns an object with getRomanText() for retrieving the raw Roman buffer.
   */
  function enableDevanagariInput(inputEl) {
    let romanBuffer = '';

    inputEl.addEventListener('keydown', (e) => {
      // Let navigation/control keys through
      if (['Enter', 'Escape', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        if (romanBuffer.length > 0) {
          romanBuffer = romanBuffer.slice(0, -1);
          inputEl.value = romanToDevanagari(romanBuffer);
        }
        return;
      }

      // Only allow letters (a-z), ignore numbers and symbols
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && /^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        romanBuffer += e.key;
        inputEl.value = romanToDevanagari(romanBuffer);
      }
    });

    // Prevent default input events from conflicting
    inputEl.addEventListener('input', (e) => {
      // If the user pastes, strip non-letters and transliterate
      if (e.inputType === 'insertFromPaste') {
        romanBuffer = inputEl.value.replace(/[^a-zA-Z]/g, '');
        inputEl.value = romanToDevanagari(romanBuffer);
      }
    });

    return {
      getRomanText: () => romanBuffer,
      getDevanagari: () => inputEl.value,
    };
  }

  // --- Evaluate user answer against correct answers ---
  // Returns: { status: 'correct'|'close'|'incorrect', corrected: string|null }
  function evaluateAnswer(userInput, correctAnswers) {
    const normalized = normalize(userInput);
    if (!normalized) return { status: 'incorrect', corrected: correctAnswers[0] };

    for (const ans of correctAnswers) {
      const normAns = normalize(ans);
      if (normalized === normAns) {
        return { status: 'correct', corrected: null };
      }
    }

    // Fuzzy match — find closest
    let bestDist = Infinity;
    let bestAns = correctAnswers[0];
    for (const ans of correctAnswers) {
      const normAns = normalize(ans);
      const dist = levenshtein(normalized, normAns);
      if (dist < bestDist) {
        bestDist = dist;
        bestAns = ans;
      }
    }

    const threshold = Math.max(2, Math.floor(normalize(bestAns).length * 0.3));
    if (bestDist <= threshold) {
      return { status: 'close', corrected: bestAns };
    }

    return { status: 'incorrect', corrected: bestAns };
  }

  // --- Send quiz result with logging ---
  function sendQuizResult(originalWord, status, hintLevel) {
    const payload = {
      action: 'quiz_result',
      word: originalWord,
      status: status,
      hintsUsed: hintLevel
    };
    console.log(`[Immerse Quiz] [SEND] Sending quiz result:`, JSON.stringify(payload));

    try {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[Immerse Quiz] [ERROR] sendMessage error:`, chrome.runtime.lastError.message);
        } else {
          console.log(`[Immerse Quiz] [OK] Background acknowledged:`, response);
        }
      });
    } catch (e) {
      console.error(`[Immerse Quiz] [ERROR] Failed to send quiz result:`, e);
    }
  }

  // --- Text-to-Speech ---
  function playTTS(text, lang) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    
    const voices = window.speechSynthesis.getVoices();
    if (lang === 'ne-NP' || lang === 'tmg') {
      // Priority: Nepali -> Hindi -> Indian English fallback
      const bestVoice = voices.find(v => v.lang.toLowerCase().startsWith('ne')) || 
                        voices.find(v => v.lang.toLowerCase().startsWith('hi')) || 
                        voices.find(v => v.lang.toLowerCase() === 'en-in' || v.lang.toLowerCase().includes('-in'));
      if (bestVoice) utterance.voice = bestVoice;
    } else {
      const enVoice = voices.find(v => v.lang.toLowerCase().startsWith('en-us')) || 
                      voices.find(v => v.lang.toLowerCase().startsWith('en'));
      if (enVoice) utterance.voice = enVoice;
    }

    window.speechSynthesis.speak(utterance);
  }

  // --- Create the Quiz Overlay ---
  async function createQuizOverlay(originalWord, translatedWord) {
    if (currentQuiz) destroyQuizOverlay();

    const data = await chrome.storage.local.get(['baseLanguage']);
    const baseLanguage = data.baseLanguage || 'en';

    // Randomly pick direction
    const isReverse = Math.random() > 0.5; // true = Tamang→BaseLang
    const promptWord = isReverse ? translatedWord : originalWord;
    
    const langNames = { 'en': 'English', 'de': 'German', 'fr': 'French', 'zh-CN': 'Chinese' };
    const langName = langNames[baseLanguage] || baseLanguage;

    const promptLabel = isReverse ? `What does this mean in ${langName}?` : `Translate to Tamang:`;
    const correctAnswers = isReverse ? [originalWord] : [translatedWord];
    
    // Devanagari is needed when typing a Tamang answer (so when it's BaseLang->Tamang)
    const needsDevanagari = !isReverse;

    let baseTTSLang = 'en-US';
    if (baseLanguage === 'de') baseTTSLang = 'de-DE';
    else if (baseLanguage === 'fr') baseTTSLang = 'fr-FR';
    else if (baseLanguage === 'zh-CN') baseTTSLang = 'zh-CN';

    const promptLang = isReverse ? 'ne-NP' : baseTTSLang;
    const answerLang = isReverse ? baseTTSLang : 'ne-NP';

    console.log(`[Immerse Quiz] [CREATE] Quiz created: "${originalWord}" <-> "${translatedWord}" | Direction: ${isReverse ? `Tamang->${langName}` : `${langName}->Tamang`} | Devanagari input: ${needsDevanagari}`);

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'immerse-quiz-backdrop';

    // Card
    const card = document.createElement('div');
    card.className = 'immerse-quiz-card';

    card.innerHTML = `
      <div class="tq-header">
        <span class="tq-badge">${isReverse ? `Tamang > ${langName}` : `${langName} > Tamang`}</span>
        <button class="tq-close" aria-label="Close">&times;</button>
      </div>
      <div class="tq-prompt-container">
        <div class="tq-prompt">${promptWord}</div>
        <button class="tq-tts-btn" data-text="${promptWord}" data-lang="${promptLang}" aria-label="Listen" title="Listen">🔊</button>
      </div>
      <div class="tq-label">${promptLabel}</div>
      <input type="text" class="tq-input" placeholder="${needsDevanagari ? 'Type in Romanized (e.g. namaste)...' : 'Type your answer...'}" autocomplete="off" spellcheck="false">
      ${needsDevanagari ? '<div class="tq-transliteration-hint">Romanized input active - type in English, see Devanagari</div>' : ''}
      <div class="tq-actions">
        <button class="tq-btn tq-btn-check">Check</button>
        <button class="tq-btn tq-btn-hint">Hint</button>
        <button class="tq-btn tq-btn-show">Show</button>
      </div>
      <div class="tq-feedback" style="display:none;"></div>
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    // References
    const input = card.querySelector('.tq-input');
    const checkBtn = card.querySelector('.tq-btn-check');
    const hintBtn = card.querySelector('.tq-btn-hint');
    const showBtn = card.querySelector('.tq-btn-show');
    const closeBtn = card.querySelector('.tq-close');
    const feedback = card.querySelector('.tq-feedback');

    let hintLevel = 0;
    let answered = false;
    let devanagariHandler = null;

    // Enable Devanagari transliteration when typing in Tamang/Nepali
    if (needsDevanagari) {
      devanagariHandler = enableDevanagariInput(input);
    }

    // TTS bindings
    const promptTTSBtn = card.querySelector('.tq-tts-btn');
    if (promptTTSBtn) {
      promptTTSBtn.addEventListener('click', () => {
        playTTS(promptTTSBtn.getAttribute('data-text'), promptTTSBtn.getAttribute('data-lang'));
      });
    }

    function attachFeedbackTTSListener() {
      const btn = feedback.querySelector('.tq-tts-btn-small');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          playTTS(btn.getAttribute('data-text'), btn.getAttribute('data-lang'));
        });
      }
    }

    // Focus input
    setTimeout(() => input.focus(), 100);

    // --- Check ---
    function handleCheck() {
      if (answered) return;
      const userValue = input.value;
      console.log(`[Immerse Quiz] [CHECK] Checking answer: "${userValue}" against: ${JSON.stringify(correctAnswers)}`);

      const result = evaluateAnswer(userValue, correctAnswers);
      answered = true;
      feedback.style.display = 'block';

      console.log(`[Immerse Quiz] [RESULT] ${result.status} | Hints used: ${hintLevel}`);

      if (result.status === 'correct') {
        feedback.className = 'tq-feedback tq-correct';
        feedback.innerHTML = `<span class="tq-icon">Correct!</span> <button class="tq-tts-btn-small" data-text="${correctAnswers[0]}" data-lang="${answerLang}" title="Listen">🔊</button>`;
        input.classList.add('tq-input-correct');
      } else if (result.status === 'close') {
        feedback.className = 'tq-feedback tq-close-answer';
        feedback.innerHTML = `<span class="tq-icon">Close!</span> The answer is: <strong>${result.corrected}</strong> <button class="tq-tts-btn-small" data-text="${result.corrected}" data-lang="${answerLang}" title="Listen">🔊</button>`;
        input.classList.add('tq-input-close');
      } else {
        feedback.className = 'tq-feedback tq-incorrect';
        feedback.innerHTML = `<span class="tq-icon">Wrong.</span> The answer is: <strong>${result.corrected}</strong> <button class="tq-tts-btn-small" data-text="${result.corrected}" data-lang="${answerLang}" title="Listen">🔊</button>`;
        input.classList.add('tq-input-incorrect');
      }

      attachFeedbackTTSListener();

      // Send result to background
      sendQuizResult(originalWord, result.status, hintLevel);

      // Disable buttons
      checkBtn.disabled = true;
      hintBtn.disabled = true;
      showBtn.disabled = true;

      // Auto-close after delay
      setTimeout(() => destroyQuizOverlay(), 2500);
    }

    checkBtn.addEventListener('click', handleCheck);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleCheck();
      if (e.key === 'Escape') destroyQuizOverlay();
    });

    // --- Hint ---
    hintBtn.addEventListener('click', () => {
      if (answered) return;
      hintLevel++;
      const answer = correctAnswers[0];
      console.log(`[Immerse Quiz] [HINT] Hint used (level ${hintLevel}) for "${originalWord}"`);

      if (hintLevel === 1) {
        input.placeholder = `Starts with "${answer[0]}"...`;
      } else if (hintLevel === 2) {
        const half = Math.ceil(answer.length / 2);
        const revealed = answer.substring(0, half) + '•'.repeat(answer.length - half);
        input.placeholder = revealed;
      } else {
        input.placeholder = `Answer: ${answer}`;
        hintLevel = 3;
      }

      if (hintLevel >= 3) hintBtn.disabled = true;
    });

    // --- Show Answer ---
    showBtn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      console.log(`[Immerse Quiz] [SHOW] Show answer used for "${originalWord}" | Hints used: ${hintLevel}`);

      feedback.style.display = 'block';
      feedback.className = 'tq-feedback tq-shown';
      feedback.innerHTML = `<span class="tq-icon">Answer:</span> <strong>${correctAnswers[0]}</strong> <button class="tq-tts-btn-small" data-text="${correctAnswers[0]}" data-lang="${answerLang}" title="Listen">🔊</button>`;
      input.value = correctAnswers[0];
      input.classList.add('tq-input-shown');

      attachFeedbackTTSListener();

      checkBtn.disabled = true;
      hintBtn.disabled = true;
      showBtn.disabled = true;

      sendQuizResult(originalWord, 'shown', hintLevel);

      setTimeout(() => destroyQuizOverlay(), 2500);
    });

    // --- Close ---
    closeBtn.addEventListener('click', destroyQuizOverlay);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) destroyQuizOverlay();
    });

    currentQuiz = backdrop;
  }

  // --- Destroy ---
  function destroyQuizOverlay() {
    if (currentQuiz) {
      currentQuiz.classList.add('tq-closing');
      setTimeout(() => {
        if (currentQuiz && currentQuiz.parentNode) {
          currentQuiz.parentNode.removeChild(currentQuiz);
        }
        currentQuiz = null;
      }, 200);
    }
  }

  // Expose to content.js
  window.__immerseQuiz = {
    create: createQuizOverlay,
    destroy: destroyQuizOverlay
  };
})();

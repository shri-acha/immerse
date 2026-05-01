// ============================================================
// Tamang Immersion — Active Recall Quiz System
// ============================================================

(function() {
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

  // --- Create the Quiz Overlay ---
  function createQuizOverlay(originalWord, translatedWord) {
    if (currentQuiz) destroyQuizOverlay();

    // Randomly pick direction
    const isReverse = Math.random() > 0.5; // true = Tamang→English
    const promptWord = isReverse ? translatedWord : originalWord;
    const promptLabel = isReverse ? 'What does this mean in English?' : 'Translate to Tamang:';
    const correctAnswers = isReverse ? [originalWord] : [translatedWord];

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'tamang-quiz-backdrop';

    // Card
    const card = document.createElement('div');
    card.className = 'tamang-quiz-card';

    card.innerHTML = `
      <div class="tq-header">
        <span class="tq-badge">${isReverse ? 'Tamang → English' : 'English → Tamang'}</span>
        <button class="tq-close" aria-label="Close">&times;</button>
      </div>
      <div class="tq-prompt">${promptWord}</div>
      <div class="tq-label">${promptLabel}</div>
      <input type="text" class="tq-input" placeholder="Type your answer..." autocomplete="off" spellcheck="false">
      <div class="tq-actions">
        <button class="tq-btn tq-btn-check">✅ Check</button>
        <button class="tq-btn tq-btn-hint">💡 Hint</button>
        <button class="tq-btn tq-btn-show">👁 Show</button>
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

    // Focus input
    setTimeout(() => input.focus(), 100);

    // --- Check ---
    function handleCheck() {
      if (answered) return;
      const result = evaluateAnswer(input.value, correctAnswers);
      answered = true;
      feedback.style.display = 'block';

      if (result.status === 'correct') {
        feedback.className = 'tq-feedback tq-correct';
        feedback.innerHTML = `<span class="tq-icon">✅</span> Correct!`;
        input.classList.add('tq-input-correct');
      } else if (result.status === 'close') {
        feedback.className = 'tq-feedback tq-close-answer';
        feedback.innerHTML = `<span class="tq-icon">⚠️</span> Close! The answer is: <strong>${result.corrected}</strong>`;
        input.classList.add('tq-input-close');
      } else {
        feedback.className = 'tq-feedback tq-incorrect';
        feedback.innerHTML = `<span class="tq-icon">❌</span> Incorrect. The answer is: <strong>${result.corrected}</strong>`;
        input.classList.add('tq-input-incorrect');
      }

      // Send result to background
      try {
        chrome.runtime.sendMessage({
          action: 'quiz_result',
          word: originalWord,
          status: result.status,
          hintsUsed: hintLevel
        });
      } catch (e) {}

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
      feedback.style.display = 'block';
      feedback.className = 'tq-feedback tq-shown';
      feedback.innerHTML = `<span class="tq-icon">👁</span> Answer: <strong>${correctAnswers[0]}</strong>`;
      input.value = correctAnswers[0];
      input.classList.add('tq-input-shown');

      checkBtn.disabled = true;
      hintBtn.disabled = true;
      showBtn.disabled = true;

      try {
        chrome.runtime.sendMessage({
          action: 'quiz_result',
          word: originalWord,
          status: 'shown',
          hintsUsed: hintLevel
        });
      } catch (e) {}

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
  window.__tamangQuiz = {
    create: createQuizOverlay,
    destroy: destroyQuizOverlay
  };
})();

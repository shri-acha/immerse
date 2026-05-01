document.addEventListener('DOMContentLoaded', async () => {
  const modeToggle = document.getElementById('learningMode');
  const difficultySlider = document.getElementById('difficultyLevel');
  const difficultyDesc = document.getElementById('difficultyDesc');
  const statSeen = document.getElementById('statSeen');
  const statTranslated = document.getElementById('statTranslated');
  const statCorrect = document.getElementById('statCorrect');
  const statWrong = document.getElementById('statWrong');
  const statHinted = document.getElementById('statHinted');

  // Load initial settings
  const data = await chrome.storage.local.get(['isLearningMode', 'difficultyLevel', 'stats', 'quizMetrics']);
  
  modeToggle.checked = data.isLearningMode || false;
  difficultySlider.value = data.difficultyLevel || 1;
  updateDifficultyDesc(difficultySlider.value);
  
  if (data.stats) {
    statSeen.textContent = data.stats.seen || 0;
    statTranslated.textContent = data.stats.translated || 0;
  }

  updateQuizMetrics(data.quizMetrics || { correct: 0, wrong: 0, hinted: 0 });

  // Event Listeners
  modeToggle.addEventListener('change', () => {
    chrome.storage.local.set({ isLearningMode: modeToggle.checked });
  });

  difficultySlider.addEventListener('input', (e) => {
    const val = e.target.value;
    updateDifficultyDesc(val);
  });

  difficultySlider.addEventListener('change', (e) => {
    chrome.storage.local.set({ difficultyLevel: parseInt(e.target.value, 10) });
  });

  // Listen for real-time stat updates from content script
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.stats) {
        statSeen.textContent = changes.stats.newValue.seen || 0;
        statTranslated.textContent = changes.stats.newValue.translated || 0;
      }
      if (changes.quizMetrics) {
        updateQuizMetrics(changes.quizMetrics.newValue);
      }
    }
  });

  const viewGraphBtn = document.getElementById('viewGraphBtn');
  if (viewGraphBtn) {
    viewGraphBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  function updateQuizMetrics(metrics) {
    statCorrect.textContent = metrics.correct || 0;
    statWrong.textContent = metrics.wrong || 0;
    statHinted.textContent = metrics.hinted || 0;

    const total = (metrics.correct || 0) + (metrics.wrong || 0);
    const barCorrect = document.getElementById('quizBarCorrect');
    const barWrong = document.getElementById('quizBarWrong');
    const barHinted = document.getElementById('quizBarHinted');
    const barContainer = document.getElementById('quizBar');

    if (total === 0) {
      barContainer.style.display = 'none';
    } else {
      barContainer.style.display = 'flex';
      const pctCorrect = ((metrics.correct || 0) / total) * 100;
      const pctWrong = ((metrics.wrong || 0) / total) * 100;
      // Hinted is overlapping (a subset of correct+wrong), so show as % of total
      const pctHinted = ((metrics.hinted || 0) / total) * 100;
      barCorrect.style.width = pctCorrect + '%';
      barWrong.style.width = pctWrong + '%';
      // Show hinted as a separate small indicator bar below
      barHinted.style.width = Math.min(pctHinted, 100) + '%';
    }
  }

  function updateDifficultyDesc(level) {
    const descriptions = {
      1: 'Translates a few random words per sentence.',
      2: 'Translates many words per sentence.',
      3: 'Translates entire sentences.',
      4: 'Translates entire paragraphs.'
    };
    difficultyDesc.textContent = descriptions[level];
  }
});

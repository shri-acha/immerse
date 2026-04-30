document.addEventListener('DOMContentLoaded', async () => {
  const modeToggle = document.getElementById('learningMode');
  const difficultySlider = document.getElementById('difficultyLevel');
  const difficultyDesc = document.getElementById('difficultyDesc');
  const statSeen = document.getElementById('statSeen');
  const statTranslated = document.getElementById('statTranslated');

  // Load initial settings
  const data = await chrome.storage.local.get(['isLearningMode', 'difficultyLevel', 'stats']);
  
  modeToggle.checked = data.isLearningMode || false;
  difficultySlider.value = data.difficultyLevel || 1;
  updateDifficultyDesc(difficultySlider.value);
  
  if (data.stats) {
    statSeen.textContent = data.stats.seen || 0;
    statTranslated.textContent = data.stats.translated || 0;
  }

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
    if (namespace === 'local' && changes.stats) {
      statSeen.textContent = changes.stats.newValue.seen || 0;
      statTranslated.textContent = changes.stats.newValue.translated || 0;
    }
  });

  const viewGraphBtn = document.getElementById('viewGraphBtn');
  if (viewGraphBtn) {
    viewGraphBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
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

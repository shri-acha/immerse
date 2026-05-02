document.addEventListener('DOMContentLoaded', async () => {
  const baseLangSelect = document.getElementById('baseLanguage');
  const modeToggle = document.getElementById('learningMode');
  const difficultySlider = document.getElementById('difficultyLevel');
  const diffValue = document.getElementById('diffValue');
  const difficultyDesc = document.getElementById('difficultyDesc');
  const practiceNowBtn = document.getElementById('practiceNowBtn');
  const viewGraphBtn = document.getElementById('viewGraphBtn');

  // Load initial settings
  const data = await chrome.storage.local.get(['isLearningMode', 'difficultyLevel', 'baseLanguage']);
  
  if (baseLangSelect) baseLangSelect.value = data.baseLanguage || 'en';
  modeToggle.checked = data.isLearningMode || false;
  difficultySlider.value = data.difficultyLevel || 1;
  updateDifficultyDesc(difficultySlider.value);

  // Event Listeners
  if (baseLangSelect) {
    baseLangSelect.addEventListener('change', (e) => {
      chrome.storage.local.set({ baseLanguage: e.target.value });
    });
  }

  modeToggle.addEventListener('change', () => {
    chrome.storage.local.set({ isLearningMode: modeToggle.checked });
  });

  difficultySlider.addEventListener('input', (e) => {
    updateDifficultyDesc(e.target.value);
  });

  difficultySlider.addEventListener('change', (e) => {
    chrome.storage.local.set({ difficultyLevel: parseInt(e.target.value, 10) });
  });

  if (practiceNowBtn) {
    practiceNowBtn.addEventListener('click', () => {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {action: 'trigger_quiz'}, function(response) {
            if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError);
            } else {
              window.close(); // Close the popup after clicking practice
            }
          });
        }
      });
    });
  }

  if (viewGraphBtn) {
    viewGraphBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  function updateDifficultyDesc(level) {
    if (diffValue) diffValue.textContent = level;
    const descriptions = {
      1: 'Translates a few random words per sentence.',
      2: 'Translates many words per sentence.',
      3: 'Translates entire sentences.',
      4: 'Translates entire paragraphs.'
    };
    if (difficultyDesc) difficultyDesc.textContent = descriptions[level];
  }
});

// --- State ---
let isLearningMode = false;
let difficultyLevel = 1; // 1 to 4
let stats = { seen: 0, translated: 0 };
let isProcessing = false;

// --- Constants ---
const IGNORED_TAGS = new Set(['CODE', 'PRE', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'BUTTON', 'SELECT', 'OPTION', 'A']);
const SENTENCE_REGEX = /[^.!?]+[.!?]+/g; // Basic sentence splitting

// --- Initialization ---
async function init() {
  const data = await chrome.storage.local.get(['isLearningMode', 'difficultyLevel', 'stats']);
  isLearningMode = data.isLearningMode || false;
  difficultyLevel = data.difficultyLevel || 1;
  stats = data.stats || { seen: 0, translated: 0 };

  if (isLearningMode) {
    processDOM(document.body);
    setupObserver();
  } else {
    setupHighlightToTranslate();
  }
}

// Listen for settings changes from popup
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.isLearningMode) {
      isLearningMode = changes.isLearningMode.newValue;
      location.reload(); // Simple way to apply/remove changes for MVP
    }
  }
});

// --- DOM Processing ---
function setupObserver() {
  const observer = new MutationObserver((mutations) => {
    if (isProcessing) return;

    let shouldProcess = false;
    for (let mutation of mutations) {
      if (mutation.addedNodes.length) {
        shouldProcess = true;
        break;
      }
    }

    if (shouldProcess) {
      // Debounce slightly
      isProcessing = true;
      setTimeout(() => {
        processDOM(document.body);
        isProcessing = false;
      }, 1000);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

async function processDOM(rootNode) {
  const walker = document.createTreeWalker(
    rootNode,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        // Skip empty nodes and ignored tags
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        let parent = node.parentNode;
        while (parent) {
          if (IGNORED_TAGS.has(parent.tagName) || parent.isContentEditable) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.classList && parent.classList.contains('tamang-tooltip-wrapper')) {
            return NodeFilter.FILTER_REJECT; // Already processed
          }
          parent = parent.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  // Calculate probability based on difficulty (10% to 40%)
  const translateProb = difficultyLevel * 0.1;

  for (let textNode of textNodes) {
    const text = textNode.nodeValue;
    const sentences = text.match(SENTENCE_REGEX);

    if (!sentences) continue;

    let modified = false;
    const fragment = document.createDocumentFragment();

    for (let sentence of sentences) {
      if (Math.random() < translateProb) {
        stats.seen++;
        try {
          const translated = await translateWithAPI(sentence.trim());
          if (translated && translated !== sentence.trim()) {
            stats.translated++;
            const wrapper = document.createElement('span');
            wrapper.className = 'tamang-tooltip-wrapper';
            wrapper.setAttribute('data-original', sentence.trim());
            wrapper.textContent = translated + " ";
            fragment.appendChild(wrapper);
            modified = true;

            // Save stats
            chrome.storage.local.set({ stats });
            continue;
          }
        } catch (e) {
          console.error(e);
        }
      }

      // Keep original
      fragment.appendChild(document.createTextNode(sentence));
    }

    if (modified) {
      textNode.parentNode.replaceChild(fragment, textNode);
    }

    // Add small delay to avoid hammering the API if we batch many sentences
    await new Promise(r => setTimeout(r, 50));
  }
}

// --- API Helper ---
function translateWithAPI(text) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'translate',
      text: text,
      srcLang: 'en',
      tgtLang: 'tmg'
    }, response => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response.text);
      }
    });
  });
}

// --- Highlight to Translate (Non-Learning Mode) ---
let popupBtn = null;
let resultBox = null;

function setupHighlightToTranslate() {
  document.addEventListener('mouseup', handleSelection);
  document.addEventListener('mousedown', handleClickOutside);
}

function handleSelection(e) {
  const selection = window.getSelection();
  const text = selection.toString().trim();

  if (text.length > 0 && text.length < 500) { // Limit length for MVP
    showTranslateButton(e.pageX, e.pageY, text);
  } else {
    hidePopups();
  }
}

function showTranslateButton(x, y, text) {
  if (!popupBtn) {
    popupBtn = document.createElement('div');
    popupBtn.id = 'tamang-translate-popup';
    popupBtn.textContent = '🔄 Translate to Tamang';
    document.body.appendChild(popupBtn);
  }

  popupBtn.style.left = `${x + 10}px`;
  popupBtn.style.top = `${y + 10}px`;
  popupBtn.style.display = 'flex';
  popupBtn.className = '';

  popupBtn.onclick = async (e) => {
    e.stopPropagation();
    popupBtn.className = 'loading';
    popupBtn.textContent = 'Translating...';
    try {
      const translated = await translateWithAPI(text);
      showResult(x, y, text, translated);
    } catch (err) {
      showResult(x, y, text, "Translation failed.");
    }
  };
}

function showResult(x, y, original, translated) {
  if (popupBtn) popupBtn.style.display = 'none';

  if (!resultBox) {
    resultBox = document.createElement('div');
    resultBox.id = 'tamang-translate-result';
    document.body.appendChild(resultBox);
  }

  resultBox.innerHTML = `
    <span class="original">${original}</span>
    <span class="translated">${translated}</span>
  `;
  resultBox.style.left = `${x + 10}px`;
  resultBox.style.top = `${y + 10}px`;
  resultBox.style.display = 'block';
}

function hidePopups() {
  if (popupBtn) popupBtn.style.display = 'none';
  if (resultBox) resultBox.style.display = 'none';
}

function handleClickOutside(e) {
  if (popupBtn && popupBtn.contains(e.target)) return;
  if (resultBox && resultBox.contains(e.target)) return;
  hidePopups();
}

// Start
init();

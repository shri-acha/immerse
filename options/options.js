document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('graphCanvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  const data = await chrome.storage.local.get(['vocabulary', 'edges', 'quizMetrics', 'wordStats']);
  const vocabulary = data.vocabulary || {};
  const rawEdges = data.edges || {};
  const quizMetrics = data.quizMetrics || { correct: 0, wrong: 0, hinted: 0 };
  const wordStats = data.wordStats || {};

  // Load Nepali dictionary
  let nepaliDict = {};
  try {
    const dictResponse = await fetch(chrome.runtime.getURL('data/nepali_dict.json'));
    nepaliDict = await dictResponse.json();
    console.log(`[Tamang Immersion] Loaded ${Object.keys(nepaliDict).length} Nepali dictionary entries`);
  } catch (err) {
    console.error('[Tamang Immersion] Failed to load Nepali dictionary:', err);
  }

  // Unique words stat removed

  const nodes = [];
  const nodeMap = new Map();

  let maxFreq = 1;
  for (const word in vocabulary) {
    if (vocabulary[word] > maxFreq) maxFreq = vocabulary[word];
  }

  // Determine node color based on quiz performance
  function getNodeColor(word, freq) {
    const ws = wordStats[word];
    if (!ws || (ws.correct === 0 && ws.incorrect === 0)) {
      // Untested — blue tones
      return `hsl(${215 + (freq / maxFreq) * 15}, 70%, 45%)`;
    }
    const total = ws.correct + ws.incorrect;
    const ratio = ws.correct / total;
    if (ratio >= 0.75) {
      // Mastered — green
      return `hsl(${142 + (ratio * 20)}, 75%, ${30 + ratio * 15}%)`;
    } else if (ratio >= 0.4) {
      // Needs practice — amber/yellow
      return `hsl(${38 + (ratio * 10)}, 85%, 42%)`;
    } else {
      // Weak — red
      return `hsl(${0 + (ratio * 15)}, 75%, 45%)`;
    }
  }

  for (const word in vocabulary) {
    const freq = vocabulary[word];
    const radius = 15 + (freq / maxFreq) * 25;
    const node = {
      id: word,
      displayText: word,
      freq: freq,
      r: radius,
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height / 2 + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0,
      color: getNodeColor(word, freq)
    };
    nodes.push(node);
    nodeMap.set(word, node);
  }
  
  // Handle Language Switching removed

  const links = [];
  for (const key in rawEdges) {
    const parts = key.split('-');
    if (parts.length === 2 && nodeMap.has(parts[0]) && nodeMap.has(parts[1])) {
      links.push({
        source: nodeMap.get(parts[0]),
        target: nodeMap.get(parts[1]),
        weight: rawEdges[key]
      });
    }
  }

  const REPULSION = 5000;
  const SPRING_LENGTH = 150;
  const SPRING_K = 0.02;
  const GRAVITY = 0.5;
  const DAMPING = 0.85;

  let draggedNode = null;
  let mouse = { x: 0, y: 0, isDown: false };
  let mouseDownPos = { x: 0, y: 0 };

  canvas.addEventListener('mousedown', (e) => {
    mouse.isDown = true;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouseDownPos.x = e.clientX;
    mouseDownPos.y = e.clientY;

    for (let node of nodes) {
      const dx = mouse.x - node.x;
      const dy = mouse.y - node.y;
      if (dx * dx + dy * dy <= node.r * node.r) {
        draggedNode = node;
        break;
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (draggedNode) {
      draggedNode.x = mouse.x;
      draggedNode.y = mouse.y;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
    }
  });

  window.addEventListener('mouseup', (e) => {
    const dx = e.clientX - mouseDownPos.x;
    const dy = e.clientY - mouseDownPos.y;
    const wasDrag = (dx * dx + dy * dy) > 25;

    if (!wasDrag && draggedNode) {
      showWordDetail(draggedNode, nepaliDict);
    }

    mouse.isDown = false;
    draggedNode = null;
  });

  // Word detail panel logic
  const wordDetailEl = document.getElementById('wordDetail');
  const detailWordEl = document.getElementById('detailWord');
  const detailPosEl = document.getElementById('detailPos');
  const detailFreqEl = document.getElementById('detailFreq');
  const detailDefsEl = document.getElementById('detailDefs');

  document.getElementById('closeDetail').addEventListener('click', () => {
    wordDetailEl.style.display = 'none';
  });

  // --- Quiz Metrics Donut Chart removed ---

  async function showWordDetail(node, dict) {
    detailWordEl.textContent = node.displayText;

    // Build frequency + quiz stats text
    let freqText = `Seen ${node.freq} time${node.freq > 1 ? 's' : ''} during immersion`;
    const ws = wordStats[node.id];
    if (ws && (ws.correct > 0 || ws.incorrect > 0)) {
      freqText += ` | Quiz: C:${ws.correct} W:${ws.incorrect}`;
      if (ws.hinted > 0) freqText += ` H:${ws.hinted}`;
    }
    detailFreqEl.textContent = freqText;

    // First try to get the Nepali translation of this English word
    let nepaliWord = null;
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'translate',
          text: node.id,
          srcLang: 'en',
          tgtLang: 'ne'
        }, (res) => resolve(res));
      });
      if (response && response.text && response.text !== node.id) {
        nepaliWord = response.text.trim();
      }
    } catch (err) {
      console.error('Translation for meaning lookup failed:', err);
    }

    // Look up meaning in Nepali dictionary
    let entry = null;
    if (nepaliWord && dict[nepaliWord]) {
      entry = dict[nepaliWord];
    }

    // Set part of speech
    if (entry && entry.pos) {
      detailPosEl.textContent = entry.pos;
      detailPosEl.style.display = 'inline';
    } else {
      detailPosEl.style.display = 'none';
    }

    // Set definitions
    if (entry && entry.definitions && entry.definitions.length > 0) {
      detailDefsEl.innerHTML = entry.definitions.map((def, i) =>
        `<div class="def-item"><span class="def-num">${i + 1}.</span> ${def}</div>`
      ).join('');
    } else {
      detailDefsEl.innerHTML = `<div class="no-def">No Nepali dictionary entry found${nepaliWord ? ` for "${nepaliWord}"` : ''}.</div>`;
    }

    wordDetailEl.style.display = 'block';
  }

  // --- Export Logic removed ---

  function tick() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    for (let i = 0; i < nodes.length; i++) {
      const n1 = nodes[i];
      if (n1 === draggedNode) continue;

      n1.vx += (cx - n1.x) * GRAVITY * 0.01;
      n1.vy += (cy - n1.y) * GRAVITY * 0.01;

      for (let j = i + 1; j < nodes.length; j++) {
        const n2 = nodes[j];
        if (n1 === n2) continue;

        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 100) distSq = 100; // Stabilize: Prevent infinite forces when too close

        const force = REPULSION / distSq;
        const dist = Math.sqrt(distSq);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        n1.vx -= fx;
        n1.vy -= fy;
        n2.vx += fx;
        n2.vy += fy;
      }
    }

    for (const link of links) {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) dist = 0.1;

      const force = (dist - SPRING_LENGTH) * SPRING_K;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (link.source !== draggedNode) {
        link.source.vx += fx;
        link.source.vy += fy;
      }
      if (link.target !== draggedNode) {
        link.target.vx -= fx;
        link.target.vy -= fy;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const node of nodes) {
      if (node !== draggedNode) {
        node.vx *= DAMPING;
        node.vy *= DAMPING;
        node.x += node.vx;
        node.y += node.vy;

        // Canvas Boundaries (Walls) to keep nodes inside screen
        if (node.x < node.r) {
          node.x = node.r;
          node.vx *= -0.5;
        } else if (node.x > canvas.width - node.r) {
          node.x = canvas.width - node.r;
          node.vx *= -0.5;
        }

        if (node.y < node.r) {
          node.y = node.r;
          node.vy *= -0.5;
        } else if (node.y > canvas.height - node.r) {
          node.y = canvas.height - node.r;
          node.vy *= -0.5;
        }
      }
    }

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    for (const link of links) {
      ctx.beginPath();
      ctx.lineWidth = Math.min(link.weight, 5);
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.stroke();
    }

    for (const node of nodes) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.max(12, node.r * 0.6)}px Inter`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.displayText, node.x, node.y);
    }

    requestAnimationFrame(tick);
  }

  tick();
});

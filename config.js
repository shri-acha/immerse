export const config = {
  TMT_API_KEY: ""
};

try {
  const url = chrome.runtime.getURL('.env');
  const response = await fetch(url);
  if (response.ok) {
    const text = await response.text();
    text.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        // Remove surrounding quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        if (key === 'TMT_API_KEY') {
          config.TMT_API_KEY = value;
        }
      }
    });
    console.log('[Tamang Immersion] Loaded .env config successfully.');
  }
} catch (error) {
  console.warn("[Tamang Immersion] Could not load .env file at runtime. Falling back to empty keys.", error);
}

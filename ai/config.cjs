/**
 * ai/config.cjs
 * ------------
 * AI configuration loader.
 *
 * Config is stored separately from the app logic in a user config file:
 *   <userData>/ai-config.json
 * and can be overridden per-launch with environment variables:
 *   AI_PROVIDER         (ollama | lmstudio | openai | openrouter | custom)
 *   AI_SERVER_URL       (full /v1/chat/completions endpoint)
 *   AI_MODEL            (e.g. gemma3:4b, gemma-3-4b, deepseek-r1:8b)
 *   AI_TEMPERATURE      (0.0 – 2.0)
 *   AI_CONTEXT_LENGTH   (token budget of the local model)
 *   AI_STREAMING        (true | false)
 *
 * Values are never hardcoded into the prompt layer — the provider, model,
 * temperature and mode are all read from this configuration.
 */

const fs = require('fs');
const path = require('path');

/** Default endpoint per provider. `custom` keeps the legacy default. */
const PROVIDER_DEFAULTS = {
  ollama:    { serverUrl: 'http://127.0.0.1:11434/v1/chat/completions' },
  lmstudio:  { serverUrl: 'http://127.0.0.1:1234/v1/chat/completions' },
  openai:    { serverUrl: 'https://api.openai.com/v1/chat/completions' },
  openrouter: { serverUrl: 'https://openrouter.ai/api/v1/chat/completions' },
  custom:    { serverUrl: 'http://127.0.0.1:8080/v1/chat/completions' },
};

/** Read the JSON config file from Electron's userData dir (best effort). */
function readUserConfig(app) {
  try {
    if (!app || typeof app.getPath !== 'function') return {};
    const file = path.join(app.getPath('userData'), 'ai-config.json');
    return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
  } catch {
    return {};
  }
}

/** Local endpoints run models on this machine; everything else is cloud. */
function isLocalHost(urlString) {
  try {
    const host = new URL(urlString).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Build the effective AI configuration.
 *
 * Priority: environment variable > user config file > provider default.
 *
 * @param {{ app?: import('electron').App }} [opts]
 * @returns {{
 *   provider: string,
 *   serverUrl: string,
 *   model: string,
 *   temperature: number,
 *   contextLength: number,
 *   streaming: boolean,
 *   executionMode: 'local' | 'cloud',
 * }}
 */
function loadAIConfig({ app } = {}) {
  const file = readUserConfig(app);
  const provider = String(process.env.AI_PROVIDER || file.provider || 'ollama').toLowerCase();
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.custom;

  const serverUrl = String(process.env.AI_SERVER_URL || file.serverUrl || defaults.serverUrl);
  const model = String(
    process.env.AI_MODEL ||
    file.model ||
    (provider === 'ollama' ? 'gemma3:4b' : 'gemma-3-4b')
  );
  const temperature = Number(process.env.AI_TEMPERATURE ?? file.temperature ?? 0.7);
  const contextLength = Number(process.env.AI_CONTEXT_LENGTH ?? file.contextLength ?? 4096);
  const rawStream = process.env.AI_STREAMING ?? (file.streaming === undefined ? 'true' : String(file.streaming));
  const streaming = rawStream === 'true' || rawStream === true;

  return {
    provider,
    serverUrl,
    model,
    temperature,
    contextLength,
    streaming,
    executionMode: isLocalHost(serverUrl) ? 'local' : 'cloud',
  };
}

module.exports = { PROVIDER_DEFAULTS, loadAIConfig };
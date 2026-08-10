/**
 * ai/provider.cjs
 * ---------------
 * AI provider abstraction.
 *
 * Providers: ollama, lmstudio, openai, openrouter, custom.
 * All speak the OpenAI-compatible /v1/chat/completions endpoint, so a single
 * request implementation covers every provider. Switching providers only
 * requires changing the configuration (ai/config.cjs) — no code changes.
 *
 * Supports streaming (SSE) whenever the provider supports it. During a
 * streaming request the `onChunk(chunkText, fullText)` callback is invoked
 * continuously so the UI can update before the response completes.
 */

const http = require('http');
const https = require('https');

/** Stop a request that cannot reach a provider before it hangs the UI forever. */
const REQUEST_TIMEOUT_MS = 60000;

/** Human-readable provider name for context messages. */
const PROVIDER_LABELS = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  custom: 'Custom',
};

/**
 * Strip a leading "data: " prefix / optional [DONE] from an SSE line.
 * @returns {string|null} JSON payload or null for [DONE]/heartbeat.
 */
function ssePayload(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed === 'data: [DONE]') return null;
  const json = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
  return json || null;
}

/**
 * Send one chat completion request.
 *
 * @param {{
 *   config: object,
 *   messages: {role:string, content:string}[],
 *   onChunk?: (chunk:string, full:string) => void,
 *   signal?: AbortSignal,
 * }} opts
 * @returns {Promise<string>} full assistant reply
 */
function chatCompletion({ config, messages, onChunk, signal }) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.serverUrl);
    const lib = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      stream: Boolean(config.streaming),
    });

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let errBody = '';
          res.on('data', (d) => (errBody += d));
          res.on('end', () => {
            reject(new Error(`AI provider error ${res.statusCode}: ${errBody.slice(0, 300)}`));
          });
          return;
        }

        const isStream = Boolean(config.streaming) && /text\/event-stream/i.test(res.headers['content-type'] || '');
        let full = '';
        let buffer = '';

        // Non-stream responses arrive as the raw JSON body — extract the text.
        const finish = () => resolve(isStream ? full : extractReply(full));
        const flushBuffer = () => {
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            const payload = ssePayload(line);
            if (!payload) continue;
            try {
              const obj = JSON.parse(payload);
              const delta =
                obj?.choices?.[0]?.delta?.content ||
                obj?.choices?.[0]?.message?.content ||
                '';
              if (delta) {
                full += delta;
                if (onChunk) onChunk(delta, full);
              }
            } catch {
              // ignore malformed keep-alive lines
            }
          }
        };

        res.on('data', (chunk) => {
          if (!isStream) {
            full += chunk.toString();
            return;
          }
          buffer += chunk.toString();
          flushBuffer();
        });

        res.on('end', () => {
          if (isStream) {
            buffer += '\n';
            flushBuffer();
          }
          finish();
        });
      }
    );

    req.on('error', (err) => reject(err));
    // Never let an unreachable/stalled provider hang the planning UI.
    const requestTimeoutMs = Number(config.requestTimeoutMs) > 0 ? Number(config.requestTimeoutMs) : REQUEST_TIMEOUT_MS;
    req.setTimeout(requestTimeoutMs, () => req.destroy(new Error(`AI provider timed out after ${requestTimeoutMs / 1000}s`)));
    if (signal) {
      signal.addEventListener('abort', () => req.destroy(new Error('Request aborted')));
    }
    req.write(body);
    req.end();
  });
}

/**
 * Fallback: parse full-response JSON when streaming is disabled.
 * @param {string} full
 * @returns {string}
 */
function extractReply(full) {
  try {
    const obj = JSON.parse(full);
    return (
      obj?.choices?.[0]?.message?.content ||
      obj?.choices?.[0]?.text ||
      ''
    );
  } catch {
    return full.trim();
  }
}

module.exports = { PROVIDER_LABELS, chatCompletion, extractReply };
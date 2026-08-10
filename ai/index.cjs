/**
 * ai/index.cjs
 * ------------
 * Public facade for the Compilator AI Context System.
 *
 * Usage:
 *   const { createAssistant } = require('./ai/index.cjs');
 *   const assistant = createAssistant({ app });
 *   const result = await assistant.ask('Install Git', {
 *     installedPackages,
 *     activeTasksCount,
 *     reportsCount,
 *     onChunk: (chunk, full) => webContents.send('chat:chunk', {requestId, chunk, full}),
 *   });
 *
 * This wires the modular pipeline together:
 *   User → Intent Detection → AI Context Builder → Prompt Builder
 *        → Provider (Ollama/LM Studio/OpenAI/OpenRouter/Custom)
 *        → Response (streaming or full) → parser
 */

const { loadAIConfig } = require('./config.cjs');
const { detectIntent } = require('./intent-detector.cjs');
const { buildAIContext } = require('./context-builder.cjs');
const { buildAISystemPrompt } = require('./prompt-builder.cjs');
const { chatCompletion } = require('./provider.cjs');

/**
 * Best-effort parse of the model's reply as planner JSON.
 * Tolerates markdown fences and surrounding text.
 * @param {string} reply
 * @returns {object|null}
 */
function extractPlannerJson(reply) {
  const text = String(reply || '').trim();
  const tryParse = (s) => {
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === 'object') return obj;
    } catch {}
    return null;
  };

  const direct = tryParse(text);
  if (direct) return direct;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return tryParse(fenced[1].trim());

  const braced = text.match(/\{[\s\S]*\}/);
  if (braced) return tryParse(braced[0]);

  return null;
}

/**
 * Create a reusable AI assistant bound to an Electron App instance.
 *
 * @param {{ app?: import('electron').App }} [deps]
 * @returns {{ ask: (message: string, opts?: object) => Promise<object> }}
 */
function createAssistant({ app } = {}) {
  /**
   * Process one user message through the full pipeline.
   *
   * @param {string} message
   * @param {object} [opts]
   * @param {Array}  [opts.installedPackages]
   * @param {number} [opts.activeTasksCount]
   * @param {number} [opts.reportsCount]
   * @param {(chunk:string, full:string)=>void} [opts.onChunk]
   * @param {AbortSignal} [opts.signal]
   */
  async function ask(message, opts = {}) {
    const {
      installedPackages = [],
      activeTasksCount = 0,
      reportsCount = 0,
      onChunk,
      signal,
    } = opts;

    // 1. Intent detection (never send to provider before knowing intent)
    const intentResult = detectIntent(message);
    const intent = intentResult.intent;

    // 2. Context builder — assembles runtime info relevant to this message
    const context = await buildAIContext({
      message,
      intent,
      installedPackages,
      activeTasksCount,
      reportsCount,
      app,
    });

    // 3. Dynamically build the system prompt for this intent
    const systemPrompt = buildAISystemPrompt(context, intent);

    // 4. Call provider with streaming support
    const config = loadAIConfig({ app });
    let reply = '';
    try {
      reply = await chatCompletion({
        config,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        onChunk,
        signal,
      });
    } catch (err) {
      return { success: false, intent, error: err.message, reply: '' };
    }

    // 5. For TASK intent, try to parse planner JSON from the reply.
    //    Falls back to the built-in planner if parsing fails.
    if (intent === 'TASK') {
      const plan = extractPlannerJson(reply);
      return { success: true, intent, reply, plan, systemContext: context };
    }

    // CHAT / UNKNOWN — natural conversational reply, never a task plan.
    return {
      success: true,
      intent,
      reply: reply.trim() || "Hello! How can I help you today?",
      systemContext: context,
    };
  }

  return { ask };
}

module.exports = { createAssistant, extractPlannerJson };
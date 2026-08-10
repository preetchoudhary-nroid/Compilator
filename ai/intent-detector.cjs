/**
 * ai/intent-detector.cjs
 * ----------------------
 * Intent detection for Compilator's AI layer.
 *
 * Classifies every user message as exactly one of:
 *   CHAT    — conversation, questions, explanations. Never a task.
 *   TASK    — a computer-action request (mkdir / winget_install /
 *             winget_list / write_file).
 *   UNKNOWN — unclear; the assistant should ask one short question.
 *
 * Also exposes a light topic classifier so the Context Builder can decide
 * which sections of runtime context are relevant to the current message
 * (hardware, installed software, capabilities, etc.).
 */

const TASK_MARKERS = {
  mkdir: [
    /\b(mkdir|make dir(?:ectory)?|create (?:a |the )?folder|create (?:a |the )?directory|make (?:a |the )?folder|make (?:a |the )?directory|new folder|new directory)\b/i,
  ],
  winget_install: [
    /\binstall\b/i,
    /\bset up\b/i,
    /\bprepare\b.*\b(pc|computer|dev|environment)\b/i,
    /\bready\b.*\b(pc|computer|dev|environment)\b/i,
  ],
  winget_list: [
    /\blist (?:installed |all )?packages?\b/i,
    /\bwhat('?s| is) installed\b/i,
    /\bwhat packages?.*\b/i,
  ],
  write_file: [
    /\b(write|create|save|generate|make)\b.*\b(file|readme|config)\b/i,
    /\b(write|create|save|generate)\s+(?:a |the )?file\b/i,
  ],
};

/** Parse every drive the user mentions (C:/, C:\, /path/...) and return paths. */
function extractRelevantPaths(request) {
  const paths = [];
  const driveRe = /([A-Za-z]:[\\/][^\\/][^\s,;]*)/g;
  let m;
  while ((m = driveRe.exec(request))) {
    paths.push(m[1]);
  }
  return paths;
}

/** Words/phrases that turn even an "install"-looking phrase into chat. */
const CHAT_OVERRIDES = [
  /\bhow do i install\b/i,
  /\bwhat is install\b/i,
  /\bhow to install\b/i,
  /\bshould i install\b/i,
  /\brecommend.*install\b/i,
  /\buninstall\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bdon'?t want (?:to )?(?:install|delete|remove|set ?up)\b/i,
  /\bnot (?:to )?install\b/i,
  /\bdon'?t install\b/i,
  /\bnever mind\b/i,
  /(?:please )?\bcancel\b/i,
  /\bchange(?:d)? my mind\b/i,
  /\bmodify registry\b/i,
  /\bdisable antivirus\b/i,
];

/**
 * Classify a user message into CHAT / TASK / UNKNOWN.
 *
 * @param {string} userMessage
 * @returns {{ intent: 'CHAT'|'TASK'|'UNKNOWN', taskType?: string, paths?: string[] }}
 */
function detectIntent(userMessage) {
  const text = (userMessage || '').trim();
  if (!text) return { intent: 'UNKNOWN' };

  // Pure greeting / polite opening — always chat.
  if (/^(hi|hiii+|hello|hey|good (morning|afternoon|evening)|yo|sup|how are you)\b/i.test(text)) {
    return { intent: 'CHAT' };
  }

  // Any of these phrases makes the message conversational even if it
  // contains the word "install".
  for (const re of CHAT_OVERRIDES) {
    if (re.test(text)) return { intent: 'CHAT' };
  }

  // Simple yes/no or question-only sentences stay chat.
  if (/^[^a-z0-9]*(do you|can you|will you|would you|are you|is it|are there)[^a-z0-9]*$/i.test(text)) {
    return { intent: 'CHAT' };
  }

  // TASK — run through each marker; first match wins.
  for (const [taskType, markers] of Object.entries(TASK_MARKERS)) {
    for (const re of markers) {
      if (re.test(text)) {
        return { intent: 'TASK', taskType, paths: extractRelevantPaths(text) };
      }
    }
  }

  return { intent: 'UNKNOWN' };
}

/** Topic buckets used by the Context Builder to trim the system prompt. */
const TOPIC_MARKERS = {
  hardware: [
    /\b(cpu|processor|gpu|graphics|ram|memory|disk|drive|storage|hardware|specs?|system info)\b/i,
    /\b(rtx|gtx|radeon|geforce|core i[3579]|ryzen|intel|amd|nvidia)\b/i,
  ],
  software: [
    /\b(installed|install|package|winget|app|program|software)\b/i,
    /\b(git|python|node|visual studio|vscode|chrome|docker)\b/i,
  ],
  internet: [/\b(offline|online|internet|network|wifi|web)\b/i],
  capabilities: [
    /\b(can you|do you support|capab|feature|ability|able to|limitation|what can)\b/i,
    /\b(compilator|assistant|planner|task)\b/i,
  ],
  report: [/\b(report|log|terminal|history|execution)\b/i],
  genericQuestion: [/\b(who|what|when|where|why|how|which|is|are|can|do)\b/i],
};

/**
 * Decide which context sections are relevant for a given message.
 *
 * @param {string} message
 * @returns {string[]}
 */
function classifyTopics(message) {
  const text = (message || '').toLowerCase();
  const topics = new Set(['identity', 'runtime', 'responseRules']);
  for (const [topic, markers] of Object.entries(TOPIC_MARKERS)) {
    for (const re of markers) {
      if (re.test(text)) {
        topics.add(topic);
        break;
      }
    }
  }
  return [...topics];
}

module.exports = { CHAT_OVERRIDES, TASK_MARKERS, classifyTopics, detectIntent };
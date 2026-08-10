/**
 * ai/prompt-builder.cjs
 * ---------------------
 * Builds the system prompt dynamically for each request from the runtime
 * context assembled by the Context Builder.
 *
 * The prompt is trimmed per request — only sections relevant to the current
 * intent / topics are included so small local models aren't flooded with
 * unrelated context. Identity, runtime and response rules are always
 * included; hardware, installed software and planner details are added only
 * when the message needs them.
 */

// Intro block — always present.
function identityBlock(ctx) {
  return [
    ctx.identity.statement,
    '',
    `Compilator version ${ctx.identity.version}.`,
    'You answer questions and, when the user wants a computer task, you produce a structured task plan in JSON.',
  ].join('\n');
}

// Runtime + capabilities + limitations — always present (short).
function runtimeBlock(ctx) {
  const r = ctx.runtime;
  const lines = [
    '## Current runtime',
    `Provider: ${r.provider}`,
    `Model: ${r.model}`,
    `Execution mode: ${r.executionMode} (${r.internetAvailable ? 'internet available' : 'offline'})`,
  ];
  if (ctx.capabilities) {
    lines.push('', '## What Compilator can do');
    lines.push(ctx.capabilities.list.map((c) => `✓ ${c}`).join('\n'));
  }
  if (ctx.limitations && ctx.limitations.length) {
    lines.push('', '## Limitations (you cannot)');
    lines.push(ctx.limitations.map((l) => `- ${l}`).join('\n'));
  }
  return lines.join('\n');
}

// Hardware block — only when the user asked about hardware.
function hardwareBlock(ctx) {
  const s = ctx.system;
  if (!s) return '';
  const gpu = s.gpu && s.gpu.length ? s.gpu.join(', ') : 'not detected';
  const disk = s.disk && s.disk.length
    ? s.disk.map((d) => `${d.drive} (${d.freeGB ?? '?'} GB free / ${d.totalGB ?? '?'} GB)`).join(', ')
    : 'not detected';
  return [
    '## Detected hardware',
    `OS: ${s.os.platform} ${s.os.version} (${s.os.arch})`,
    `CPU: ${s.cpu.model} — ${s.cpu.cores} cores @ ${s.cpu.speedGHz ?? '?'} GHz`,
    `GPU: ${gpu}`,
    `RAM: ${s.ram.totalGB} GB total, ${s.ram.freeGB} GB free`,
    `Disk: ${disk}`,
    'Answer specifically for this hardware. Do not dump generic specs.',
  ].join('\n');
}

// Installed software block — only when software topic / TASK intent.
function softwareBlock(ctx) {
  const sw = ctx.installedSoftware;
  if (!sw) return '';
  const lines = ['## Installed software (relevant to this conversation)'];
  if (sw.relevant && sw.relevant.length) {
    lines.push(sw.relevant.map((p) => `- ${p.name} (${p.id}) v${p.version}`).join('\n'));
  } else if (sw.note) {
    lines.push(`- ${sw.note}`);
  }
  lines.push(`(${sw.total} packages total.)`);
  return lines.join('\n');
}

// TASK-only block — full planner contract.
function plannerBlock(ctx) {
  const p = ctx.planner || {};
  const e = ctx.execution || {};
  const allowed = (p.allowed || []).join(', ');
  return [
    '## Task planning rules',
    'Only plan when the user wants something changed on their computer. Never plan for pure conversation.',
    `Allowed task types: ${allowed}`,
    `Maximum ${p.maxTasks} tasks per plan.`,
    `Verified winget IDs only: ${(p.wingetIds || []).join(', ')}. Unknown packages → tasks_skipped.`,
    'For winget_install: if already installed, set status="already_installed" and estimated_seconds=0.',
    '',
    'TASK reply — output ONLY this JSON (never markdown, never extra text):',
    '{"tasks":[...],"tasks_skipped":[...]}',
    '',
    `Execution requires user approval: ${e.requiresApproval}. You never execute — you only plan.`,
    '',
    'CHAT / UNKNOWN reply — natural conversational text only. Never output JSON.',
  ].join('\n');
}

function responseRulesBlock() {
  return [
    '## Response style',
    'Be concise — default maximum 120 words.',
    'Only give long explanations when the user explicitly asks for detail.',
    'Never produce generic tutorials.',
    'Never explain every GPU or CPU — only what is relevant to the user.',
    'Behave like a friendly desktop assistant, not a command interpreter.',
  ].join('\n');
}

const PLANNER_ONLY_INPUTS = [
  'Planner instructions begin now.',
  '',
  'Task planner rules apply.',
];

/**
 * Build the complete system prompt for one request.
 *
 * @param {object} ctx — output of buildAIContext
 * @param {'CHAT'|'TASK'|'UNKNOWN'} intent
 * @returns {string}
 */
function buildAISystemPrompt(ctx, intent) {
  const parts = [identityBlock(ctx), '', runtimeBlock(ctx)];

  if (intent === 'TASK') {
    parts.push(plannerBlock(ctx));
    // For a TASK request, include software context so the model can decide
    // already-installed correctly.
    parts.push(softwareBlock(ctx));
  } else if (intent === 'UNKNOWN') {
    parts.push(
      'Ask exactly one short clarifying question to determine whether the user wants conversation or a computer task.'
    );
  }

  // Hardware context — only when relevant.
  if (intent !== 'TASK' && ctx.system) {
    parts.push(hardwareBlock(ctx));
  }

  parts.push(responseRulesBlock());

  return parts.filter(Boolean).join('\n\n');
}

module.exports = { buildAISystemPrompt, PLANNER_ONLY_INPUTS };
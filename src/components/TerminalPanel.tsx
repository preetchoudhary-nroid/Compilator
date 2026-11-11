import { useEffect, useRef, useState } from 'react';

interface TerminalPanelProps {
  logs: Array<{ id: string; line: string }>;
}

/**
 * Full-view terminal panel for the Terminal sidebar section.
 * Shows all task logs in a scrollable terminal-style view with
 * a command input that sends requests to the AI chat.
 */
export default function TerminalPanel({ logs }: TerminalPanelProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const [commandInput, setCommandInput] = useState('');
  const [localLines, setLocalLines] = useState<string[]>([
    'Compilator Terminal v1.0',
    'Type a command or task description below.',
    '─────────────────────────────────────────',
    '',
  ]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [logs, localLines]);

  const handleCommand = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && commandInput.trim()) {
      setLocalLines(prev => [...prev, `Preet@Compilator:~$ ${commandInput}`, '']);
      // The parent will handle sending this as a chat/task request
      const event = new CustomEvent('terminal-command', { detail: commandInput });
      window.dispatchEvent(event);
      setCommandInput('');
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Terminal</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="add-task-btn"
            onClick={() => setLocalLines(['Compilator Terminal v1.0', ''])}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
          >
            Clear
          </button>
        </div>
      </div>

      <div
        ref={termRef}
        style={{
          flex: 1, background: '#0b0c10', borderRadius: '8px', border: '1px solid #1f2129',
          padding: '1rem', fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
          fontSize: '0.85rem', color: '#e2e8f0', overflowY: 'auto', lineHeight: 1.6,
        }}
      >
        {/* Static lines */}
        {localLines.map((line, i) => (
          <div key={`local-${i}`} style={{ whiteSpace: 'pre-wrap' }}>{line}</div>
        ))}
        {/* Live task logs */}
        {logs.map((l, i) => (
          <div key={`log-${i}`} style={{ whiteSpace: 'pre-wrap', color: '#a5b4fc' }}>
            {l.line}
          </div>
        ))}
        {/* Input line */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '0.5rem' }}>
          <span style={{ color: '#4ade80', marginRight: '0.5rem' }}>Preet@Compilator:~$</span>
          <input
            type="text"
            value={commandInput}
            onChange={e => setCommandInput(e.target.value)}
            onKeyDown={handleCommand}
            style={{
              flex: 1, background: 'transparent', color: '#e2e8f0', border: 'none',
              outline: 'none', fontFamily: 'inherit', fontSize: 'inherit',
            }}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}


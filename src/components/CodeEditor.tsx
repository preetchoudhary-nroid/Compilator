import { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';

interface CodeEditorProps {
  onRunScript?: (code: string, language: string) => void;
}

export default function CodeEditor({ onRunScript }: CodeEditorProps) {
  const [fileName, setFileName] = useState('untitled.py');
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('# Write your code here\nprint("Hello from Compilator!")\n');
  const [saved, setSaved] = useState(false);
  const editorRef = useRef<any>(null);

  const LANGUAGES = [
    { value: 'python', label: 'Python', ext: '.py' },
    { value: 'javascript', label: 'JavaScript', ext: '.js' },
    { value: 'typescript', label: 'TypeScript', ext: '.ts' },
    { value: 'powershell', label: 'PowerShell', ext: '.ps1' },
    { value: 'json', label: 'JSON', ext: '.json' },
    { value: 'markdown', label: 'Markdown', ext: '.md' },
    { value: 'html', label: 'HTML', ext: '.html' },
    { value: 'css', label: 'CSS', ext: '.css' },
    { value: 'plaintext', label: 'Plain Text', ext: '.txt' },
  ];

  const handleEditorMount = (editor: any) => {
    editorRef.current = editor;
    editor.focus();
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    const found = LANGUAGES.find(l => l.value === lang);
    if (found) {
      const baseName = fileName.replace(/\.[^.]+$/, '');
      setFileName(baseName + found.ext);
    }
  };

  const handleRun = () => {
    if (onRunScript && (language === 'python' || language === 'powershell')) {
      onRunScript(code, language);
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ margin: 0 }}>Code Editor</h2>
          <input
            type="text"
            value={fileName}
            onChange={e => setFileName(e.target.value)}
            style={{
              background: '#15171e', color: '#fff', border: '1px solid #2a2d39',
              borderRadius: '6px', padding: '0.4rem 0.8rem', fontSize: '0.85rem', width: '200px',
            }}
          />
          <select
            value={language}
            onChange={e => handleLanguageChange(e.target.value)}
            className="model-select"
            style={{ padding: '0.4rem', fontSize: '0.85rem' }}
          >
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(language === 'python' || language === 'powershell') && (
            <button className="add-task-btn" onClick={handleRun} style={{ background: '#4ade80', color: '#000' }}>
              ▶ Run
            </button>
          )}
          <button className="add-task-btn" onClick={handleSave}>
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', border: '1px solid #1f2129' }}>
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={(val) => setCode(val || '')}
          onMount={handleEditorMount}
          theme="vs-dark"
          options={{
            fontSize: 14,
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 16 },
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            automaticLayout: true,
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}


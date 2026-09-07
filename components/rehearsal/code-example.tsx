'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CodeExample({
  name,
  children,
}: {
  name: string;
  children: string;
}) {
  const [status, setStatus] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setStatus('Copied to clipboard.');
    } catch {
      setStatus(
        'Clipboard access is unavailable. Select the commands below to copy them.',
      );
    }
  }
  return (
    <div className="code-example">
      <div className="code-heading">
        <span>{name}</span>
        <button aria-label={`Copy ${name}`} onClick={() => void copy()}>
          {status === 'Copied to clipboard.' ? (
            <Check size={13} />
          ) : (
            <Copy size={13} />
          )}{' '}
          Copy
        </button>
      </div>
      <output className="copy-status">
        {status}
      </output>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}

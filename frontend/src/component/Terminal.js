import React, { useEffect, useRef } from 'react';
import './Terminal.css';

const Terminal = ({ history, interim, status, isListening, onToggleListen, jarvisTyping }) => {
  const bottomRef = useRef(null);

  // Auto-scroll to bottom whenever content changes
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, interim, jarvisTyping]);

  // Aggregate all possible log lines in display sequence
  const allLines = [];

  history.forEach((line, idx) => {
    allLines.push({
      key: `hist-${idx}`,
      className: `hud-log-line ${line.startsWith('J.A.R.V.I.S.:') ? 'jarvis-line' : line.startsWith('USER:') ? 'user-line' : 'sys-line'}`,
      dollar: line.startsWith('J.A.R.V.I.S.:') ? '>' : '$',
      content: <span>{line}</span>
    });
  });

  if (interim && !jarvisTyping) {
    allLines.push({
      key: 'interim',
      className: 'hud-log-line user-line live-input',
      dollar: '$',
      content: <span>{interim}<span className="cursor">_</span></span>
    });
  }

  if (jarvisTyping) {
    allLines.push({
      key: 'typing',
      className: 'hud-log-line jarvis-line jarvis-active',
      dollar: '>',
      content: <span>J.A.R.V.I.S.: {jarvisTyping}<span className="cursor blink">_</span></span>
    });
  }

  if (!interim && !jarvisTyping) {
    allLines.push({
      key: 'status',
      className: 'hud-log-line sys-line',
      dollar: '$',
      content: <span className="status-pulse">[ {status} ]</span>
    });
  }

  // Maximize the lines displayed on the system log to exactly 3 (pad if less)
  const visibleLines = [...allLines].slice(-3);
  while (visibleLines.length < 3) {
    visibleLines.unshift({
      key: `pad-${visibleLines.length}`,
      className: 'hud-log-line pad-line sys-line',
      dollar: '\u00A0',
      content: <span>{"\u00A0"}</span>
    });
  }

  return (
    <div className="jarvis-hud-bar" onClick={onToggleListen}>
      <div className="hud-header">
        SYSTEM_LOG // J.A.R.V.I.S.
      </div>
      <div className="hud-body hud-body-scroll">
        {visibleLines.map((line, idx) => (
          <div key={`${line.key}-${idx}`} className={line.className}>
            <span className="dollar">{line.dollar}</span>
            {line.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default Terminal;


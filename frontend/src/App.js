import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import Navbar from './component/Navbar';
import MicReactiveBlob from './component/blob';
import Terminal from './component/Terminal';
import StatusPanel from './component/StatusPanel';
import Widgets from './component/Widgets';

// ── Greeting based on time of day and gender ─────────────────
function getGreetingForGender(gender) {
  const g = (gender || 'male').toLowerCase();
  if (g === 'other' || g === 'others') {
    return "SYSTEM ACTIVE, THEM";
  }
  const h = new Date().getHours();
  let timeGreet = "";
  if (h < 12) timeGreet = "Good Morning";
  else if (h < 17) timeGreet = "Good Afternoon";
  else timeGreet = "Good Evening";

  if (g === 'female') {
    return `${timeGreet}, Ma'am`;
  }
  return `${timeGreet}, Sir`;
}

function App() {
  const [blobConfig, setBlobConfig] = useState({
    color: '#e27927',
    size: 250,
    sensitivity: 1.5,
  });

  const [gender, setGender] = useState(() => {
    return localStorage.getItem('jarvis-gender') || null;
  });

  const [showInitAlert, setShowInitAlert]   = useState(true);
  const [isBlobSettingsOpen, setIsBlobSettingsOpen] = useState(false);
  const [isDraggingMode, setIsDraggingMode] = useState(false);

  const [isListening, setIsListening]               = useState(false);
  const [speechStatus, setSpeechStatus]             = useState("SYSTEM OFFLINE");
  const [transcriptHistory, setTranscriptHistory]   = useState([]);
  const [currentTranscript, setCurrentTranscript]   = useState("");  // live user speech
  const [jarvisTyping, setJarvisTyping]             = useState("");  // JARVIS response typing
  const [apiConnected, setApiConnected]             = useState(false);
  const [greeting, setGreeting]                     = useState(() => getGreetingForGender(gender));

  const genderRef = useRef(gender);
  useEffect(() => {
    genderRef.current = gender;
  }, [gender]);

  // ── Refs ──────────────────────────────────────────────────
  const isProcessingRef    = useRef(false);
  const isListeningRef     = useRef(false);
  const currentAudioRef    = useRef(null);
  const isInterruptedRef   = useRef(false);
  
  // SpeechRecognition refs
  const recognitionRef     = useRef(null);
  const recognitionActiveRef = useRef(false);
  const textSentRef        = useRef(false);
  const silenceTimeoutRef  = useRef(null);
  const currentTranscriptRef = useRef("");
  const accumulatedTranscriptRef = useRef("");
  
  // Robust silence detection
  const silenceCheckIntervalRef = useRef(null);
  const lastSpeechTimeRef = useRef(Date.now());

  // Text input state
  const [textInput, setTextInput] = useState("");

  // Tracks windows opened via window.open() for remote clients
  const openedWindowsRef   = useRef([]);
  // Double-clap detection
  const audioClapCtxRef    = useRef(null);
  const clapAnalyserRef    = useRef(null);
  const clapListeningRef   = useRef(true); // clap detection always on

  // Keep isListeningRef in sync
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Update greeting every minute
  useEffect(() => {
    setGreeting(getGreetingForGender(gender));
    const timer = setInterval(() => setGreeting(getGreetingForGender(gender)), 60000);
    return () => clearInterval(timer);
  }, [gender]);

  // ── Backend ping ───────────────
  useEffect(() => {
    const checkBackend = () => {
      fetch(`http://${window.location.hostname}:5001/api/status`)
        .then(res => res.ok ? setApiConnected(true) : setApiConnected(false))
        .catch(() => setApiConnected(false));
    };
    checkBackend();
    const pingInterval = setInterval(checkBackend, 5000);

    return () => {
      clearInterval(pingInterval);
      if (recognitionRef.current && recognitionActiveRef.current) {
        recognitionRef.current.stop();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Double-Clap Wake Word via AudioContext ────────────────
  useEffect(() => {
    let animFrameId;
    let stream;

    const startClapDetection = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
        const source    = audioCtx.createMediaStreamSource(stream);
        const analyser  = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        audioClapCtxRef.current  = audioCtx;
        clapAnalyserRef.current  = analyser;

        const dataArray   = new Uint8Array(analyser.fftSize);
        let lastClapTime  = 0;
        let clapCount     = 0;
        let isClapActive  = false;

        const CLAP_THRESHOLD  = 150;   // volume spike threshold (0–255)
        const CLAP_COOLDOWN   = 150;   // min ms between two individual claps
        const DOUBLE_CLAP_WIN = 800;   // window for 2nd clap after 1st (ms)
        const COOLDOWN_AFTER  = 1500;  // ignore claps right after trigger

        const detect = () => {
          animFrameId = requestAnimationFrame(detect);
          if (!clapListeningRef.current) return;

          analyser.getByteTimeDomainData(dataArray);
          const peak = Math.max(...dataArray);
          const now  = Date.now();

          if (peak > CLAP_THRESHOLD && !isClapActive) {
            isClapActive = true;
            const timeSinceLast = now - lastClapTime;

            if (timeSinceLast > CLAP_COOLDOWN && timeSinceLast < DOUBLE_CLAP_WIN && clapCount === 1) {
              // Second clap — trigger!
              clapCount = 0;
              
              if (!genderRef.current) {
                console.log("[JARVIS] Onboarding profile required. Ignoring clap activation.");
                return;
              }

              clapListeningRef.current = false;
              console.log("[JARVIS] Double-clap detected — toggling listen.");
              unlockAudio();
              setShowInitAlert(false);
              toggleListeningByClap();
              setTimeout(() => { clapListeningRef.current = true; }, COOLDOWN_AFTER);
            } else if (timeSinceLast > DOUBLE_CLAP_WIN || clapCount === 0) {
              // First clap (or reset)
              clapCount = 1;
              lastClapTime = now;
            }

            setTimeout(() => { isClapActive = false; }, 100);
          }
        };

        detect();
      } catch (err) {
        console.warn("[JARVIS] Clap detection unavailable:", err.message);
      }
    };

    startClapDetection();

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (audioClapCtxRef.current) audioClapCtxRef.current.close().catch(() => {});
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Spacebar toggle & interruption ────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        
        if (!gender) return;

        unlockAudio();
        setShowInitAlert(false);

        if (currentAudioRef.current) {
          isInterruptedRef.current = true;
          currentAudioRef.current.pause();
          currentAudioRef.current = null;
          updateTranscript("[ INTERRUPTED ]");
          setTimeout(() => resumeListening(), 500);
          return;
        }
        toggleListening();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening, gender]);

  const handleSelectGender = (selected) => {
    localStorage.setItem('jarvis-gender', selected);
    setGender(selected);
    unlockAudio();
    setShowInitAlert(false);
  };

  // ── Helpers ───────────────────────────────────────────────

  const updateTranscript = (val) => {
    setCurrentTranscript(val);
    currentTranscriptRef.current = val;
  };

  const unlockAudio = () => {
    const silent = new Audio("data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq");
    silent.play().catch(() => {});
  };

  const resumeListening = () => {
    isProcessingRef.current = false;
    updateTranscript("");
    if (isListeningRef.current) {
      startListening();
    } else {
      setSpeechStatus("SYSTEM OFFLINE [ PRESS SPACE OR CLAP TWICE ]");
    }
  };

  const startListening = () => {
    isListeningRef.current = true;
    setIsListening(true);
    setSpeechStatus("LISTENING... SPEAK YOUR COMMAND");
    updateTranscript("");
    textSentRef.current = false;
    accumulatedTranscriptRef.current = "";
    lastSpeechTimeRef.current = Date.now();

    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
    }

    // Robust silence checker: runs every 500ms
    silenceCheckIntervalRef.current = setInterval(() => {
      if (!isListeningRef.current) {
        clearInterval(silenceCheckIntervalRef.current);
        return;
      }
      
      const timeSinceLastSpeech = Date.now() - lastSpeechTimeRef.current;
      const hasText = currentTranscriptRef.current && currentTranscriptRef.current.trim().length > 0;

      if (hasText && timeSinceLastSpeech > 3500) {
        // Waited 3.5 seconds after they finished speaking -> Auto submit!
        clearInterval(silenceCheckIntervalRef.current);
        stopListening();
      } else if (!hasText && timeSinceLastSpeech > 8000) {
        // Waited 8 seconds but they said nothing -> Go back to standby
        console.log("[JARVIS] No speech detected for 8 seconds. Standby.");
        clearInterval(silenceCheckIntervalRef.current);
        stopListening();
      }
    }, 500);

    startListeningSession();
  };

  const startListeningSession = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechStatus("ERROR: SPEECH RECOGNITION NOT SUPPORTED");
      setIsListening(false);
      isListeningRef.current = false;
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        recognitionActiveRef.current = true;
      };

      rec.onresult = (event) => {
        let sessionText = "";
        for (let i = 0; i < event.results.length; ++i) {
          sessionText += event.results[i][0].transcript;
        }

        const totalText = (accumulatedTranscriptRef.current + " " + sessionText).trim();

        if (totalText) {
          updateTranscript(totalText);
          lastSpeechTimeRef.current = Date.now();
        }
      };

      rec.onerror = (e) => {
        console.error("Speech recognition error", e);
        if (e.error === 'no-speech') {
          // Ignore no-speech errors and let onend restart hook handle it
          return;
        }
        if (e.error !== 'aborted') {
          setSpeechStatus(`ERROR: ${e.error.toUpperCase()}`);
          setIsListening(false);
          isListeningRef.current = false;
        }
      };

      rec.onend = () => {
        recognitionActiveRef.current = false;
        if (textSentRef.current || !isListeningRef.current) {
          return;
        }

        // Store what we've heard so far, and restart the recognition loop
        accumulatedTranscriptRef.current = currentTranscriptRef.current;
        console.log("[JARVIS] Speech recognition session ended prematurely. Restarting session...");
        
        setTimeout(() => {
          if (isListeningRef.current && !textSentRef.current) {
            startListeningSession();
          }
        }, 80);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.error("Failed to start SpeechRecognition session:", err);
      if (!accumulatedTranscriptRef.current) {
        setSpeechStatus("ERROR: INITIALIZATION FAILED");
        setIsListening(false);
        isListeningRef.current = false;
      }
    }
  };

  const stopListening = () => {
    isListeningRef.current = false;
    setIsListening(false);
    
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    
    if (recognitionRef.current && recognitionActiveRef.current) {
      const finalSpeech = currentTranscriptRef.current;
      if (finalSpeech && !textSentRef.current) {
        textSentRef.current = true;
        processTextCommand(finalSpeech);
      }
      try { recognitionRef.current.stop(); } catch(e) {}
    } else {
      const finalSpeech = currentTranscriptRef.current;
      if (finalSpeech && !textSentRef.current) {
        textSentRef.current = true;
        processTextCommand(finalSpeech);
      }
    }
    setSpeechStatus("PROCESSING...");
  };

  const toggleListening = () => {
    unlockAudio();
    if (isListeningRef.current) stopListening();
    else startListening();
  };

  const toggleListeningByClap = () => {
    unlockAudio();
    if (isListeningRef.current) stopListening();
    else startListening();
  };



  // Handle tool calls from the backend for remote (non-Mac) clients
  const handleFrontendToolCall = (toolCall) => {
    const { name, arguments: args } = toolCall;
    try {
      if (name === "open_website") {
        for (const url of (args.urls || [])) {
          const formatted = url.startsWith('http') ? url : `https://${url}`;
          const win = window.open(formatted, '_blank');
          if (win) {
            openedWindowsRef.current.push({ url: url.toLowerCase(), ref: win });
          }
        }
      } else if (name === "close_specific_website") {
        const targets = (args.websiteNames || []).map(s => s.toLowerCase());
        openedWindowsRef.current = openedWindowsRef.current.filter(item => {
          const shouldClose = targets.some(t => item.url.includes(t));
          if (shouldClose && item.ref && !item.ref.closed) item.ref.close();
          return !shouldClose;
        });
      } else if (name === "close_chrome_tabs") {
        let n = args.count || 1;
        const list = [...openedWindowsRef.current];
        while (n-- > 0 && list.length > 0) {
          const item = list.pop();
          if (item?.ref && !item.ref.closed) item.ref.close();
        }
        openedWindowsRef.current = list;
      }
    } catch (err) {
      console.error("[JARVIS] Frontend tool error:", err);
    }
  };

  // ── Main text command processing ──────────────────────────
  const processTextCommand = async (text) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current  = true;
    isInterruptedRef.current = false;
    updateTranscript(text);
    setJarvisTyping('...');

    try {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      const response = await fetch(`http://${window.location.hostname}:5001/api/process-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          isLocal: isLocal,
          gender: genderRef.current || 'male'
        })
      });

      if (!response.ok) {
        let errMsg = 'BACKEND UPLINK FAILED';
        try { const d = await response.json(); if (d.error) errMsg = d.error; } catch(e) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      const userText   = text.toUpperCase();
      const fullText   = (data.jarvisText || '').toUpperCase();
      const audioUrl   = data.audioBase64;

      setTranscriptHistory(prev => [...prev, `USER: ${userText}`]);

      // Remote device: execute ALL tool calls in browser
      if (!isLocal) {
        const toolCalls = data.toolCalls || (data.toolCall ? [data.toolCall] : []);
        for (const tc of toolCalls) {
          handleFrontendToolCall(tc);
        }
      }

      // ── Start typing animation IMMEDIATELY (don't wait for audio) ──
      setJarvisTyping('');
      let charIndex = 0;
      const CHAR_DELAY = 20; // ms per character — fast and responsive

      const typingInterval = setInterval(() => {
        if (isInterruptedRef.current) { clearInterval(typingInterval); return; }
        if (charIndex <= fullText.length) {
          setJarvisTyping(fullText.substring(0, charIndex));
          charIndex++;
        } else {
          clearInterval(typingInterval);
        }
      }, CHAR_DELAY);

      // ── Play audio ──
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onended = () => {
        if (isInterruptedRef.current) return;
        clearInterval(typingInterval);
        setJarvisTyping('');
        setTranscriptHistory(prev => [...prev, `J.A.R.V.I.S.: ${fullText}`]);
        currentAudioRef.current = null;
        resumeListening();
      };

      audio.onerror = () => {
        clearInterval(typingInterval);
        // Even if audio fails, show the text and continue
        setJarvisTyping('');
        setTranscriptHistory(prev => [...prev, `J.A.R.V.I.S.: ${fullText}`]);
        resumeListening();
      };

      audio.play().catch(err => {
        console.error('Audio playback error:', err);
        // Fallback: finish typing then resume
        setTimeout(() => {
          clearInterval(typingInterval);
          setJarvisTyping('');
          setTranscriptHistory(prev => [...prev, `J.A.R.V.I.S.: ${fullText}`]);
          resumeListening();
        }, fullText.length * CHAR_DELAY + 500);
      });

    } catch (err) {
      console.error('[JARVIS] processTextCommand error:', err);
      let displayError = err.message.toUpperCase();
      if (displayError.length > 60) displayError = displayError.substring(0, 57) + '...';
      setJarvisTyping('');
      setTranscriptHistory(prev => [...prev, `[ ERROR: ${displayError} ]`]);
      setTimeout(() => resumeListening(), 1000);
    }
  };

  // ── Handle text input submission ──────────────────────────
  const handleTextSubmit = (e) => {
    e.preventDefault();
    const trimmed = textInput.trim();
    if (!trimmed || isProcessingRef.current) return;
    setTextInput("");
    // Stop listening if active
    if (isListeningRef.current) {
      isListeningRef.current = false;
      setIsListening(false);
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      if (recognitionRef.current && recognitionActiveRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }
      textSentRef.current = true;
    }
    processTextCommand(trimmed);
  };

  // ─────────────────────────────────────────────────────────
  return (
    <div className="jarvis-container">
      <div className="scanline"></div>
      <div className="vignette"></div>

      <Navbar
        onToggleSettings={() => setIsBlobSettingsOpen(!isBlobSettingsOpen)}
        onToggleDrag={() => setIsDraggingMode(!isDraggingMode)}
        isDraggingMode={isDraggingMode}
      />

      {isBlobSettingsOpen && (
        <div className="settings-modal">
          <div className="settings-modal-header">
            <h3>HUD Configuration</h3>
            <button className="btn-close" onClick={() => setIsBlobSettingsOpen(false)}>×</button>
          </div>
          <div className="settings-group">
            <label>Core Color:</label>
            <input type="color" value={blobConfig.color}
              onChange={(e) => setBlobConfig({...blobConfig, color: e.target.value})} />
          </div>
          <div className="settings-group">
            <label>Core Radius:</label>
            <input type="range" min="100" max="400" value={blobConfig.size}
              onChange={(e) => setBlobConfig({...blobConfig, size: Number(e.target.value)})} />
          </div>
          <div className="settings-group">
            <label>Audio Sensitivity:</label>
            <input type="range" min="0.5" max="3.0" step="0.1" value={blobConfig.sensitivity}
              onChange={(e) => setBlobConfig({...blobConfig, sensitivity: Number(e.target.value)})} />
          </div>
          <div className="settings-group">
            <label>Operator Gender:</label>
            <select 
              value={gender || 'male'} 
              onChange={(e) => {
                const newGender = e.target.value;
                setGender(newGender);
                localStorage.setItem('jarvis-gender', newGender);
              }}
              style={{
                background: 'rgba(10, 20, 30, 0.8)',
                border: '1px solid rgba(0, 229, 255, 0.4)',
                color: '#00e5ff',
                padding: '10px',
                borderRadius: '8px',
                fontFamily: "'Orbitron', sans-serif",
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="male" style={{ background: '#0a141e', color: '#fff' }}>Male (Sir)</option>
              <option value="female" style={{ background: '#0a141e', color: '#fff' }}>Female (Ma'am)</option>
              <option value="other" style={{ background: '#0a141e', color: '#fff' }}>Other (Them)</option>
            </select>
          </div>
        </div>
      )}

      {isDraggingMode && (
        <div className="drag-mode-overlay">
          <h2>Drag the blob to position it</h2>
          <button className="btn-save-pos" onClick={() => setIsDraggingMode(false)}>Save Position</button>
        </div>
      )}

      <div className="hud-main-grid">
        <div className="hud-left-panel">
          <Widgets />
        </div>

        <div className="hud-center-panel">
          <MicReactiveBlob
            color={blobConfig.color}
            size={blobConfig.size}
            sensitivity={blobConfig.sensitivity}
            position={{}}
            isDraggingMode={isDraggingMode}
            onPositionChange={(newPos) => setBlobConfig({...blobConfig, position: newPos})}
          />
          <div className="greeting-plate">
            <h2>{greeting}</h2>
            <p className="sub-greet">
              {gender === 'other' ? 'At your service, them.' : gender === 'female' ? 'At your service, ma\'am.' : 'At your service, sir.'}
            </p>
            <p className="sig">- J.A.R.V.I.S.</p>
          </div>
        </div>

        <div className="hud-right-panel">
          <StatusPanel
            isListening={isListening}
            speechStatus={speechStatus}
            apiConnected={apiConnected}
          />
        </div>
      </div>

      <div className="hud-bottom-panel">
        <div className="terminal-with-input">
          <form className="text-input-bar" onSubmit={handleTextSubmit}>
            <span className="input-prompt">{'>'}</span>
            <input
              type="text"
              className="jarvis-text-input"
              placeholder="Type a command to J.A.R.V.I.S..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              autoComplete="off"
              spellCheck="false"
            />
            <button type="submit" className="send-btn" disabled={!textInput.trim() || isProcessingRef.current}>
              SEND
            </button>
          </form>
          <Terminal
            history={transcriptHistory}
            interim={currentTranscript}
            jarvisTyping={jarvisTyping}
            status={speechStatus}
            isListening={isListening}
            onToggleListen={toggleListening}
          />
        </div>
      </div>

      {showInitAlert && !gender && (
        <div className="jarvis-init-overlay">
          <div className="jarvis-init-box" style={{ maxWidth: '500px', width: '90%' }}>
            <h2>INITIALIZE J.A.R.V.I.S.</h2>
            <p>OPERATOR PROFILE DESIGNATION REQUIRED</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
              <button className="jarvis-init-btn" onClick={() => handleSelectGender('male')}>
                MALE (SIR)
              </button>
              <button className="jarvis-init-btn" onClick={() => handleSelectGender('female')}>
                FEMALE (MA'AM)
              </button>
              <button className="jarvis-init-btn" onClick={() => handleSelectGender('other')}>
                OTHER (THEM)
              </button>
            </div>
          </div>
        </div>
      )}

      {showInitAlert && gender && (
        <div className="jarvis-init-overlay" onClick={() => {
          unlockAudio();
          setShowInitAlert(false);
        }}>
          <div className="jarvis-init-box">
            <h2>SYSTEM STANDBY</h2>
            <p style={{ textTransform: 'uppercase', letterSpacing: '2px', color: '#00e5ff' }}>
              OPERATOR PROFILE: {gender === 'other' ? 'OTHER (THEM)' : gender === 'female' ? 'FEMALE (MA\'AM)' : 'MALE (SIR)'}
            </p>
            <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '8px' }}>
              CLAP TWICE or PRESS SPACEBAR to wake
            </p>
            <button className="jarvis-init-btn">CLICK TO INITIALIZE J.A.R.V.I.S.</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

/* global chrome */
import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faTrash, faCheck, faClock,
  faListCheck, faPlay, faPause, faRotateLeft,
  faFire, faBolt, faFlag, faBroom, faGripVertical
} from '@fortawesome/free-solid-svg-icons';
import { apiFetch } from './utils/api';
import './App.css';

// ─── Generate or retrieve a stable device ID ───────────────────────────────
function getDeviceId(callback) {
  chrome.storage.local.get('focusdo_device_id', (data) => {
    if (data.focusdo_device_id) {
      callback(data.focusdo_device_id);
    } else {
      const id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      chrome.storage.local.set({ focusdo_device_id: id }, () => callback(id));
    }
  });
}

// ─── Pomodoro ──────────────────────────────────────────────────────────────
function Pomodoro() {
  const DEFAULT_FOCUS = 25;
  const DEFAULT_BREAK = 5;

  const [customMinutes, setCustomMinutes] = useState(DEFAULT_FOCUS);
  const [customBreak, setCustomBreak] = useState(DEFAULT_BREAK);
  const [seconds, setSeconds] = useState(DEFAULT_FOCUS * 60);
  const [running, setRunning] = useState(false);
  const [isFocus, setIsFocus] = useState(true);
  const [sessions, setSessions] = useState(0);
  // 'idle' | 'focus_done' | 'break_done'
  const [phase, setPhase] = useState('idle');
  const intervalRef = useRef(null);
  const totalRef = useRef(DEFAULT_FOCUS * 60);
  const breakTotalRef = useRef(DEFAULT_BREAK * 60);

  // ── On popup open: sync with background timer ──────────────────────────
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_TIMER' }, (res) => {
      const t = res?.timer;
      if (!t) return;

      setIsFocus(t.isFocus);
      if (t.customBreak) {
        breakTotalRef.current = t.customBreak;
        setCustomBreak(Math.round(t.customBreak / 60));
      }

      if (t.running && t.endTime) {
        const remaining = Math.round((t.endTime - Date.now()) / 1000);
        if (remaining > 0) {
          setSeconds(remaining);
          setRunning(true);
          totalRef.current = t.totalSeconds || DEFAULT_FOCUS * 60;
          setCustomMinutes(Math.round((t.totalSeconds || DEFAULT_FOCUS * 60) / 60));
        } else {
          setRunning(false);
          const fallback = t.isFocus ? totalRef.current : breakTotalRef.current;
          setSeconds(t.secondsLeft || fallback);
        }
      } else {
        setRunning(false);
        if (t.totalSeconds) {
          totalRef.current = t.totalSeconds;
          setCustomMinutes(Math.round(t.totalSeconds / 60));
        }
        setSeconds(t.isFocus
          ? (t.secondsLeft || totalRef.current)
          : (t.secondsLeft || breakTotalRef.current));

        // Restore phase if timer was just finished (background alarm fired)
        if (t.justFinished) {
          setPhase(t.isFocus ? 'break_done' : 'focus_done');
          // Clear the flag
          chrome.storage.local.set({ timer: { ...t, justFinished: false } });
        }
      }
    });
  }, []);

  // ── Local countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            setIsFocus(prev => {
              if (prev) {
                // Focus just ended → show "Start Break" CTA
                setSessions(n => n + 1);
                setPhase('focus_done');
                setSeconds(breakTotalRef.current);
              } else {
                // Break just ended → show "Start Focus" CTA
                setPhase('break_done');
                setSeconds(totalRef.current);
              }
              return !prev;
            });
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const handleStart = () => {
    if (!running) {
      setPhase('idle');
      chrome.runtime.sendMessage({
        type: 'START_TIMER',
        seconds,
        isFocus,
        totalSeconds: isFocus ? totalRef.current : breakTotalRef.current,
        customBreak: breakTotalRef.current
      });
    } else {
      chrome.runtime.sendMessage({
        type: 'PAUSE_TIMER',
        secondsLeft: seconds,
        isFocus,
        totalSeconds: isFocus ? totalRef.current : breakTotalRef.current,
        customBreak: breakTotalRef.current
      });
    }
    setRunning(r => !r);
  };

  const startBreak = () => {
    setPhase('idle');
    const breakSecs = breakTotalRef.current;
    setSeconds(breakSecs);
    setRunning(true);
    chrome.runtime.sendMessage({
      type: 'START_TIMER',
      seconds: breakSecs,
      isFocus: false,
      totalSeconds: breakSecs,
      customBreak: breakTotalRef.current
    });
  };

  const startFocus = () => {
    setPhase('idle');
    const focusSecs = totalRef.current;
    setSeconds(focusSecs);
    setRunning(true);
    chrome.runtime.sendMessage({
      type: 'START_TIMER',
      seconds: focusSecs,
      isFocus: true,
      totalSeconds: focusSecs,
      customBreak: breakTotalRef.current
    });
  };

  const reset = () => {
    clearInterval(intervalRef.current);
    chrome.runtime.sendMessage({ type: 'RESET_TIMER' });
    setRunning(false);
    setIsFocus(true);
    setPhase('idle');
    const s = customMinutes * 60;
    totalRef.current = s;
    setSeconds(s);
  };

  const handleFocusMinuteChange = (val) => {
    if (running) return;
    val = Number(val);
    if (val >= 1 && val <= 120) {
      setCustomMinutes(val);
      const s = val * 60;
      totalRef.current = s;
      if (isFocus) setSeconds(s);
    }
  };

  const handleBreakMinuteChange = (val) => {
    if (running) return;
    val = Number(val);
    if (val >= 1 && val <= 60) {
      setCustomBreak(val);
      const s = val * 60;
      breakTotalRef.current = s;
      if (!isFocus) setSeconds(s);
    }
  };

  const total = isFocus ? totalRef.current : breakTotalRef.current;
  const progress = total > 0 ? ((total - seconds) / total) * 283 : 0;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const percent = total > 0 ? Math.round(((total - seconds) / total) * 100) : 0;

  return (
    <div className="pomodoro">

      {/* ── Focus Done: Start Break CTA ───────────────────────────────── */}
      {phase === 'focus_done' && (
        <div className="finish-banner banner-break">
          <span className="banner-icon">☕</span>
          <div className="banner-text">
            <strong>Focus session done! Great work 🎉</strong>
            <p>You earned a break. Edit duration below and start when ready.</p>
          </div>
          <button onClick={() => setPhase('idle')} className="banner-close">✕</button>
        </div>
      )}

      {/* ── Break Done: Start Focus CTA ───────────────────────────────── */}
      {phase === 'break_done' && (
        <div className="finish-banner banner-focus">
          <span className="banner-icon">🎯</span>
          <div className="banner-text">
            <strong>Break over! Ready to focus?</strong>
            <p>Click Start to begin your next focus session.</p>
          </div>
          <button onClick={() => setPhase('idle')} className="banner-close">✕</button>
        </div>
      )}

      <div className={`mode-pill ${isFocus ? 'focus' : 'brk'}`}>
        {isFocus ? '🎯 Focus Session' : '☕ Break Time'}
      </div>

      {/* ── Duration controls ─────────────────────────────────────────── */}
      <div className="duration-row">
        <div className="time-input">
          <label>Focus</label>
          <div className="time-input-row">
            <button className="min-adj"
              onClick={() => handleFocusMinuteChange(customMinutes - 1)}
              disabled={running || customMinutes <= 1}>−</button>
            <input type="number" min="1" max="120"
              value={customMinutes}
              onChange={e => handleFocusMinuteChange(e.target.value)}
              disabled={running} />
            <button className="min-adj"
              onClick={() => handleFocusMinuteChange(customMinutes + 1)}
              disabled={running || customMinutes >= 120}>+</button>
            <span>min</span>
          </div>
        </div>

        <div className="time-input">
          <label>Break</label>
          <div className="time-input-row">
            <button className="min-adj"
              onClick={() => handleBreakMinuteChange(customBreak - 1)}
              disabled={running || customBreak <= 1}>−</button>
            <input type="number" min="1" max="60"
              value={customBreak}
              onChange={e => handleBreakMinuteChange(e.target.value)}
              disabled={running} />
            <button className="min-adj"
              onClick={() => handleBreakMinuteChange(customBreak + 1)}
              disabled={running || customBreak >= 60}>+</button>
            <span>min</span>
          </div>
        </div>
      </div>

      <div className="ring-wrap">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" className="ring-bg" />
          <circle cx="50" cy="50" r="45" className="ring-progress"
            strokeDasharray={`${progress} 283`}
            style={{ stroke: isFocus ? '#6366f1' : '#10b981' }} />
        </svg>
        <div className="ring-inner">
          <span className="ring-time">{mm}:{ss}</span>
          <span className="ring-label">{percent}% done</span>
        </div>
      </div>

      <div className="sessions-row">
        <FontAwesomeIcon icon={faFire} style={{ color: '#f97316' }} />
        <span>{sessions} session{sessions !== 1 ? 's' : ''} completed today</span>
      </div>

      <div className="pomo-controls">
        <button onClick={reset} className="pomo-btn ghost" title="Reset">
          <FontAwesomeIcon icon={faRotateLeft} />
        </button>

        {/* After focus done: show dedicated "Start Break" button */}
        {phase === 'focus_done' && !running ? (
          <button onClick={startBreak} className="pomo-btn main green">
            ☕ Start Break
          </button>
        ) : phase === 'break_done' && !running ? (
          <button onClick={startFocus} className="pomo-btn main indigo">
            🎯 Start Focus
          </button>
        ) : (
          <button onClick={handleStart}
            className={`pomo-btn main ${isFocus ? 'indigo' : 'green'}`}>
            <FontAwesomeIcon icon={running ? faPause : faPlay} />
            {running ? 'Pause' : 'Start'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Todo ──────────────────────────────────────────────────────────────────
function Todo() {
  const [tasks, setTasks] = useState([]);
  const [input, setInput] = useState('');
  const [priority, setPriority] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState(null);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  useEffect(() => {
    getDeviceId((id) => {
      setDeviceId(id);
      apiFetch(`/tasks?device_id=${encodeURIComponent(id)}`)
        .then(res => { if (res.success) setTasks(res.data); })
        .catch(() => { })
        .finally(() => setLoading(false));
    });
  }, []);

  const addTask = async () => {
    if (!input.trim() || !deviceId) return;
    try {
      const data = await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({ text: input.trim(), priority: priority ? 1 : 0, device_id: deviceId })
      });
      if (data.success) setTasks(prev => [data.data, ...prev]);
      setInput('');
      setPriority(false);
    } catch { }
  };

  const toggle = async (id) => {
    try {
      const data = await apiFetch(`/tasks/${id}/toggle`, { method: 'PATCH' });
      if (data.success)
        setTasks(prev => prev.map(t => t.id === id ? data.data : t));
    } catch { }
  };

  const remove = async (id) => {
    try {
      await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch { }
  };

  const clearDone = async () => {
    try {
      const q = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
      await apiFetch(`/tasks/clear/done${q}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => !t.done));
    } catch { }
  };

  // ── Drag handlers ──────────────────────────────────────────────────────
  const handleDragStart = (index) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index) => {
    dragOverItem.current = index;
    // Live preview while dragging
    setTasks(prev => {
      const updated = [...prev];
      const dragged = updated.splice(dragItem.current, 1)[0];
      updated.splice(index, 0, dragged);
      dragItem.current = index;
      return updated;
    });
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const sorted = [...tasks].sort((a, b) => {
    if (a.priority && !b.priority) return -1;
    if (!a.priority && b.priority) return 1;
    return 0;
  });

  const pending = tasks.filter(t => !t.done).length;
  const done = tasks.filter(t => t.done).length;

  return (
    <div className="todo">
      <div className="stats-row">
        <div className="stat-chip pending">{pending} pending</div>
        <div className="stat-chip done-chip">{done} done</div>
        {done > 0 && (
          <button onClick={clearDone} className="clear-btn" title="Clear completed">
            <FontAwesomeIcon icon={faBroom} /> Clear
          </button>
        )}
      </div>

      <div className="input-row">
        <button
          onClick={() => setPriority(p => !p)}
          className={`priority-btn ${priority ? 'active' : ''}`}
          title="Mark as priority">
          <FontAwesomeIcon icon={faFlag} />
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="What needs to be done?"
        />
        <button onClick={addTask} className="add-btn">
          <FontAwesomeIcon icon={faPlus} />
        </button>
      </div>

      <ul className="task-list">
        {loading && <li className="empty-state"><p>Loading tasks...</p></li>}
        {!loading && sorted.length === 0 && (
          <li className="empty-state">
            <span>🎉</span>
            <p>All clear! Add a task above.</p>
          </li>
        )}
        {sorted.map((t, index) => (
          <li
            key={t.id}
            className={`task-item ${t.done ? 'done' : ''} ${t.priority && !t.done ? 'high-priority' : ''}`}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragEnter={() => handleDragEnter(index)}
            onDragEnd={handleDragEnd}
            onDragOver={e => e.preventDefault()}
          >
            <span className="drag-handle" title="Drag to reorder">
              <FontAwesomeIcon icon={faGripVertical} />
            </span>
            <button onClick={() => toggle(t.id)} className={`check-btn ${t.done ? 'checked' : ''}`}>
              {t.done && <FontAwesomeIcon icon={faCheck} />}
            </button>
            <span className="task-text">
              {t.priority === 1 && !t.done && (
                <FontAwesomeIcon icon={faFlag} className="flag-icon" />
              )}
              {t.text}
            </span>
            <button onClick={() => remove(t.id)} className="del-btn">
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── App Shell ─────────────────────────────────────────────────────────────
function App() {
  const [tab, setTab] = useState('todo');

  // If the popup opened because a timer just finished, switch to Timer tab
  useEffect(() => {
    chrome.storage.local.get('timer', (data) => {
      if (data.timer?.justFinished) {
        setTab('pomodoro');
      }
    });
  }, []);

  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <FontAwesomeIcon icon={faBolt} className="brand-icon" />
          <span className="brand-name">FocusDo</span>
        </div>
        <div className="tab-pills">
          <button onClick={() => setTab('todo')} className={tab === 'todo' ? 'pill active' : 'pill'}>
            <FontAwesomeIcon icon={faListCheck} /> Todo
          </button>
          <button onClick={() => setTab('pomodoro')} className={tab === 'pomodoro' ? 'pill active' : 'pill'}>
            <FontAwesomeIcon icon={faClock} /> Timer
          </button>
        </div>
      </div>
      <div className="content">
        {tab === 'todo' ? <Todo /> : <Pomodoro />}
      </div>
    </div>
  );
}

export default App;
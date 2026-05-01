/* global chrome */
import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faTrash, faCheck, faClock,
  faListCheck, faPlay, faPause, faRotateLeft,
  faFire, faBolt, faFlag, faBroom, faGripVertical,
  faPencil, faChevronDown, faChevronRight, faHistory,
  faArrowLeft, faXmark
} from '@fortawesome/free-solid-svg-icons';
import { apiFetch } from './utils/api';
import './App.css';

// ─── Device ID ─────────────────────────────────────────────────────────────
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
function TimerHistory({ onBack }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/sessions/history')
      .then(res => { if (res.success) setHistory(res.data); })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  const deleteOne = async (id) => {
    try {
      await apiFetch(`/sessions/${id}`, { method: 'DELETE' });
      setHistory(prev => prev.filter(s => s.id !== id));
    } catch { }
  };

  const deleteAll = async () => {
    try {
      await apiFetch('/sessions', { method: 'DELETE' });
      setHistory([]);
    } catch { }
  };

  const grouped = history.reduce((acc, s) => {
    const date = new Date(s.created_at).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(s);
    return acc;
  }, {});

  return (
    <div className="timer-history">
      <div className="history-header">
        <button className="back-btn" onClick={onBack}>
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <span className="history-title">Session History</span>
        {history.length > 0 && (
          <button className="clear-all-btn" onClick={deleteAll}>
            <FontAwesomeIcon icon={faBroom} /> Clear All
          </button>
        )}
      </div>

      {loading && <p className="history-empty">Loading...</p>}
      {!loading && history.length === 0 && (
        <p className="history-empty">No sessions yet. Start a focus timer! 🎯</p>
      )}

      <div className="history-list">
        {Object.entries(grouped).map(([date, sessions]) => (
          <div key={date} className="history-group">
            <div className="history-date-label">{date}</div>
            {sessions.map(s => (
              <div key={s.id} className="history-item">
                <span className={`history-badge ${s.type}`}>
                  {s.type === 'focus' ? '🎯' : '☕'} {s.type}
                </span>
                <span className="history-duration">{s.duration_min} min</span>
                <span className="history-time">
                  {new Date(s.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button className="history-del-btn" onClick={() => deleteOne(s.id)}>
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Pomodoro() {
  const DEFAULT_FOCUS = 25;
  const DEFAULT_BREAK = 5;

  const [customMinutes, setCustomMinutes] = useState(DEFAULT_FOCUS);
  const [customBreak, setCustomBreak] = useState(DEFAULT_BREAK);
  const [seconds, setSeconds] = useState(DEFAULT_FOCUS * 60);
  const [running, setRunning] = useState(false);
  const [isFocus, setIsFocus] = useState(true);
  const [sessions, setSessions] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [showHistory, setShowHistory] = useState(false);
  const intervalRef = useRef(null);
  const totalRef = useRef(DEFAULT_FOCUS * 60);
  const breakTotalRef = useRef(DEFAULT_BREAK * 60);

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
        if (t.justFinished) {
          setPhase(t.isFocus ? 'break_done' : 'focus_done');
          chrome.storage.local.set({ timer: { ...t, justFinished: false } });
        }
      }
    });
  }, []);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            setIsFocus(prev => {
              if (prev) {
                setSessions(n => n + 1);
                setPhase('focus_done');
                setSeconds(breakTotalRef.current);
              } else {
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
        type: 'START_TIMER', seconds, isFocus,
        totalSeconds: isFocus ? totalRef.current : breakTotalRef.current,
        customBreak: breakTotalRef.current
      });
    } else {
      chrome.runtime.sendMessage({
        type: 'PAUSE_TIMER', secondsLeft: seconds, isFocus,
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
      type: 'START_TIMER', seconds: breakSecs, isFocus: false,
      totalSeconds: breakSecs, customBreak: breakTotalRef.current
    });
  };

  const startFocus = () => {
    setPhase('idle');
    const focusSecs = totalRef.current;
    setSeconds(focusSecs);
    setRunning(true);
    chrome.runtime.sendMessage({
      type: 'START_TIMER', seconds: focusSecs, isFocus: true,
      totalSeconds: focusSecs, customBreak: breakTotalRef.current
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
    if (val === '' || val === undefined) { setCustomMinutes(''); return; }
    const num = Math.max(1, Math.min(120, Number(val) || 1));
    setCustomMinutes(num);
    const s = num * 60;
    totalRef.current = s;
    if (isFocus) setSeconds(s);
  };

  const handleBreakMinuteChange = (val) => {
    if (running) return;
    if (val === '' || val === undefined) { setCustomBreak(''); return; }
    const num = Math.max(1, Math.min(60, Number(val) || 1));
    setCustomBreak(num);
    const s = num * 60;
    breakTotalRef.current = s;
    if (!isFocus) setSeconds(s);
  };

  const total = isFocus ? totalRef.current : breakTotalRef.current;
  const progress = total > 0 ? ((total - seconds) / total) * 283 : 0;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const percent = total > 0 ? Math.round(((total - seconds) / total) * 100) : 0;

  if (showHistory) return <TimerHistory onBack={() => setShowHistory(false)} />;

  return (
    <div className="pomodoro">
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

      <div className="pomodoro-top-row">
        <div className={`mode-pill ${isFocus ? 'focus' : 'brk'}`}>
          {isFocus ? '🎯 Focus Session' : '☕ Break Time'}
        </div>
        <button className="history-icon-btn" onClick={() => setShowHistory(true)} title="View history">
          <FontAwesomeIcon icon={faHistory} />
        </button>
      </div>

      <div className="duration-row">
        <div className="time-input">
          <label>Focus</label>
          <div className="time-input-row">
            <button className="min-adj" onClick={() => handleFocusMinuteChange(customMinutes - 1)} disabled={running || customMinutes <= 1}>−</button>
            <input type="number" min="1" max="120" value={customMinutes}
              onChange={e => handleFocusMinuteChange(e.target.value)}
              onBlur={() => { if (!customMinutes || customMinutes < 1) handleFocusMinuteChange(1); }}
              disabled={running} />
            <button className="min-adj" onClick={() => handleFocusMinuteChange(customMinutes + 1)} disabled={running || customMinutes >= 120}>+</button>
            <span>min</span>
          </div>
        </div>
        <div className="time-input">
          <label>Break</label>
          <div className="time-input-row">
            <button className="min-adj" onClick={() => handleBreakMinuteChange(customBreak - 1)} disabled={running || customBreak <= 1}>−</button>
            <input type="number" min="1" max="60" value={customBreak}
              onChange={e => handleBreakMinuteChange(e.target.value)}
              onBlur={() => { if (!customBreak || customBreak < 1) handleBreakMinuteChange(1); }}
              disabled={running} />
            <button className="min-adj" onClick={() => handleBreakMinuteChange(customBreak + 1)} disabled={running || customBreak >= 60}>+</button>
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
        {phase === 'focus_done' && !running ? (
          <button onClick={startBreak} className="pomo-btn main green">☕ Start Break</button>
        ) : phase === 'break_done' && !running ? (
          <button onClick={startFocus} className="pomo-btn main indigo">🎯 Start Focus</button>
        ) : (
          <button onClick={handleStart} className={`pomo-btn main ${isFocus ? 'indigo' : 'green'}`}>
            <FontAwesomeIcon icon={running ? faPause : faPlay} />
            {running ? 'Pause' : 'Start'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Subtask Row ───────────────────────────────────────────────────────────
function SubtaskList({ taskId, onSubtaskChange }) {
  const [subtasks, setSubtasks] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/tasks/${taskId}/subtasks`)
      .then(res => { if (res.success) setSubtasks(res.data); })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [taskId]);

  const addSub = async () => {
    if (!input.trim()) return;
    try {
      const data = await apiFetch(`/tasks/${taskId}/subtasks`, {
        method: 'POST',
        body: JSON.stringify({ text: input.trim() })
      });
      if (data.success) {
        const newSubs = [...subtasks, data.data];
        setSubtasks(newSubs);
        setInput('');
        onSubtaskChange(newSubs);
      }
    } catch { }
  };

  const toggleSub = async (subId) => {
    try {
      const data = await apiFetch(`/tasks/${taskId}/subtasks/${subId}/toggle`, { method: 'PATCH' });
      if (data.success) {
        setSubtasks(data.subtasks);
        onSubtaskChange(data.subtasks, data.task);
      }
    } catch { }
  };

  const deleteSub = async (subId) => {
    try {
      await apiFetch(`/tasks/${taskId}/subtasks/${subId}`, { method: 'DELETE' });
      const newSubs = subtasks.filter(s => s.id !== subId);
      setSubtasks(newSubs);
      onSubtaskChange(newSubs);
    } catch { }
  };

  return (
    <div className="subtask-section">
      {loading && <p className="subtask-loading">Loading...</p>}
      {subtasks.map(s => (
        <div key={s.id} className={`subtask-item ${s.done ? 'done' : ''}`}>
          <button onClick={() => toggleSub(s.id)} className={`check-btn small ${s.done ? 'checked' : ''}`}>
            {s.done && <FontAwesomeIcon icon={faCheck} />}
          </button>
          <span className="subtask-text">{s.text}</span>
          <button onClick={() => deleteSub(s.id)} className="subtask-del">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      ))}
      <div className="subtask-input-row">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addSub()}
          placeholder="Add subtask..."
          className="subtask-input"
        />
        <button onClick={addSub} className="subtask-add-btn">
          <FontAwesomeIcon icon={faPlus} />
        </button>
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
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [expandedId, setExpandedId] = useState(null);
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
      if (expandedId === id) setExpandedId(null);
    } catch { }
  };

  const clearDone = async () => {
    try {
      const q = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
      await apiFetch(`/tasks/clear/done${q}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => !t.done));
    } catch { }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditText(t.text);
  };

  const saveEdit = async (id) => {
    if (!editText.trim()) { setEditingId(null); return; }
    try {
      const data = await apiFetch(`/tasks/${id}/edit`, {
        method: 'PATCH',
        body: JSON.stringify({ text: editText.trim(), device_id: deviceId })
      });
      if (data.success)
        setTasks(prev => prev.map(t => t.id === id ? data.data : t));
    } catch { }
    setEditingId(null);
  };

  const togglePriority = async (id) => {
    try {
      const data = await apiFetch(`/tasks/${id}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ device_id: deviceId })
      });
      if (data.success)
        setTasks(prev => prev.map(t => t.id === id ? data.data : t));
    } catch { }
  };

  const handleSubtaskChange = (taskId, newSubs, updatedTask) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const updated = {
        ...t,
        subtask_total: newSubs.length,
        subtask_done: newSubs.filter(s => s.done).length,
      };
      if (updatedTask) updated.done = updatedTask.done;
      return updated;
    }));
  };

  // Drag
  const handleDragStart = (index) => { dragItem.current = index; };
  const handleDragEnter = (index) => {
    dragOverItem.current = index;
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
        <button onClick={() => setPriority(p => !p)}
          className={`priority-btn ${priority ? 'active' : ''}`} title="Mark as priority">
          <FontAwesomeIcon icon={faFlag} />
        </button>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
          placeholder="What needs to be done?" />
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
        {sorted.map((t, index) => {
          const pct = t.subtask_total > 0
            ? Math.round((t.subtask_done / t.subtask_total) * 100)
            : null;
          const isExpanded = expandedId === t.id;

          return (
            <li key={t.id}
              className={`task-item ${t.done ? 'done' : ''} ${t.priority && !t.done ? 'high-priority' : ''}`}
              draggable={editingId !== t.id}
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={e => e.preventDefault()}
            >
              {/* Main row */}
              <div className="task-main-row">
                <span className="drag-handle" title="Drag to reorder">
                  <FontAwesomeIcon icon={faGripVertical} />
                </span>
                <button onClick={() => toggle(t.id)} className={`check-btn ${t.done ? 'checked' : ''}`}>
                  {t.done && <FontAwesomeIcon icon={faCheck} />}
                </button>

                {editingId === t.id ? (
                  <input
                    className="task-edit-input"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEdit(t.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="task-text">
                    {t.priority === 1 && !t.done && (
                      <FontAwesomeIcon icon={faFlag} className="flag-icon" />
                    )}
                    {t.text}
                  </span>
                )}

                <div className="task-actions">
                  {editingId === t.id ? (
                    <button onClick={() => saveEdit(t.id)} className="action-btn save-btn" title="Save">
                      <FontAwesomeIcon icon={faCheck} />
                    </button>
                  ) : (
                    <>
                      <button onClick={() => togglePriority(t.id)}
                        className={`action-btn flag-btn ${t.priority ? 'flagged' : ''}`} title="Toggle priority">
                        <FontAwesomeIcon icon={faFlag} />
                      </button>
                      <button onClick={() => startEdit(t)} className="action-btn edit-btn" title="Edit">
                        <FontAwesomeIcon icon={faPencil} />
                      </button>
                      <button onClick={() => setExpandedId(isExpanded ? null : t.id)}
                        className="action-btn expand-btn" title="Subtasks">
                        <FontAwesomeIcon icon={isExpanded ? faChevronDown : faChevronRight} />
                      </button>
                      <button onClick={() => remove(t.id)} className="del-btn" title="Delete">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Progress bar (only if has subtasks) */}
              {pct !== null && (
                <div className="subtask-progress-wrap">
                  <div className="subtask-progress-bar">
                    <div
                      className="subtask-progress-fill"
                      style={{
                        width: `${pct}%`,
                        background: pct === 100 ? '#10b981' : pct > 50 ? '#6366f1' : '#f97316'
                      }}
                    />
                  </div>
                  <span className="subtask-progress-label">
                    {t.subtask_done}/{t.subtask_total} · {pct}%
                  </span>
                </div>
              )}

              {/* Subtasks panel */}
              {isExpanded && (
                <SubtaskList
                  taskId={t.id}
                  onSubtaskChange={(newSubs, updatedTask) => handleSubtaskChange(t.id, newSubs, updatedTask)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── App Shell ─────────────────────────────────────────────────────────────
function App() {
  const [tab, setTab] = useState('todo');

  useEffect(() => {
    chrome.storage.local.get('openOnTimer', (data) => {
      if (data.openOnTimer) {
        setTab('pomodoro');
        chrome.storage.local.remove('openOnTimer');
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

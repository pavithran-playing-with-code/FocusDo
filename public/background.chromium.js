// ─── Load API URL from .env (injected at build time) ─────────────────────────
importScripts('config.js'); // gives us FOCUSDO_API

// ─── Helper: open the extension popup ────────────────────────────────────────
function openPopup() {
    chrome.windows.getLastFocused({ populate: true }, (win) => {
        if (win) {
            chrome.windows.update(win.id, { focused: true });
            chrome.action.openPopup().catch(() => {
                // openPopup() only works if Chrome window is focused
                // fallback: just focus the window so user can click
            });
        }
    });
}

// ─── Timer Messages ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

    if (msg.type === 'START_TIMER') {
        const { seconds, isFocus, totalSeconds, customBreak } = msg;
        const endTime = Date.now() + seconds * 1000;
        chrome.storage.local.set({
            timer: { endTime, isFocus, running: true, totalSeconds, customBreak, justFinished: false }
        });
        chrome.alarms.clear('focusdo-timer', () => {
            chrome.alarms.create('focusdo-timer', { when: endTime });
        });
        sendResponse({ ok: true });
    }

    if (msg.type === 'PAUSE_TIMER') {
        chrome.alarms.clear('focusdo-timer');
        chrome.storage.local.set({
            timer: {
                endTime: null,
                isFocus: msg.isFocus,
                running: false,
                secondsLeft: msg.secondsLeft,
                totalSeconds: msg.totalSeconds,
                customBreak: msg.customBreak,
                justFinished: false
            }
        });
        sendResponse({ ok: true });
    }

    if (msg.type === 'RESET_TIMER') {
        chrome.alarms.clear('focusdo-timer');
        chrome.storage.local.set({ timer: null });
        sendResponse({ ok: true });
    }

    if (msg.type === 'GET_TIMER') {
        chrome.storage.local.get('timer', (data) => {
            sendResponse({ timer: data.timer || null });
        });
        return true;
    }

    return true;
});

// ─── Alarm fires when timer ends ──────────────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== 'focusdo-timer') return;

    chrome.storage.local.get('timer', (data) => {
        const t = data.timer;
        if (!t) return;

        const wasFocus = t.isFocus;
        const nextIsFocus = !wasFocus;
        const breakDuration = t.customBreak || 5 * 60;
        const nextSeconds = nextIsFocus ? (t.totalSeconds || 25 * 60) : breakDuration;

        chrome.storage.local.set({
            timer: {
                endTime: null,
                isFocus: nextIsFocus,
                running: false,
                secondsLeft: nextSeconds,
                totalSeconds: t.totalSeconds,
                customBreak: breakDuration,
                justFinished: true
            }
        });

        // ✅ API URL from .env via config.js
        if (wasFocus) {
            fetch(`${FOCUSDO_API}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    duration_min: Math.round((t.totalSeconds || 25 * 60) / 60),
                    type: 'focus',
                    completed: 1
                })
            }).catch(() => { });
        }

        const notifId = wasFocus ? 'focusdo-focus-done' : 'focusdo-break-done';
        chrome.notifications.clear(notifId, () => {
            chrome.notifications.create(notifId, {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icon128.png'),
                title: wasFocus ? 'Focus Session Complete!' : 'Break Over!',
                message: wasFocus
                    ? 'Great work! Take a well-earned break.'
                    : 'Break finished. Ready to focus again?',
                contextMessage: 'FocusDo — click to open',
                buttons: [
                    { title: wasFocus ? 'Start Break now' : 'Start Focus now' },
                    { title: 'Dismiss' }
                ],
                priority: 2,
                requireInteraction: true
            });
        });

        // ── Auto-open the extension popup when timer ends ─────────────────
        openPopup();
    });
});

// ─── Notification button clicks ───────────────────────────────────────────────
chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
    if (notifId !== 'focusdo-focus-done' && notifId !== 'focusdo-break-done') return;
    chrome.notifications.clear(notifId);
    if (btnIdx === 1) return; // Dismiss

    chrome.storage.local.get('timer', (data) => {
        const t = data.timer;
        if (!t) return;
        const seconds = t.secondsLeft || (t.isFocus
            ? (t.totalSeconds || 25 * 60)
            : (t.customBreak || 5 * 60));
        const endTime = Date.now() + seconds * 1000;
        chrome.storage.local.set({
            timer: { ...t, endTime, running: true, justFinished: false }
        });
        chrome.alarms.clear('focusdo-timer', () => {
            chrome.alarms.create('focusdo-timer', { when: endTime });
        });
    });
});

// ─── Notification body click — open popup ────────────────────────────────────
chrome.notifications.onClicked.addListener((notifId) => {
    if (notifId !== 'focusdo-focus-done' && notifId !== 'focusdo-break-done') return;
    chrome.notifications.clear(notifId);
    openPopup(); // ← uses the helper instead of just focusing window
});
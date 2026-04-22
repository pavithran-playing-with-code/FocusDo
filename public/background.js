// ─── Timer Messages ──────────────────────────────────────────────────────────
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

// ─── Alarm fires when timer ends ─────────────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== 'focusdo-timer') return;

    chrome.storage.local.get('timer', (data) => {
        const t = data.timer;
        if (!t) return;

        const wasFocus = t.isFocus;
        const nextIsFocus = !wasFocus;
        const breakDuration = t.customBreak || 5 * 60;
        const nextSeconds = nextIsFocus ? (t.totalSeconds || 25 * 60) : breakDuration;

        // Update state — mark justFinished so popup shows the right CTA on open
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

        // Save completed focus session to backend
        if (wasFocus) {
            fetch('http://localhost:5050/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    duration_min: Math.round((t.totalSeconds || 25 * 60) / 60),
                    type: 'focus',
                    completed: 1
                })
            }).catch(() => { });
        }

        // ── Auto-open the extension as a popup window ─────────────────────
        chrome.windows.create({
            url: chrome.runtime.getURL('index.html'),
            type: 'popup',
            width: 380,
            height: 600,
            focused: true
        });

        // ── Also fire a system notification as a backup ───────────────────
        const notifId = wasFocus ? 'focusdo-focus-done' : 'focusdo-break-done';

        // Clear any existing notification of same id first (avoids stacking)
        chrome.notifications.clear(notifId, () => {
            chrome.notifications.create(notifId, {
                type: 'basic',
                // Use runtime URL so icon loads correctly in service worker
                iconUrl: chrome.runtime.getURL('icon128.png'),
                title: wasFocus ? 'Focus Session Complete!' : 'Break Over!',
                message: wasFocus
                    ? 'Great work! Take a well-earned break.'
                    : 'Break finished. Ready to focus again?',
                contextMessage: 'FocusDo — click to open',
                // Action buttons let the user act WITHOUT opening the extension
                buttons: [
                    { title: wasFocus ? '☕ Start Break now' : '🎯 Start Focus now' },
                    { title: 'Dismiss' }
                ],
                priority: 2,
                requireInteraction: true   // stays on screen until user acts
            });
        });
    });
});

// ─── Notification button clicks ───────────────────────────────────────────────
chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
    if (notifId !== 'focusdo-focus-done' && notifId !== 'focusdo-break-done') return;

    chrome.notifications.clear(notifId);

    if (btnIdx === 1) return; // "Dismiss" — do nothing

    // Button 0: "Start Break" or "Start Focus"
    chrome.storage.local.get('timer', (data) => {
        const t = data.timer;
        if (!t) return;

        const seconds = t.secondsLeft || (t.isFocus ? (t.totalSeconds || 25 * 60) : (t.customBreak || 5 * 60));
        const endTime = Date.now() + seconds * 1000;

        chrome.storage.local.set({
            timer: {
                ...t,
                endTime,
                running: true,
                justFinished: false
            }
        });

        chrome.alarms.clear('focusdo-timer', () => {
            chrome.alarms.create('focusdo-timer', { when: endTime });
        });
    });
});

// ─── Clicking the notification body opens the extension popup ────────────────
chrome.notifications.onClicked.addListener((notifId) => {
    if (notifId !== 'focusdo-focus-done' && notifId !== 'focusdo-break-done') return;
    chrome.notifications.clear(notifId);

    // Open the extension popup in a small window (popup windows open on top)
    chrome.windows.create({
        url: chrome.runtime.getURL('index.html'),
        type: 'popup',
        width: 380,
        height: 600,
        focused: true
    });
});
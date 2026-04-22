// ─── Timer Messages ───────────────────────────────────────────────────────
var browser = browser || chrome;

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

    if (msg.type === 'START_TIMER') {
        const { seconds, isFocus, totalSeconds, customBreak } = msg;
        const endTime = Date.now() + seconds * 1000;
        browser.storage.local.set({
            timer: { endTime, isFocus, running: true, totalSeconds, customBreak, justFinished: false }
        });
        browser.alarms.clear('focusdo-timer', () => {
            browser.alarms.create('focusdo-timer', { when: endTime });
        });
        sendResponse({ ok: true });
    }

    if (msg.type === 'PAUSE_TIMER') {
        browser.alarms.clear('focusdo-timer');
        browser.storage.local.set({
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
        browser.alarms.clear('focusdo-timer');
        browser.storage.local.set({ timer: null });
        sendResponse({ ok: true });
    }

    if (msg.type === 'GET_TIMER') {
        browser.storage.local.get('timer', (data) => {
            sendResponse({ timer: data.timer || null });
        });
        return true;
    }

    return true;
});

// ─── Alarm fires when timer ends ─────────────────────────────────────────
browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== 'focusdo-timer') return;

    browser.storage.local.get('timer', (data) => {
        const t = data.timer;
        if (!t) return;

        const wasFocus = t.isFocus;
        const nextIsFocus = !wasFocus;
        const breakDuration = t.customBreak || 5 * 60;
        const nextSeconds = nextIsFocus ? (t.totalSeconds || 25 * 60) : breakDuration;

        browser.storage.local.set({
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

        browser.notifications.create({
            type: 'basic',
            iconUrl: 'icon128.png',
            title: wasFocus ? 'Focus Session Complete!' : 'Break Over!',
            message: wasFocus
                ? 'Great work! Take a well-earned break.'
                : 'Break finished. Ready to focus again?',
            priority: 2
        });
    });
});

browser.notifications.onClicked.addListener((notifId) => {
    browser.notifications.clear(notifId);
});
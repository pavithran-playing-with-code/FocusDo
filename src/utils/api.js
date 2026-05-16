/* global FOCUSDO_API, chrome */

const API_BASE = (typeof FOCUSDO_API !== 'undefined' && FOCUSDO_API)
    ? FOCUSDO_API
    : 'http://localhost:5050/api';

console.log('[FocusDo] API_BASE =', API_BASE);

function getStoredDeviceId() {
    return new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            return resolve(null);
        }
        chrome.storage.local.get('focusdo_device_id', (data) => {
            resolve((data && data.focusdo_device_id) || null);
        });
    });
}

export async function apiFetch(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const deviceId = await getStoredDeviceId();
    let url = `${API_BASE}${endpoint}`;
    let body = options.body;

    if (deviceId) {
        const writes = method === 'POST' || method === 'PATCH' || method === 'PUT';
        if (writes) {
            let obj = {};
            if (body) {
                try { obj = JSON.parse(body); } catch (e) { obj = {}; }
            }
            if (obj.device_id === undefined) obj.device_id = deviceId;
            body = JSON.stringify(obj);
        } else if (!url.includes('device_id=')) {
            const sep = url.includes('?') ? '&' : '?';
            url = `${url}${sep}device_id=${encodeURIComponent(deviceId)}`;
        }
    }

    try {
        const res = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            ...options,
            body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.error('[FocusDo] API error', res.status, url, data);
            throw new Error(data.message || `HTTP ${res.status}`);
        }
        return data;
    } catch (err) {
        console.error('[FocusDo] fetch failed', url, err);
        throw err;
    }
}

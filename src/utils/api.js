/* global FOCUSDO_API */

const API_BASE = (typeof FOCUSDO_API !== 'undefined')
    ? FOCUSDO_API
    : 'http://localhost:5050/api';

export async function apiFetch(endpoint, options = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    return res.json();
}
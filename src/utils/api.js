export const API_BASE =
    process.env.NODE_ENV === 'production'
        ? process.env.REACT_APP_API
        : 'http://localhost:5050/api';

export async function apiFetch(endpoint, options = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    return res.json();
}
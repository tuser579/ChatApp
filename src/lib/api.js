// Central API helper — uses Render backend in production
const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export async function apiFetch(path, options = {}) {
  const url = `${BASE}${path}`;
  const res  = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  // Handle empty responses
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}

  return { ok: res.ok, status: res.status, data };
}
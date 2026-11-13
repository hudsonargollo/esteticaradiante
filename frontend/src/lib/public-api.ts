import axios from 'axios';

/**
 * Public booking API client. Never sends the staff JWT and never redirects
 * to the login screen — this is what visitors use.
 *
 * Whenever the page is served from a non-local host (deployed domain or a LAN
 * IP), the same Express server serves both the page and /api, so same-origin
 * is always correct there. The baked-in localhost value only applies to local
 * dev / desktop, where frontend and API run on different ports.
 */
export function resolveBaseURL(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  if (typeof window === 'undefined') return configured;

  const { hostname, origin, protocol } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const httpPage = protocol === 'http:' || protocol === 'https:';
  if (httpPage && !isLocal) return `${origin}/api`;

  return configured;
}

const publicApi = axios.create({
  baseURL: resolveBaseURL(),
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

export default publicApi;

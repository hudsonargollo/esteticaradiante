import axios from 'axios';

/**
 * Public booking API client. Never sends the staff JWT and never redirects
 * to the login screen — this is what visitors use.
 *
 * The booking page is shared with clients' phones over the local network, so
 * when the page is served by the same Express server as the API we prefer a
 * same-origin URL instead of the baked-in `localhost` value. Otherwise a phone
 * opening `http://192.168.x.x:3001/agendar/` would call its own localhost.
 */
function resolveBaseURL(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  if (typeof window === 'undefined') return configured;

  try {
    const configuredUrl = new URL(configured);
    const samePort = window.location.port === configuredUrl.port;
    const httpPage = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    if (httpPage && samePort) return `${window.location.origin}/api`;
  } catch {
    // fall through to the configured URL
  }

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

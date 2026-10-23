import { create } from 'zustand';
import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: true } },
});
interface Session {
  token: string;
  user: { id?: string; name: string; email: string };
  set: (token: string, user: Session['user']) => void;
  logout: () => void;
}
let cached: { token?: string; user?: Session['user'] } = {};
try {
  cached = JSON.parse(sessionStorage.getItem('sammtech-session') || '{}');
} catch {
  /*invalid stored session*/
}
export const useSession = create<Session>((set) => ({
  token: cached.token || '',
  user: cached.user || { name: '', email: '' },
  set: (token, user) => {
    sessionStorage.setItem('sammtech-session', JSON.stringify({ token, user }));
    set({ token, user });
  },
  logout: () => {
    sessionStorage.removeItem('sammtech-session');
    for (const key of Object.keys(sessionStorage)) {
      if (
        key.startsWith('sammtech-conversation:') ||
        key.startsWith('sammtech-notifications-read:')
      )
        sessionStorage.removeItem(key);
    }
    queryClient.clear();
    set({ token: '', user: { name: '', email: '' } });
  },
}));
const base = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? '/api' : 'https://samtech-kanban-api.onrender.com')
).replace(/\/$/, '');
export async function api<T = unknown>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const token = useSession.getState().token;
  let response: Response;
  try {
    response = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(65000)])
        : AbortSignal.timeout(65000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      'Cannot reach the service. A sleeping cloud service may need a minute to start.',
    );
  }
  const data = await response.json().catch(() => ({ message: 'Unexpected server response' }));
  if (!response.ok) {
    if (response.status === 429)
      throw new Error('Too many requests. Please wait a minute and try again.');
    if (response.status === 401 && token) useSession.getState().logout();
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join('. ')
        : data.message || `Request failed (${response.status})`,
    );
  }
  return data;
}
export const refresh = () => queryClient.invalidateQueries();

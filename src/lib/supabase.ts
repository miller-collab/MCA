import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment credentials (from Vite / Cloud Run)
const envUrl = (((import.meta as any).env?.VITE_SUPABASE_URL) || '').trim();
const envKey = (((import.meta as any).env?.VITE_SUPABASE_ANON_KEY) || '').trim();

// LocalStorage overrides (permits quick connection directly from UI if desired)
function getStoredCredentials(): { url: string; key: string } {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const customUrl = (localStorage.getItem('mca_supabase_url') || '').trim();
      const customKey = (localStorage.getItem('mca_supabase_anon_key') || '').trim();
      if (customUrl && customKey) {
        return { url: customUrl, key: customKey };
      }
    }
  } catch {
    // Ignore localStorage access issues
  }
  return { url: envUrl, key: envKey };
}

export function getSupabaseCredentials(): { url: string; key: string; isConfigured: boolean } {
  const { url, key } = getStoredCredentials();
  const isValidUrl = url.startsWith('http://') || url.startsWith('https://');
  const isConfigured = Boolean(isValidUrl && key && key.length > 10);
  return { url, key, isConfigured };
}

export function saveSupabaseCredentials(url: string, key: string) {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem('mca_supabase_url', url.trim());
    localStorage.setItem('mca_supabase_anon_key', key.trim());
    // Invalidate cached client to recreate with new credentials
    cachedClient = null;
  }
}

export function clearSupabaseCredentials() {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem('mca_supabase_url');
    localStorage.removeItem('mca_supabase_anon_key');
    cachedClient = null;
  }
}

let cachedClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const { url, key, isConfigured } = getSupabaseCredentials();

  if (!isConfigured) {
    return null;
  }

  if (!cachedClient) {
    try {
      cachedClient = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
    } catch (err) {
      console.warn('Erro ao inicializar Supabase client:', err);
      return null;
    }
  }

  return cachedClient;
}

export const isSupabaseConfigured = (): boolean => {
  return getSupabaseCredentials().isConfigured;
};

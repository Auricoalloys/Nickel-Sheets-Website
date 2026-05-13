(() => {
  const SUPABASE_URL = 'https://nnxiioeqroxutwwcqnpg.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ueGlpb2Vxcm94dXR3d2NxbnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NTc0NTMsImV4cCI6MjA2NDQzMzQ1M30.msCK7AQz4zmqauVSlWa6hpDWLGCkDRse7D4kxDPCVaw';
  const GOOGLE_CLIENT_ID =
    '484630972579-grdajldvjiaviievdsej8svl87hge2fj.apps.googleusercontent.com';

  const ACTIVITY_METADATA_KEY = 'aurico_activity_log';
  const LAST_ACTIVITY_METADATA_KEY = 'aurico_last_activity';
  const MAX_ACTIVITY_ITEMS = 50;
  const FLUSH_DELAY_MS = 1200;

  const pendingActivity = [];
  let flushTimer = null;
  let syncInProgress = false;
  let supabaseClient = null;
  let googleInitialized = false;

  function logInfo(message, payload) {
    if (typeof payload === 'undefined') {
      console.log(`[Auth] ${message}`);
      return;
    }
    console.log(`[Auth] ${message}`, payload);
  }

  function logWarn(message, payload) {
    if (typeof payload === 'undefined') {
      console.warn(`[Auth] ${message}`);
      return;
    }
    console.warn(`[Auth] ${message}`, payload);
  }

  function ensureSupabaseClient() {
    if (supabaseClient) {
      return supabaseClient;
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      return null;
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.auricoSupabaseClient = supabaseClient;
    return supabaseClient;
  }

  async function waitForSupabase(timeoutMs) {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      try {
        await loadScriptOnce('https://unpkg.com/@supabase/supabase-js@2', 'aurico-supabase-js');
      } catch (error) {
        throw new Error(error.message || 'Failed to load Supabase library.');
      }
    }

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const client = ensureSupabaseClient();
      if (client) {
        return client;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('Supabase library did not load in time.');
  }

  async function loadScriptOnce(src, id) {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        return;
      }

      await new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      });
      return;
    }

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  async function waitForGoogleIdentity(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('Google Identity Services did not load in time.');
  }

  function buildActivityEntry(type, details = {}) {
    return {
      type,
      path: window.location.pathname,
      query: window.location.search || '',
      title: document.title || '',
      occurred_at: new Date().toISOString(),
      details,
    };
  }

  function queueActivity(type, details = {}) {
    pendingActivity.push(buildActivityEntry(type, details));
    scheduleActivityFlush();
  }

  function scheduleActivityFlush() {
    if (flushTimer) {
      return;
    }

    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      syncActivityToAccount();
    }, FLUSH_DELAY_MS);
  }

  async function getCurrentUser(client) {
    const { data, error } = await client.auth.getSession();
    if (error) {
      throw error;
    }
    return data && data.session ? data.session.user : null;
  }

  async function syncActivityToAccount() {
    if (syncInProgress || pendingActivity.length === 0) {
      return;
    }

    const client = ensureSupabaseClient();
    if (!client) {
      scheduleActivityFlush();
      return;
    }

    let user = null;
    try {
      user = await getCurrentUser(client);
    } catch (error) {
      logWarn('Unable to read session while syncing activity.', error.message || error);
      scheduleActivityFlush();
      return;
    }

    if (!user) {
      return;
    }

    syncInProgress = true;
    const batch = pendingActivity.splice(0, pendingActivity.length);

    try {
      const metadata = user.user_metadata || {};
      const existing = Array.isArray(metadata[ACTIVITY_METADATA_KEY])
        ? metadata[ACTIVITY_METADATA_KEY]
        : [];
      const merged = existing.concat(batch).slice(-MAX_ACTIVITY_ITEMS);
      const lastActivity = batch[batch.length - 1];

      const { error } = await client.auth.updateUser({
        data: {
          [ACTIVITY_METADATA_KEY]: merged,
          [LAST_ACTIVITY_METADATA_KEY]: lastActivity,
        },
      });

      if (error) {
        throw error;
      }

      window.dispatchEvent(
        new CustomEvent('aurico:activity-synced', {
          detail: { eventsSynced: batch.length, lastActivity },
        })
      );
    } catch (error) {
      pendingActivity.unshift(...batch);
      logWarn('Failed to sync activity to user account metadata.', error.message || error);
      scheduleActivityFlush();
    } finally {
      syncInProgress = false;
      if (pendingActivity.length > 0) {
        scheduleActivityFlush();
      }
    }
  }

  async function handleCredentialResponse(response) {
    if (!response || !response.credential) {
      return;
    }

    const client = ensureSupabaseClient();
    if (!client) {
      logWarn('Supabase client is not available while handling Google credential.');
      return;
    }

    const { data, error } = await client.auth.signInWithIdToken({
      provider: 'google',
      token: response.credential,
    });

    if (error) {
      logWarn('Google sign-in failed.', error.message || error);
      return;
    }

    const user = data && data.user ? data.user : null;
    logInfo('Signed in with Google.', user ? { id: user.id, email: user.email } : undefined);
    queueActivity('google_sign_in', { provider: 'google' });
    syncActivityToAccount();
  }

  async function initGoogleOneTap() {
    if (googleInitialized) {
      return;
    }

    let client;
    try {
      client = await waitForSupabase(8000);
    } catch (error) {
      logWarn(error.message || error);
      return;
    }

    try {
      const user = await getCurrentUser(client);
      if (user) {
        queueActivity('page_view', { source: 'existing_session' });
        syncActivityToAccount();
        return;
      }
    } catch (error) {
      logWarn('Unable to inspect current session before Google prompt.', error.message || error);
    }

    try {
      await loadScriptOnce('https://accounts.google.com/gsi/client', 'aurico-google-gsi');
      await waitForGoogleIdentity(8000);
    } catch (error) {
      logWarn(error.message || error);
      return;
    }

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: false,
      context: 'signin',
    });

    window.google.accounts.id.prompt();
    googleInitialized = true;
  }

  function bindActivityTracking() {
    queueActivity('page_view', { source: 'page_load' });

    const trackClick = (selector, eventType) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.addEventListener('click', () => {
          queueActivity(eventType, {
            target: element.getAttribute('href') || element.id || element.className || 'unknown',
          });
        });
      });
    };

    trackClick('a[href^="mailto:"]', 'email_click');
    trackClick('a[href*="whatsapp"]', 'whatsapp_click');
    trackClick('.floating-form-button', 'inquiry_form_open');
    trackClick('.floating-form-submit', 'inquiry_form_submit_click');
  }

  function initLoadingAnimation() {
    function createParticles() {
      const overlay = document.getElementById('loading-overlay');
      if (!overlay) {
        return;
      }

      const colors = ['rgba(26, 82, 118, 0.6)', 'rgba(44, 62, 80, 0.6)', 'rgba(44, 62, 80, 0.6)'];

      setInterval(() => {
        const currentOverlay = document.getElementById('loading-overlay');
        if (!currentOverlay) {
          return;
        }

        const particle = document.createElement('div');
        particle.classList.add('particle');

        const size = Math.random() * 8 + 4;
        const color = colors[Math.floor(Math.random() * colors.length)];

        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.background = color;
        particle.style.left = `${Math.random() * 100}vw`;
        particle.style.animationDuration = `${Math.random() * 6 + 4}s`;

        currentOverlay.appendChild(particle);

        setTimeout(() => {
          particle.remove();
        }, 10000);
      }, 400);
    }

    function simulateProgress() {
      const progressBar = document.getElementById('progress-bar');
      if (!progressBar) {
        return;
      }

      let width = 0;
      const interval = setInterval(() => {
        if (width >= 100) {
          clearInterval(interval);
          return;
        }
        width += Math.random() * 5;
        progressBar.style.width = `${Math.min(width, 100)}%`;
      }, 300);
    }

    createParticles();
    simulateProgress();

    setTimeout(() => {
      const loadingContainer = document.getElementById('loading-container');
      const content = document.getElementById('content');
      if (loadingContainer) {
        loadingContainer.style.display = 'none';
      }
      if (content) {
        content.style.display = 'block';
      }
    }, 1000);
  }

  async function init() {
    try {
      await waitForSupabase(8000);
      const client = ensureSupabaseClient();
      if (client) {
        client.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && session && session.user) {
            queueActivity('session_signed_in', { provider: 'google' });
            syncActivityToAccount();
          }
        });
      }
    } catch (error) {
      logWarn(error.message || error);
    }

    bindActivityTracking();
    initLoadingAnimation();
    initGoogleOneTap();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

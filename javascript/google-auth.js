(() => {
  const supabaseUrl = 'https://nnxiioeqroxutwwcqnpg.supabase.co';
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ueGlpb2Vxcm94dXR3d2NxbnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NTc0NTMsImV4cCI6MjA2NDQzMzQ1M30.msCK7AQz4zmqauVSlWa6hpDWLGCkDRse7D4kxDPCVaw';
  const googleClientId = '484630972579-grdajldvjiaviievdsej8svl87hge2fj.apps.googleusercontent.com';

  const googleWaitTimeoutMs = 8000;
  let cachedNonce = null;
  let supabaseClient = null;

  function ensureSupabaseClient() {
    if (supabaseClient) {
      return supabaseClient;
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.error('Supabase client library is not loaded.');
      return null;
    }

    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    return supabaseClient;
  }

  function generateNonce() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }

    return `${Date.now()}${Math.random().toString(16).slice(2)}`;
  }

  function waitForGoogleIdentity(timeoutMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();

      const check = () => {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          resolve();
          return;
        }

        if (Date.now() - start >= timeoutMs) {
          reject(new Error('Google Identity Services did not load in time.'));
          return;
        }

        setTimeout(check, 50);
      };

      check();
    });
  }

  async function handleCredentialResponse(response) {
    if (!response || !response.credential) {
      console.warn('Google One Tap returned an empty credential.');
      return;
    }

    const client = ensureSupabaseClient();
    if (!client) {
      return;
    }

    const { error } = await client.auth.signInWithIdToken({
      provider: 'google',
      token: response.credential,
      nonce: cachedNonce,
    });

    if (error) {
      console.error('Supabase sign-in failed:', error.message);
    }
  }

  async function initGoogleOneTap() {
    const client = ensureSupabaseClient();
    if (!client) {
      return;
    }

    const { data } = await client.auth.getSession();
    if (data && data.session) {
      return;
    }

    try {
      await waitForGoogleIdentity(googleWaitTimeoutMs);
    } catch (error) {
      console.warn(error.message);
      return;
    }

    cachedNonce = generateNonce();
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: false,
      context: 'signin',
      nonce: cachedNonce,
    });

    window.google.accounts.id.prompt();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGoogleOneTap);
  } else {
    initGoogleOneTap();
  }
})();

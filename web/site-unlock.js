(() => {
  'use strict';
  const form = document.getElementById('unlock-form');
  const input = document.getElementById('site-password');
  const button = document.getElementById('unlock-button');
  const status = document.getElementById('unlock-status');
  const encoder = new TextEncoder();
  const bytes = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
  const originalFetch = window.fetch.bind(window);

  function validate(envelope) {
    if (envelope.version !== 1 || envelope.iterations !== 600000 || bytes(envelope.salt).length !== 16 || bytes(envelope.iv).length !== 12) throw new Error('Invalid encrypted content');
  }
  async function decrypt(envelope, key, kind) {
    validate(envelope);
    const plaintext = await crypto.subtle.decrypt({name:'AES-GCM', iv:bytes(envelope.iv), additionalData:encoder.encode(`uncsway:${kind}:v1`)}, key, bytes(envelope.ciphertext));
    return new TextDecoder().decode(plaintext);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || !input.value) return;
    if (!window.crypto?.subtle) { status.textContent = 'Otwórz stronę przez HTTPS, aby ją odblokować.'; return; }
    button.disabled = true;
    status.textContent = 'Odblokowywanie…';
    let envelope;
    try {
      const response = await originalFetch('protected.json', {cache:'no-store', signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('Unavailable');
      envelope = await response.json();
      validate(envelope);
    } catch {
      status.textContent = 'Nie można wczytać strony. Sprawdź połączenie i spróbuj ponownie.';
      button.disabled = false;
      return;
    }
    try {
      const material = await crypto.subtle.importKey('raw', encoder.encode(input.value), 'PBKDF2', false, ['deriveKey']);
      input.value = '';
      const key = await crypto.subtle.deriveKey({name:'PBKDF2', salt:bytes(envelope.salt), iterations:envelope.iterations, hash:'SHA-256'}, material, {name:'AES-GCM', length:256}, false, ['decrypt']);
      const html = await decrypt(envelope, key, 'page');
      // Keep only the non-extractable key in this page's memory. Nothing is
      // written to cookies, sessionStorage or localStorage.
      const calendarURL = new URL('api/events.enc.json', location.href);
      window.fetch = async (request, options) => {
        const url = new URL(typeof request === 'string' || request instanceof URL ? request : request.url, location.href);
        if (url.origin !== calendarURL.origin || url.pathname !== calendarURL.pathname) return originalFetch(request, options);
        const response = await originalFetch(request, {...options, cache:'no-store'});
        if (!response.ok) return response;
        const data = await response.json();
        const text = await decrypt(data, key, 'calendar');
        return new Response(text, {headers:{'Content-Type':'application/json'}});
      };
      document.open();
      document.write(html);
      document.close();
    } catch {
      status.textContent = 'Nieprawidłowe hasło. Spróbuj ponownie.';
      button.disabled = false;
      input.focus();
    }
  });
})();

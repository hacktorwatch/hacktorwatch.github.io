/* Interest collection is inactive until a public form endpoint is configured. */
(() => {
  'use strict';

  const CLOSED_MESSAGE =
    'The interest list opens soon. Follow the project on GitHub for updates.';
  const READY_MESSAGE =
    'We’ll email you about PCB and developer kit availability.';
  const ERROR_MESSAGE =
    'We couldn’t send your interest. Please try again.';
  const SUCCESS_MESSAGE =
    'Thanks. Your interest has been received. We’ll email you about availability.';
  const REQUEST_TIMEOUT_MS = 15000;

  function configuredEndpoint() {
    const value = window.HACKTOR_SITE_CONFIG?.interestEndpoint;
    if (typeof value !== 'string' || !value.trim()) return null;

    try {
      const endpoint = new URL(value.trim());
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(
        endpoint.hostname,
      );
      const validProtocol =
        endpoint.protocol === 'https:' ||
        (endpoint.protocol === 'http:' && loopback);

      if (!validProtocol || endpoint.username || endpoint.password || endpoint.hash) {
        return null;
      }
      return endpoint.href;
    } catch {
      return null;
    }
  }

  function hasErrorValue(value) {
    if (value == null || value === false || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  }

  function explicitlyRejected(payload) {
    if (payload === false) return true;
    if (!payload || typeof payload !== 'object') return false;

    if (
      payload.ok === false ||
      payload.success === false ||
      hasErrorValue(payload.error) ||
      hasErrorValue(payload.errors)
    ) {
      return true;
    }

    const status = String(payload.status ?? '').toLowerCase().trim();
    return ['error', 'failed', 'failure', 'invalid', 'rejected', 'denied', 'notok', 'not_ok'].includes(status);
  }

  async function acceptedResponse(response) {
    if (!response.ok) return false;

    const text = await response.text();
    if (!text.trim()) return true;

    // Accept: application/json is intentional. HTML is not a receipt.
    try {
      return !explicitlyRejected(JSON.parse(text));
    } catch {
      return false;
    }
  }

  function initializeForm(form) {
    const submit = form.querySelector('[data-interest-submit]');
    const status = form.querySelector('[data-interest-status]');
    const fields = form.querySelectorAll('input, select, textarea');

    function setAvailable(available) {
      fields.forEach((field) => { field.disabled = !available; });
      if (submit) submit.disabled = !available;
    }

    if (!submit || !status) {
      setAvailable(false);
      form.addEventListener('submit', (event) => event.preventDefault());
      return;
    }

    const validMarkup =
      form.querySelector('input[name="email"][type="email"][required]') &&
      form.querySelector('select[name="interest"][required]') &&
      form.querySelector('input[name="updatesConsent"][type="checkbox"][required]');
    const canSubmit = () =>
      Boolean(validMarkup && configuredEndpoint() && window.fetch && window.FormData);
    let pending = false;

    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    if (!status.hasAttribute('tabindex')) status.tabIndex = -1;

    function showMessage(message, state) {
      status.textContent = message;
      form.dataset.interestState = state;
    }

    const available = canSubmit();
    setAvailable(available);
    showMessage(available ? READY_MESSAGE : CLOSED_MESSAGE, available ? 'ready' : 'closed');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (pending) return;

      const endpoint = configuredEndpoint();
      if (!endpoint || !canSubmit()) {
        setAvailable(false);
        showMessage(CLOSED_MESSAGE, 'closed');
        return;
      }

      const honeypot = form.elements.namedItem('website');
      if (honeypot && String(honeypot.value).trim()) {
        showMessage(ERROR_MESSAGE, 'error');
        status.focus();
        return;
      }
      if (!form.reportValidity()) return;

      pending = true;
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      showMessage('Sending your interest…', 'pending');

      const controller = window.AbortController ? new AbortController() : null;
      const timeout = controller
        ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        : null;

      try {
        const response = await window.fetch(endpoint, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
          credentials: 'omit',
          mode: 'cors',
          cache: 'no-store',
          ...(controller ? { signal: controller.signal } : {}),
        });

        if (!(await acceptedResponse(response))) throw new Error('Not accepted');

        form.reset();
        showMessage(SUCCESS_MESSAGE, 'success');
        status.focus();
      } catch {
        // Preserve the entered values for a retry. Do not log personal data.
        showMessage(ERROR_MESSAGE, 'error');
        status.focus();
      } finally {
        if (timeout !== null) window.clearTimeout(timeout);
        pending = false;
        submit.removeAttribute('aria-busy');
        setAvailable(canSubmit());
      }
    });
  }

  function initialize() {
    document.querySelectorAll('form[data-interest-form]').forEach(initializeForm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();

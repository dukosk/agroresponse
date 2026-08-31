(function () {
  const DEFAULT_EVENT_SLUG = 'agrokomplex-nitra';

  function eventSlug() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('event') || DEFAULT_EVENT_SLUG;
    return /^[a-z0-9-]+$/.test(slug) ? slug : DEFAULT_EVENT_SLUG;
  }

  function withEvent(url) {
    const separator = url.includes('?') ? '&' : '?';
    return url + separator + 'event=' + encodeURIComponent(eventSlug());
  }

  function setEventLinks() {
    document.querySelectorAll('[data-event-link]').forEach(function (link) {
      link.href = withEvent(link.getAttribute('href'));
    });
  }

  function request(url, options) {
    return fetch(url, options).catch(function (error) {
      error.url = url;
      throw error;
    }).then(function (response) {
      return response.json().catch(function () {
        return { ok: false, error: 'Invalid JSON response.' };
      }).then(function (data) {
        if (data && data.ok === false) {
          const apiError = new Error(data.error || 'API request failed.');
          apiError.status = response.status;
          apiError.details = data.details;
          apiError.url = url;
          throw apiError;
        }

        if (!response.ok) {
          const error = new Error(data.error || 'Request failed.');
          error.status = response.status;
          error.details = data.details;
          error.url = url;
          throw error;
        }
        return data;
      });
    });
  }

  function get(url) {
    return request(url);
  }

  function logError(context, error) {
    console.error(context, {
      message: error && error.message,
      status: error && error.status,
      details: error && error.details,
      url: error && error.url,
      error: error,
    });
  }

  function post(url, body) {
    return request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function config() {
    return get('/api/config');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function title(value) {
    if (window.AgroI18n) {
      return window.AgroI18n.mapName(value);
    }
    const text = String(value || '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  window.AgroApi = {
    eventSlug,
    setEventLinks,
    get,
    post,
    config,
    escapeHtml,
    title,
    logError,
  };
})();

/**
 * Vicino a me/te: GPS prima, se manca o fallisce → stima via IP.
 */
(function () {
  function isPlausibleItalian(lat, lng) {
    return lat >= 35 && lat <= 48 && lng >= 6 && lng <= 19.5;
  }

  function setLabel(button, text) {
    button.textContent = text;
  }

  async function resolveComune(lat, lng) {
    try {
      const response = await fetch(
        `/api/geo/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) return '';
      const data = await response.json();
      return typeof data.comune === 'string' ? data.comune.trim() : '';
    } catch (_) {
      return '';
    }
  }

  async function goNear(button, base, lat, lng, source) {
    const url = new URL(base || '/notai', window.location.origin);
    if (button.dataset.nearMeTarget === 'funnel') {
      setLabel(button, 'Cerco gli studi vicini…');
      const comune = await resolveComune(lat, lng);
      if (comune) url.searchParams.set('comune', comune);
    } else {
      url.searchParams.set('vicino', '1');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lng', String(lng));
      if (source === 'ip') url.searchParams.set('geo', 'ip');
      else url.searchParams.delete('geo');
    }
    url.searchParams.delete('page');
    window.location.href = `${url.pathname}${url.search}`;
  }

  async function locationFromIp() {
    const endpoints = [
      'https://ipwho.is/',
      'https://ipapi.co/json/',
    ];
    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        const response = await fetch(endpoint, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) continue;
        const data = await response.json();
        let lat = null;
        let lng = null;
        if (data.latitude != null && data.longitude != null) {
          lat = Number(data.latitude);
          lng = Number(data.longitude);
        } else if (data.status === 'success' && data.lat != null && data.lon != null) {
          lat = Number(data.lat);
          lng = Number(data.lon);
        } else if (data.success !== false && data.latitude != null && data.longitude != null) {
          lat = Number(data.latitude);
          lng = Number(data.longitude);
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (!isPlausibleItalian(lat, lng)) continue;
        return { lat, lng };
      } catch (_) {
        // prova il prossimo endpoint
      }
    }
    return null;
  }

  function readGps() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isPlausibleItalian(lat, lng)) {
            resolve(null);
            return;
          }
          resolve({ lat, lng });
        },
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
      );
    });
  }

  async function handleNearMe(button) {
    const baseUrl = new URL(button.dataset.nearMeBase || '/notai', window.location.origin);
    const searchForm = button.closest('[data-notai-search]');
    if (searchForm instanceof HTMLFormElement) {
      const formData = new FormData(searchForm);
      const query = String(formData.get('q') || '').trim();
      const service = String(formData.get('servizio') || '').trim();
      if (query) baseUrl.searchParams.set('q', query);
      if (service) baseUrl.searchParams.set('servizio', service);
      baseUrl.searchParams.delete('comune');
    }
    const base = `${baseUrl.pathname}${baseUrl.search}`;
    const defaultLabel = button.dataset.nearMeLabel || button.textContent.trim() || 'Vicino a me';
    button.dataset.nearMeLabel = defaultLabel;
    button.disabled = true;
    setLabel(button, 'Rilevo la posizione…');

    const gps = await readGps();
    if (gps) {
      await goNear(button, base, gps.lat, gps.lng, 'gps');
      return;
    }

    setLabel(button, 'Stimo dalla rete…');
    const ip = await locationFromIp();
    if (ip) {
      await goNear(button, base, ip.lat, ip.lng, 'ip');
      return;
    }

    button.disabled = false;
    setLabel(button, 'Posizione non disponibile');
    window.setTimeout(() => {
      if (!button.disabled) setLabel(button, defaultLabel);
    }, 2600);
  }

  function bind() {
    document.querySelectorAll('[data-near-me]').forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) return;
      if (button.dataset.nearMeBound === '1') return;
      button.dataset.nearMeBound = '1';
      button.addEventListener('click', () => {
        handleNearMe(button);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();

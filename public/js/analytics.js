/**
 * Client analytics helpers for NotaioGiusto (GA4).
 * Loaded from BaseLayout; safe if gtag is blocked.
 */
(function () {
  function track(eventName, params) {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, params || {});
      }
    } catch (_) {}
  }

  window.ngTrack = track;

  function textOf(el) {
    return String(el?.getAttribute?.('aria-label') || el?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  // Funnel preventivo: step view
  const funnel = document.querySelector('[data-analytics-funnel]');
  if (funnel instanceof HTMLElement) {
    const step = Number(funnel.dataset.step || '0') || 0;
    track('preventivo_step', {
      step,
      step_name: funnel.dataset.stepName || `step_${step}`,
      service_slug: funnel.dataset.service || undefined,
      comune: funnel.dataset.comune || undefined,
      notary_count: funnel.dataset.notaryCount ? Number(funnel.dataset.notaryCount) : undefined,
    });
  }

  // Conversione: grazie / invio preventivo o claim
  const conversion = document.querySelector('[data-analytics-conversion]');
  if (conversion instanceof HTMLElement) {
    const leadType = conversion.dataset.type || 'quote_request';
    track('generate_lead', {
      lead_type: leadType,
      currency: 'EUR',
      value: 1,
    });
    if (leadType === 'quote_request') {
      track('quote_request_submit', {
        service_slug: conversion.dataset.service || undefined,
        comune: conversion.dataset.comune || undefined,
      });
    }
  }

  // Click tracking (CTA, tel, mailto, data-analytics-event)
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest('a, button, [data-analytics-event]');
      if (!(el instanceof HTMLElement)) return;

      const custom = el.getAttribute('data-analytics-event');
      if (custom) {
        const params = {};
        const raw = el.getAttribute('data-analytics-params');
        if (raw) {
          try {
            Object.assign(params, JSON.parse(raw));
          } catch (_) {}
        }
        track(custom, {
          link_text: textOf(el) || undefined,
          link_url: el instanceof HTMLAnchorElement ? el.href : undefined,
          ...params,
        });
        return;
      }

      if (el instanceof HTMLAnchorElement) {
        const href = el.getAttribute('href') || '';
        if (href.startsWith('tel:')) {
          track('click_to_call', { link_url: href, link_text: textOf(el) || undefined });
          return;
        }
        if (href.startsWith('mailto:')) {
          track('click_email', { link_url: href, link_text: textOf(el) || undefined });
          return;
        }
        if (
          el.classList.contains('btn') ||
          el.classList.contains('inline-action') ||
          el.closest('.sticky-actions, .listing-sticky-bar, .header-actions, .funnel-actions, .notary-hero-card')
        ) {
          track('cta_click', {
            link_url: el.href,
            link_text: textOf(el) || undefined,
            link_classes: el.className || undefined,
          });
        }
      } else if (el instanceof HTMLButtonElement && el.type === 'submit') {
        const form = el.closest('form');
        const action = form?.getAttribute('action') || window.location.pathname;
        track('form_submit_click', {
          form_action: action,
          link_text: textOf(el) || undefined,
        });
      }
    },
    true,
  );

  // Ricerca notai / servizi
  document.querySelectorAll('form[data-notai-search], form.notai-search').forEach((form) => {
    form.addEventListener('submit', () => {
      const data = new FormData(form);
      track('search', {
        search_term: String(data.get('q') || '').slice(0, 100) || undefined,
        comune: String(data.get('comune') || '').slice(0, 80) || undefined,
        servizio: String(data.get('servizio') || '').slice(0, 80) || undefined,
      });
    });
  });
})();

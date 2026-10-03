(() => {
  const normalize = (value) =>
    String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/['’`´]/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const score = (query, candidate) => {
    const value = normalize(candidate);
    if (!value || !query) return 0;
    if (value === query) return 100;
    if (value.startsWith(query)) return 85;
    if (value.includes(query)) return 75;
    const queryTokens = query.split(' ').filter((token) => token.length > 1);
    const valueTokens = value.split(' ');
    const matched = queryTokens.filter((token) =>
      valueTokens.some((part) => part.startsWith(token) || token.startsWith(part)),
    ).length;
    if (!matched) return 0;
    const coverage = matched / queryTokens.length;
    return coverage >= 0.66 ? 50 + Math.round(coverage * 15) : 0;
  };

  document.querySelectorAll('[data-service-autocomplete]').forEach((root, rootIndex) => {
    const input = root.querySelector('[data-service-autocomplete-input]');
    const list = root.querySelector('[data-service-autocomplete-list]');
    const form = root.closest('form');
    const hidden = form?.querySelector('[data-service-autocomplete-slug]');
    const payload = form?.querySelector('[data-service-autocomplete-options]');
    if (!(input instanceof HTMLInputElement) || !(list instanceof HTMLElement) || !payload) return;

    let services = [];
    try {
      services = JSON.parse(payload.textContent || '[]');
    } catch {
      services = [];
    }

    const listId = list.id || `service-autocomplete-${rootIndex + 1}`;
    list.id = listId;
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('role', 'combobox');
    list.setAttribute('role', 'listbox');

    let results = [];
    let activeIndex = -1;

    const close = () => {
      list.hidden = true;
      list.replaceChildren();
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      activeIndex = -1;
    };

    const choose = (item) => {
      input.value = item.name;
      if (hidden instanceof HTMLInputElement) hidden.value = item.slug;
      input.dispatchEvent(new CustomEvent('service-autocomplete-select', {
        bubbles: true,
        detail: item,
      }));
      close();
    };

    const setActive = (nextIndex) => {
      const options = [...list.querySelectorAll('[role="option"]')];
      if (!options.length) return;
      activeIndex = (nextIndex + options.length) % options.length;
      options.forEach((option, index) => {
        option.setAttribute('aria-selected', index === activeIndex ? 'true' : 'false');
      });
      const active = options[activeIndex];
      input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    };

    const render = () => {
      const query = normalize(input.value);
      if (query.length < 2) {
        close();
        return;
      }

      results = services
        .map((service) => {
          const candidates = [service.name, ...(service.terms || [])];
          const matches = candidates
            .map((term) => ({ term, score: score(query, term) }))
            .sort((left, right) => right.score - left.score);
          return { ...service, matchedTerm: matches[0]?.term || '', score: matches[0]?.score || 0 };
        })
        .filter((service) => service.score > 0)
        .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, 'it'))
        .slice(0, 6);

      list.replaceChildren();
      if (!results.length) {
        close();
        return;
      }

      results.forEach((item, index) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.id = `${listId}-option-${index}`;
        option.className = 'service-autocomplete__option';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');

        const main = document.createElement('strong');
        main.textContent = item.name;
        option.append(main);

        const meta = document.createElement('span');
        const matched = normalize(item.matchedTerm) !== normalize(item.name)
          ? item.matchedTerm
          : item.category;
        meta.textContent = matched || 'Prestazione notarile';
        option.append(meta);

        option.addEventListener('mousedown', (event) => event.preventDefault());
        option.addEventListener('click', () => choose(item));
        list.append(option);
      });

      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      activeIndex = -1;
    };

    input.addEventListener('input', () => {
      if (hidden instanceof HTMLInputElement) hidden.value = '';
      render();
    });
    input.addEventListener('focus', render);
    input.addEventListener('blur', () => window.setTimeout(close, 120));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (list.hidden) render();
        setActive(activeIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive(activeIndex - 1);
      } else if (event.key === 'Enter' && activeIndex >= 0 && results[activeIndex]) {
        event.preventDefault();
        choose(results[activeIndex]);
      } else if (event.key === 'Escape') {
        close();
      }
    });
    form?.addEventListener('submit', () => {
      if (hidden instanceof HTMLInputElement && hidden.value) input.disabled = true;
    });
  });
})();

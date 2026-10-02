const instances = new WeakMap();
let openInstance = null;
let generatedId = 0;

/** Replaces a native select's popup with an accessible, theme-aware listbox. */
export function initCustomSelect(select) {
  if (instances.has(select)) return instances.get(select);

  const labels = [...(select.labels ?? [])];
  const id = select.id || `settings-select-${++generatedId}`;
  if (!select.id) select.id = id;

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select';
  wrapper.dataset.customSelect = '';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = `${id}-trigger`;
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const valueLabel = document.createElement('span');
  valueLabel.className = 'custom-select-value';
  const chevron = document.createElement('span');
  chevron.className = 'custom-select-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  trigger.append(valueLabel, chevron);

  const menu = document.createElement('div');
  menu.id = `${id}-listbox`;
  menu.className = 'custom-select-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  const modal = select.closest('.modal');
  (modal ?? document.body).append(menu);

  select.before(wrapper);
  wrapper.append(select, trigger);
  select.classList.add('custom-select-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  trigger.setAttribute('aria-controls', menu.id);

  for (const [index, label] of labels.entries()) {
    if (!label.id) label.id = `${id}-label-${index + 1}`;
    label.htmlFor = trigger.id;
  }
  if (labels.length) {
    trigger.setAttribute('aria-labelledby', labels.map(label => label.id).join(' '));
  } else if (select.getAttribute('aria-labelledby')) {
    trigger.setAttribute('aria-labelledby', select.getAttribute('aria-labelledby'));
  } else if (select.getAttribute('aria-label')) {
    trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
  }
  if (trigger.getAttribute('aria-labelledby')) {
    menu.setAttribute('aria-labelledby', trigger.getAttribute('aria-labelledby'));
  } else if (trigger.getAttribute('aria-label')) {
    menu.setAttribute('aria-label', trigger.getAttribute('aria-label'));
  }

  let options = [];
  let activeIndex = -1;
  let isOpen = false;
  let searchText = '';
  let searchTimer = 0;

  function getEnabledOptionIndex(start, direction) {
    if (!options.length) return -1;
    let index = start;
    for (let count = 0; count < options.length; count += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index].disabled) return index;
    }
    return -1;
  }

  function setActive(index) {
    if (index < 0 || options[index]?.disabled) return;
    activeIndex = index;
    options.forEach((entry, optionIndex) => {
      entry.element.dataset.active = String(optionIndex === activeIndex);
    });
    trigger.setAttribute('aria-activedescendant', options[index].element.id);
    options[index].element.scrollIntoView({ block: 'nearest' });
  }

  function positionMenu() {
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 176), window.innerWidth - 16);
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${Math.max(72, Math.min(280, window.innerHeight - 16))}px`;

    const menuHeight = menu.offsetHeight;
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const openAbove = below < menuHeight && above > below;
    const available = Math.max(72, openAbove ? above : below);
    menu.style.maxHeight = `${Math.min(menuHeight, available)}px`;

    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const top = openAbove
      ? Math.max(8, rect.top - menu.offsetHeight - 6)
      : Math.min(window.innerHeight - menu.offsetHeight - 8, rect.bottom + 6);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function sync() {
    const selected = select.selectedOptions[0];
    valueLabel.textContent = selected?.label ?? '';
    if (selected) trigger.setAttribute('aria-valuetext', selected.label);
    else trigger.removeAttribute('aria-valuetext');
    trigger.disabled = select.disabled;
    wrapper.classList.toggle('is-disabled', select.disabled);
    if (select.disabled) close();
    if (select.getAttribute('aria-describedby')) {
      trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
    } else {
      trigger.removeAttribute('aria-describedby');
    }
    if (!labels.length) {
      if (select.getAttribute('aria-label')) {
        trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
      } else {
        trigger.removeAttribute('aria-label');
      }
    }

    options = [...select.options]
      .filter(option => !option.hidden)
      .map((option, index) => {
        const element = document.createElement('div');
        element.id = `${menu.id}-option-${index}`;
        element.className = 'custom-select-option';
        element.setAttribute('role', 'option');
        element.dataset.value = option.value;

        const text = document.createElement('span');
        text.className = 'custom-select-option-label';
        text.textContent = option.label;
        const check = document.createElement('span');
        check.className = 'custom-select-option-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = '✓';
        element.append(text, check);

        const selectedOption = option.value === select.value;
        element.setAttribute('aria-selected', String(selectedOption));
        if (option.disabled) element.setAttribute('aria-disabled', 'true');
        element.dataset.active = 'false';
        element.addEventListener('pointermove', () => setActive(index));
        element.addEventListener('click', () => {
          if (!option.disabled) choose(option.value);
        });
        return { value: option.value, label: option.label, disabled: option.disabled, element };
      });

    menu.replaceChildren(...options.map(option => option.element));
    if (isOpen) {
      activeIndex = options.findIndex(option => option.value === select.value && !option.disabled);
      if (activeIndex < 0) activeIndex = getEnabledOptionIndex(-1, 1);
      if (activeIndex >= 0) setActive(activeIndex);
      positionMenu();
    }
  }

  function open() {
    if (select.disabled || isOpen) return;
    openInstance?.close();
    isOpen = true;
    openInstance = instance;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    activeIndex = options.findIndex(option => option.value === select.value && !option.disabled);
    if (activeIndex < 0) activeIndex = getEnabledOptionIndex(-1, 1);
    positionMenu();
    if (activeIndex >= 0) setActive(activeIndex);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    options.forEach(option => { option.element.dataset.active = 'false'; });
    if (openInstance === instance) openInstance = null;
  }

  function choose(value) {
    if (select.disabled || options.find(option => option.value === value)?.disabled) return;
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sync();
    close();
    trigger.focus();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Tab') {
      close();
      return;
    }

    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (!isOpen) open();
      else setActive(getEnabledOptionIndex(activeIndex, event.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      if (!isOpen) return;
      event.preventDefault();
      const index = event.key === 'Home'
        ? getEnabledOptionIndex(-1, 1)
        : getEnabledOptionIndex(0, -1);
      setActive(index);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && isOpen) {
      event.preventDefault();
      if (activeIndex >= 0) choose(options[activeIndex].value);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      searchText += event.key.toLocaleLowerCase();
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => { searchText = ''; }, 700);
      const start = Math.max(0, activeIndex + 1);
      for (let offset = 0; offset < options.length; offset += 1) {
        const index = (start + offset) % options.length;
        if (!options[index].disabled
          && options[index].label.toLocaleLowerCase().startsWith(searchText)) {
          if (!isOpen) open();
          setActive(index);
          break;
        }
      }
    }
  }

  trigger.addEventListener('click', () => (isOpen ? close() : open()));
  trigger.addEventListener('keydown', onKeyDown);
  select.addEventListener('change', sync);

  function onOutsidePointer(event) {
    if (isOpen && !wrapper.contains(event.target) && !menu.contains(event.target)) close();
  }
  function onViewportChange(event) {
    if (event?.type === 'scroll' && (event.target === menu || menu.contains(event.target))) return;
    if (isOpen) close();
  }
  document.addEventListener('pointerdown', onOutsidePointer, true);
  document.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('resize', onViewportChange);

  const observer = new MutationObserver(sync);
  observer.observe(select, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
    attributeFilter: ['aria-describedby', 'aria-label', 'disabled', 'hidden', 'label', 'selected']
  });

  const instance = { close, refresh: sync };
  instances.set(select, instance);
  sync();
  return instance;
}

/** Refreshes the visible value after a settings controller updates select.value. */
export function refreshCustomSelect(select) {
  instances.get(select)?.refresh();
}

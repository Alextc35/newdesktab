/**
 * Initializes a reusable tab interface inside a given root element.
 *
 * Finds tab buttons and tab content panels, then wires the buttons
 * to show the matching panel when clicked.
 *
 * Behavior:
 * - Resolves the root element from a selector or DOM node
 * - Hides all tab panels before showing the selected one
 * - Applies the active class to the selected tab button
 * - Resets the selected panel scroll position to the top
 *
 * @param {Object} options
 * @param {string|Element} options.root - Root selector or element containing the tabs.
 * @param {string} options.tabButtonSelector - Selector for tab buttons inside the root.
 * @param {string} options.tabContentSelector - Selector for tab content panels inside the root.
 * @param {string} [options.activeClass='active'] - Class applied to the active tab button.
 * @param {string} [options.hiddenClass='is-hidden'] - Class used to hide inactive tab panels.
 * @param {AbortSignal} [options.signal] - Optional parent lifecycle signal.
 * @returns {{ activate: (tabId: string) => void, destroy: () => void }|void} Tab controls, or nothing if the root is not found.
 */
export function initTabs({
  root,
  tabButtonSelector,
  tabContentSelector,
  activeClass = 'active',
  hiddenClass = 'is-hidden',
  signal
}) {
  const rootEl =
    typeof root === 'string'
      ? document.querySelector(root)
      : root;

  if (!rootEl) return;

  const abortController = new AbortController();
  const eventOptions = { signal: abortController.signal };
  signal?.addEventListener('abort', () => abortController.abort(), { once: true });

  const buttons = rootEl.querySelectorAll(tabButtonSelector);
  const contents = rootEl.querySelectorAll(tabContentSelector);

  function activate(tabId) {
    buttons.forEach(btn => btn.classList.remove(activeClass));

    contents.forEach(tab => {
      tab.classList.add(hiddenClass);
    });

    const button = rootEl.querySelector(
      `${tabButtonSelector}[data-tab="${tabId}"]`
    );

    if (button) button.classList.add(activeClass);

    const content = rootEl.querySelector(`#${tabId}`);

    if (!content) return;

    content.classList.remove(hiddenClass);

    requestAnimationFrame(() => {
      content.scrollTop = 0;
    });
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      activate(btn.dataset.tab);
    }, eventOptions);
  });

  return { activate, destroy: () => abortController.abort() };
}

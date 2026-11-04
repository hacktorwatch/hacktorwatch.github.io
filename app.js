/* Progressive enhancement; all project content and links also work without JS. */
(() => {
  'use strict';
  document.documentElement.classList.remove('no-js');
  document.documentElement.classList.add('js');

  const menuButton = document.querySelector('[data-menu-toggle]');
  const navigation = document.getElementById('primary-nav');
  function closeMenu() {
    if (!menuButton || !navigation) return;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
    navigation.classList.remove('is-open');
  }
  if (menuButton && navigation) {
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      navigation.classList.toggle('is-open', open);
    });
    navigation.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navigation.classList.contains('is-open')) {
        closeMenu();
        menuButton.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('[data-header]')) closeMenu();
    });
    window.matchMedia('(min-width: 761px)').addEventListener('change', closeMenu);
  }

  document.querySelectorAll('[data-tabs]').forEach((group) => {
    const tabList = group.querySelector('[role="tablist"]');
    if (!tabList) return;
    const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
    const activate = (selected, focus = false) => {
      tabs.forEach((tab) => {
        const active = tab === selected;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        const panel = document.getElementById(tab.getAttribute('aria-controls'));
        if (panel) panel.hidden = !active;
      });
      if (focus) selected.focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', (event) => {
        let next;
        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
        if (event.key === 'Home') next = tabs[0];
        if (event.key === 'End') next = tabs[tabs.length - 1];
        if (next) {
          event.preventDefault();
          activate(next, true);
        }
      });
    });
  });

  const dialog = document.querySelector('[data-image-dialog]');
  if (dialog && typeof dialog.showModal === 'function') {
    const image = dialog.querySelector('[data-dialog-image]');
    const caption = dialog.querySelector('[data-dialog-caption]');
    let opener;
    document.querySelectorAll('a[data-lightbox]').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        opener = link;
        image.src = link.href;
        image.alt = link.dataset.caption || link.querySelector('img')?.alt || 'Project image';
        caption.textContent = link.dataset.caption || '';
        document.body.classList.add('dialog-is-open');
        dialog.showModal();
      });
    });
    dialog.querySelector('[data-dialog-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside) dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('dialog-is-open');
      opener?.focus({ preventScroll: true });
    });
  }

  const revealElements = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    revealElements.forEach((element) => observer.observe(element));
  } else {
    revealElements.forEach((element) => element.classList.add('is-visible'));
  }

  document.querySelectorAll('[data-copy-email]').forEach((button) => {
    const email = button.dataset.email || window.HACKTOR_SITE_CONFIG?.contactEmail;
    const card = button.closest('[data-contact-card]');
    const status = card?.querySelector('[data-copy-status]');
    if (!email || !status) return;
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(email);
        status.textContent = 'Email address copied.';
        status.dataset.copyState = 'success';
      } catch {
        const address = card.querySelector('[data-contact-email]');
        if (address && window.getSelection) {
          const range = document.createRange();
          range.selectNodeContents(address);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
        status.textContent = 'Email address selected. Copy it manually, or use the email button.';
        status.dataset.copyState = 'error';
      } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    });
  });

  // The visible fallback contact also works without JavaScript.
  const contact = window.HACKTOR_SITE_CONFIG?.privacyContact?.trim();
  if (contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    document.querySelectorAll('[data-privacy-contact]').forEach((element) => {
      const link = document.createElement('a');
      link.href = `mailto:${contact}`;
      link.textContent = contact;
      element.replaceChildren(link);
    });
  }
})();

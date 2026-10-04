'use strict';

/**
 * Header country selector: a button with the current edition and a dropdown with the five editions
 * (en, ja, zh-cn, ko, zh-tw — contract order). Each option is a plain link to the same page in that
 * edition; the runtime script stores the choice in the gs_locale cookie before navigating.
 */
const { EDITIONS, currentEdition, editionPath, RAW_LINK_MARK, t } = require('../../i18n');

// Edition labels are the native country names (한국, 日本, ...): marked data-name like other proper names.
// Small inline flags (flag emoji render as letters on Windows). Simplified artwork at 18x12.
const FLAG_ATTRS = 'class="gs-flag" width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" focusable="false"';
const FLAGS = {
  us: `<svg ${FLAG_ATTRS}><rect width="18" height="12" fill="#fff"/><path fill="#b22234" d="M0 0h18v1.2H0zM0 2.4h18v1.2H0zM0 4.8h18v1.2H0zM0 7.2h18v1.2H0zM0 9.6h18v1.2H0z"/><rect width="8" height="6.4" fill="#3c3b6e"/></svg>`,
  jp: `<svg ${FLAG_ATTRS}><rect width="18" height="12" fill="#fff"/><circle cx="9" cy="6" r="3.4" fill="#bc002d"/></svg>`,
  cn: `<svg ${FLAG_ATTRS}><rect width="18" height="12" fill="#de2910"/><circle cx="3.6" cy="3.2" r="1.6" fill="#ffde00"/><circle cx="7" cy="1.6" r=".6" fill="#ffde00"/><circle cx="8.2" cy="3.2" r=".6" fill="#ffde00"/><circle cx="8.2" cy="5" r=".6" fill="#ffde00"/><circle cx="7" cy="6.4" r=".6" fill="#ffde00"/></svg>`,
  kr: `<svg ${FLAG_ATTRS}><rect width="18" height="12" fill="#fff"/><path d="M6.2 6a2.8 2.8 0 0 1 5.6 0z" fill="#cd2e3a"/><path d="M6.2 6a2.8 2.8 0 0 0 5.6 0z" fill="#0047a0"/><path d="M2 2.2l1.6-1M2.4 3.2l1.6-1M14 9.8l1.6-1M14.4 10.8l1.6-1M14 2.2l1.6 1M14.4 1.2l1.6 1M2 9.8l1.6 1M2.4 8.8l1.6 1" stroke="#000" stroke-width=".7"/></svg>`,
  tw: `<svg ${FLAG_ATTRS}><rect width="18" height="12" fill="#fe0000"/><rect width="9" height="6" fill="#000095"/><circle cx="4.5" cy="3" r="1.7" fill="#fff"/></svg>`,
};

const CHEVRON = '<svg class="gs-lang-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const editionSelectorStyle = `
    .gs-lang { position: relative; flex-shrink: 0; font-size: 13px; }
    .gs-lang-btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px; border: 1px solid var(--border); border-radius: 10px; background: transparent; color: var(--text); font: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .gs-lang-btn:hover, .gs-lang-btn[aria-expanded="true"] { border-color: var(--primary); }
    .gs-flag { display: block; border-radius: 2px; box-shadow: 0 0 0 1px rgba(0,0,0,.12); flex-shrink: 0; }
    .gs-lang-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 100001; min-width: 168px; margin: 0; padding: 6px; list-style: none; background: var(--card, #fff); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-lg, 0 8px 24px rgba(0,0,0,.14)); }
    .gs-lang-menu[hidden] { display: none; }
    .gs-lang-menu a { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; color: var(--text); text-decoration: none; font-weight: 500; white-space: nowrap; }
    .gs-lang-menu a:hover, .gs-lang-menu a:focus-visible { background: var(--bg); }
    .gs-lang-menu a[aria-current="true"] { font-weight: 700; color: var(--primary); }
    .gs-lang-mobile { display: none; }
    @media (max-width: 768px) { .gs-lang-mobile { display: block; position: relative; flex: 0 0 auto; } .gs-lang-mobile .gs-lang-btn { height: 34px; padding: 0 8px; gap: 4px; background: transparent; } .gs-lang-mobile .gs-lang-code { font-size: 13px; line-height: 1; } }`;

function renderEditionSelector({ path = '/', variant = '' } = {}) {
  const current = currentEdition();
  const items = EDITIONS.map((e) => `<li><a href="${RAW_LINK_MARK}${editionPath(e.code, path)}" data-edition-link data-edition="${e.code}" data-prefix="${e.prefix}" lang="${e.htmlLang}" hreflang="${e.hreflang}"${e.code === current.code ? ' aria-current="true"' : ''}>${FLAGS[e.flag]}<span data-name>${e.label}</span></a></li>`).join('');
  // Mobile variant: compact flag + short country code (US/JP/CN/KR/TW); full labels stay in the dropdown.
  const currentText = variant === 'mobile' ? `<span class="gs-lang-code">${current.flag.toUpperCase()}</span>` : `<span class="gs-lang-label" data-name>${current.label}</span>`;
  return `<div class="gs-lang${variant ? ` gs-lang-${variant}` : ''}" data-edition-selector>
    <button type="button" class="gs-lang-btn" data-edition-toggle aria-haspopup="true" aria-expanded="false" aria-label="${t('header.country_edition')}"><span data-edition-current="${current.code}" style="display:inline-flex;align-items:center;gap:${variant === 'mobile' ? 4 : 6}px">${FLAGS[current.flag]}${currentText}</span>${CHEVRON}</button>
    <ul class="gs-lang-menu" data-edition-menu hidden>${items}</ul>
  </div>`;
}

// Runtime: open/close the menu; choosing an edition stores the cookie and opens the same path in that edition.
const editionSelectorScript = `<script>
(function() {
  var PREFIX_RE = /^\\/(?:ja|zh-cn|ko|zh-tw)(?=\\/|$)/;
  function closeAll(except) {
    document.querySelectorAll('[data-edition-selector]').forEach(function(sel) {
      if (sel === except) return;
      var menu = sel.querySelector('[data-edition-menu]');
      if (menu) menu.hidden = true;
      var btn = sel.querySelector('[data-edition-toggle]');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', function(event) {
    var link = event.target.closest && event.target.closest('[data-edition-link]');
    if (link) {
      event.preventDefault();
      var path = location.pathname.replace(PREFIX_RE, '') || '/';
      var target = (link.getAttribute('data-prefix') || '') + path + location.search + location.hash;
      document.cookie = 'gs_locale=' + link.getAttribute('data-edition') + '; Path=/; Max-Age=31536000; SameSite=Lax; Secure';
      location.href = target;
      return;
    }
    var toggle = event.target.closest && event.target.closest('[data-edition-toggle]');
    if (toggle) {
      var sel = toggle.closest('[data-edition-selector]');
      var menu = sel.querySelector('[data-edition-menu]');
      closeAll(sel);
      menu.hidden = !menu.hidden;
      toggle.setAttribute('aria-expanded', String(!menu.hidden));
      return;
    }
    closeAll(null);
  });
  document.addEventListener('keydown', function(event) { if (event.key === 'Escape') closeAll(null); });
})();
</script>`;

module.exports = { renderEditionSelector, editionSelectorStyle, editionSelectorScript };

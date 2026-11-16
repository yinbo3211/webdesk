/* WebDesk application logic. Zero hardcoded UI text: everything goes through WD.i18n.t(). */
(function () {
  'use strict';
  var I = window.WD.i18n;
  var t = I.t;

  var STORE_KEY = 'webdesk.data.v2';
  var VERSION = 2;
  var MAX_DOCK = 6;
  var EMOJIS = ['🎸', '🎹', '🎧', '📚', '🗺️', '💻', '🎨', '🌐', '📝', '📅', '⚙️', '🔍', '🚀', '💡', '🎯', '🧩'];

  /* First-run seed apps: names are system-generated => localized, URLs stay user/system data. */
  var SEED = [
    { url: 'https://www.bing.com/', nameKey: 'seed.1', emoji: '🔍', hue: 205 },
    { url: 'https://www.openstreetmap.org/', nameKey: 'seed.2', emoji: '🗺️', hue: 145 },
    { url: 'https://github.com/', nameKey: 'seed.3', emoji: '💻', hue: 265 },
    { url: 'https://developer.mozilla.org/', nameKey: 'seed.4', emoji: '📚', hue: 25 },
    { url: 'https://www.figma.com/', nameKey: 'seed.5', emoji: '🎨', hue: 330 },
    { url: 'https://www.deepl.com/', nameKey: 'seed.6', emoji: '🌐', hue: 220 }
  ];

  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  };

  /* ---------------- state ---------------- */
  function uid() { return 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
  function defaultState() {
    var apps = SEED.map(function (s, i) {
      return { id: uid(), url: s.url, name: t(s.nameKey), i18nKey: s.nameKey, icon: { type: 'emoji', value: s.emoji, hue: s.hue }, open: 'tab', pos: { page: 0, slot: i }, createdAt: Date.now(), openCount: 0 };
    });
    return {
      version: VERSION,
      locale: I.getLocale(),
      apps: apps,
      dock: apps.slice(0, 4).map(function (a) { return a.id; }),
      folders: [],
      settings: { theme: 'auto', wallpaper: '1', anim: true, onboardingDone: false },
      meta: { updatedAt: Date.now(), deviceId: uid() }
    };
  }

  /* PRD 12.3: per-version idempotent migration; unknown fields preserved, missing fields filled. */
  function migrate(d) {
    if (!d || typeof d !== 'object') return defaultState();
    var from = typeof d.version === 'number' ? d.version : 1;
    if (from > VERSION) return null; /* newer backup -> reject upstream */
    d.version = VERSION;
    if (!Array.isArray(d.apps)) d.apps = [];
    if (!Array.isArray(d.dock)) d.dock = [];
    if (!Array.isArray(d.folders)) d.folders = [];
    if (!d.settings) d.settings = {};
    if (!d.meta) d.meta = {};
    if (d.settings.theme === undefined) d.settings.theme = 'auto';
    if (d.settings.wallpaper === undefined) d.settings.wallpaper = '1';
    if (d.settings.anim === undefined) d.settings.anim = true;
    if (d.settings.onboardingDone === undefined) d.settings.onboardingDone = false;
    if (!d.meta.deviceId) d.meta.deviceId = uid();
    d.apps.forEach(function (a) {
      if (!a.id) a.id = uid();
      if (!a.icon) a.icon = { type: 'letter', value: (a.name || '?').slice(0, 1), hue: hueOf(a.url || a.name || '') };
      if (!a.pos) a.pos = { page: 0, slot: 0 };
      if (!a.open) a.open = 'tab';
      if (a.openCount === undefined) a.openCount = 0;
      if (!a.createdAt) a.createdAt = Date.now();
    });
    d.dock = d.dock.filter(function (id) { return d.apps.some(function (a) { return a.id === id; }); }).slice(0, MAX_DOCK);
    return d;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      var d = JSON.parse(raw);
      var migrated = migrate(d);
      return migrated || defaultState();
    } catch (e) { return defaultState(); }
  }

  var state = load();
  var ui = {
    form: 'desktop', cols: 8, rows: 6, capacity: 24, currentPage: 0,
    editing: false, drag: null, sheetMode: 'add', editingId: null,
    iconMode: 'auto', openMode: 'tab', emoji: '', uploadedIcon: '', pendingIcon: null,
    undo: null, toastTimer: null, bannerTimer: null, pressTimer: null,
    openPanel: null, focusIndex: 0, lastFocused: null, obStep: 0,
    layerUrl: '', searchKeyword: '', confirmCfg: null
  };

  function save() {
    state.meta.updatedAt = Date.now();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { showBanner(t('error.storage.full'), t('banner.export'), function () { doExport(); }); }
  }

  /* ---------------- helpers ---------------- */
  function displayName(app) { return app.i18nKey ? t(app.i18nKey) : app.name; }
  function hueOf(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function hostOf(url) { try { return new URL(url).hostname; } catch (e) { return ''; } }
  function originOf(url) { try { return new URL(url).origin; } catch (e) { return ''; } }
  function gradient(h) {
    var a = 'hsl(' + h + ', 68%, 62%)', b = 'hsl(' + ((h + 38) % 360) + ', 66%, 46%)';
    return 'linear-gradient(145deg,' + a + ',' + b + ')';
  }
  function normalizeUrl(raw) {
    var v = String(raw || '').trim();
    if (!v) return { ok: false, error: t('error.url.required') };
    if (!/^https?:\/\//i.test(v)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return { ok: false, error: t('error.url.protocol') };
      v = 'https://' + v;
    }
    try { var u = new URL(v); if (!/^https?:$/.test(u.protocol) || !u.hostname) throw 0; return { ok: true, url: u.href }; }
    catch (e) { return { ok: false, error: t('error.url.invalid') }; }
  }

  /* ---------------- dual-factor form detection (PRD 6.1) ---------------- */
  function detectForm() {
    var w = window.innerWidth;
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    if (w < 768) return 'phone';
    if (coarse) return 'tablet';
    return 'desktop';
  }
  function applyForm() {
    var f = detectForm();
    ui.form = f;
    var root = document.documentElement;
    root.setAttribute('data-form', f);
    if (f === 'phone') {
      ui.cols = 4;
      ui.rows = window.innerHeight < 700 ? 5 : 6;
      root.style.setProperty('--wd-cols', 4);
      root.style.setProperty('--wd-icon', '60px');
      root.style.setProperty('--wd-slot-w', '78px');
      root.style.setProperty('--wd-slot-h', '92px');
      root.style.setProperty('--wd-page-pad', '14px');
    } else if (f === 'tablet') {
      ui.cols = 6;
      ui.rows = 999;
      root.style.setProperty('--wd-cols', 6);
      root.style.setProperty('--wd-icon', '68px');
      root.style.setProperty('--wd-slot-w', '92px');
      root.style.setProperty('--wd-slot-h', '106px');
      root.style.setProperty('--wd-page-pad', '26px');
    } else {
      ui.cols = window.innerWidth >= 1600 ? 10 : 8;
      ui.rows = 999;
      root.style.setProperty('--wd-cols', ui.cols);
      root.style.setProperty('--wd-icon', '72px');
      root.style.setProperty('--wd-slot-w', '96px');
      root.style.setProperty('--wd-slot-h', '112px');
      root.style.setProperty('--wd-page-pad', '32px');
    }
    ui.capacity = f === 'phone' ? ui.cols * ui.rows : Math.max(state.apps.length, 1);
  }

  /* ---------------- icon rendering ---------------- */
  function iconNode(app, small) {
    var wrap = el('span', small ? 'dock__item' : 'app__icon');
    wrap.style.background = gradient(app.icon.hue !== undefined ? app.icon.hue : hueOf(app.url || displayName(app)));
    if (app.icon.type === 'image' && app.icon.value) {
      var img = el('img'); img.src = app.icon.value; img.alt = '';
      img.addEventListener('error', function () { wrap.textContent = (displayName(app) || '?').slice(0, 1); wrap.classList.add('app__letter'); });
      wrap.appendChild(img);
    } else if (app.icon.type === 'emoji' && app.icon.value) {
      wrap.appendChild(el('span', 'app__emoji', app.icon.value));
    } else {
      wrap.appendChild(el('span', 'app__letter', (displayName(app) || '?').slice(0, 1).toUpperCase()));
    }
    return wrap;
  }

  /* ---------------- render desktop ---------------- */
  function renderDesk() {
    applyForm();
    var pages = $('#pages');
    pages.textContent = '';
    var apps = state.apps;
    var pageCount = ui.form === 'phone' ? Math.max(1, Math.ceil(apps.length / ui.capacity)) : 1;
    if (ui.currentPage >= pageCount) ui.currentPage = pageCount - 1;
    if (ui.currentPage < 0) ui.currentPage = 0;

    for (var p = 0; p < pageCount; p++) {
      var page = el('div', 'page');
      page.setAttribute('data-page', p);
      page.setAttribute('role', 'group');
      page.setAttribute('aria-label', t('a11y.page', { n: p + 1, total: pageCount }));
      var slice = ui.form === 'phone' ? apps.slice(p * ui.capacity, (p + 1) * ui.capacity) : apps;
      if (slice.length === 0 && p === 0) {
        page.appendChild(emptyState());
      } else {
        slice.forEach(function (app) { page.appendChild(appNode(app)); });
      }
      pages.appendChild(page);
    }
    renderPager(pageCount);
    renderDock();
    renderChrome();
  }

  function emptyState() {
    var box = el('div', 'empty');
    var art = el('div', 'empty__art');
    art.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/></svg>';
    box.appendChild(art);
    box.appendChild(el('h3', 'empty__title', t('desktop.empty.title')));
    box.appendChild(el('p', 'empty__desc', t('desktop.empty.desc')));
    var btn = el('button', 'btn-primary', t('desktop.empty.cta'));
    btn.addEventListener('click', function () { openSheet('add'); });
    box.appendChild(btn);
    return box;
  }

  function appNode(app) {
    var btn = el('button', 'app');
    btn.setAttribute('data-id', app.id);
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', t('a11y.app.open', { name: displayName(app) }));
    btn.setAttribute('data-i18n-aria-key', 'a11y.app.open');
    btn.setAttribute('data-name', displayName(app));
    btn.setAttribute('data-tabindex', '0');
    btn.tabIndex = 0;
    btn.appendChild(iconNode(app, false));
    btn.appendChild(el('span', 'app__name', displayName(app)));

    var badge = el('span', 'app__badge', '×');
    badge.setAttribute('role', 'button');
    badge.setAttribute('aria-label', t('a11y.app.delete', { name: displayName(app) }));
    badge.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    badge.addEventListener('click', function (e) { e.stopPropagation(); requestDelete(app, btn); });
    btn.appendChild(badge);

    bindAppPointer(btn, app);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openApp(app); }
    });
    return btn;
  }

  function renderPager(count) {
    var pager = $('#pager');
    pager.textContent = '';
    if (ui.form !== 'phone' || count <= 1) { pager.hidden = true; return; }
    pager.hidden = false;
    for (var i = 0; i < count; i++) {
      (function (idx) {
        var d = el('button', 'pager__dot' + (idx === ui.currentPage ? ' is-active' : ''));
        d.setAttribute('aria-label', t('a11y.page', { n: idx + 1, total: count }));
        d.setAttribute('aria-current', idx === ui.currentPage ? 'true' : 'false');
        d.addEventListener('click', function () { goPage(idx); });
        pager.appendChild(d);
      })(i);
    }
  }

  function goPage(idx) {
    ui.currentPage = idx;
    var vp = $('#viewport');
    vp.scrollTo({ left: idx * vp.clientWidth, behavior: document.documentElement.classList.contains('no-anim') ? 'auto' : 'smooth' });
    renderPager(Math.ceil(state.apps.length / ui.capacity));
  }

  /* ---------------- dock ---------------- */
  function renderDock() {
    var dock = $('#dock');
    dock.textContent = '';
    dock.setAttribute('aria-label', t('a11y.dock'));
    var members = state.dock.map(function (id) { return state.apps.filter(function (a) { return a.id === id; })[0]; }).filter(Boolean);
    if (!members.length) { dock.appendChild(el('span', 'dock__empty', t('dock.empty'))); return; }
    members.slice(0, MAX_DOCK).forEach(function (app) {
      var item = iconNode(app, true);
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', t('a11y.app.open', { name: displayName(app) }));
      item.setAttribute('title', displayName(app));
      var fire = function () { openApp(app); };
      item.addEventListener('click', fire);
      item.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
      dock.appendChild(item);
    });
    var add = el('button', 'dock__item', '+');
    add.style.background = 'var(--fill-soft)';
    add.style.color = 'var(--text-primary)';
    add.setAttribute('aria-label', t('a11y.add'));
    add.addEventListener('click', function () { openSheet('add'); });
    dock.appendChild(add);
  }

  function renderChrome() {
    $('#brandMeta').textContent = t('format.appCount', { count: state.apps.length });
    var hint = $('#hint');
    hint.textContent = ui.form === 'phone' ? t('desktop.hint.longpress') : t('desktop.hint.click');
    $('#desk').setAttribute('aria-label', t('a11y.desktop', { count: state.apps.length }));
    var langName = I.META[I.getLocale()].localName;
    $('#btnLang').setAttribute('aria-label', t('a11y.lang', { name: langName }));
    $('#btnLang').setAttribute('title', t('topbar.lang'));
    var themeNameKey = state.settings.theme === 'auto' ? 'settings.theme.auto' : (state.settings.theme === 'dark' ? 'settings.theme.dark' : 'settings.theme.light');
    $('#btnTheme').setAttribute('aria-label', t('a11y.theme', { name: t(themeNameKey) }));
    $('#btnTheme').setAttribute('title', t('topbar.theme'));
    $('#btnSettings').setAttribute('aria-label', t('a11y.settings'));
    $('#btnSettings').setAttribute('title', t('topbar.settings'));
    $('#btnSearch').setAttribute('aria-label', t('a11y.search'));
    $('#btnSearch').setAttribute('title', t('topbar.search'));
    $('#btnAdd').setAttribute('aria-label', t('a11y.add'));
    $('#btnAdd').setAttribute('title', t('topbar.add'));
    $('#toastUndo').textContent = t('toast.undo');
    $('#toastUndo').setAttribute('aria-label', t('a11y.undo'));
    $('#layerBack').setAttribute('title', t('layer.back'));
    $('#layerNewTab').setAttribute('title', t('layer.newtab'));
    $('#layerClose').setAttribute('title', t('layer.close'));
  }

  /* ---------------- open app ---------------- */
  function openApp(app) {
    if (ui.editing) return;
    app.openCount = (app.openCount || 0) + 1;
    save();
    if (app.open === 'layer' && originOf(app.url) === window.location.origin) {
      openLayer(app);
    } else if (app.open === 'layer') {
      window.open(app.url, '_blank', 'noopener,noreferrer');
      showToast(t('toast.layer.blocked'));
    } else {
      window.open(app.url, '_blank', 'noopener,noreferrer');
    }
  }

  function openLayer(app) {
    ui.layerUrl = app.url;
    $('#layerTitle').textContent = displayName(app);
    $('#layerFrame').setAttribute('title', displayName(app));
    $('#layerFrame').src = app.url;
    $('#layer').classList.add('is-open');
    $('#layerBack').focus();
  }
  function closeLayer() {
    $('#layer').classList.remove('is-open');
    $('#layerFrame').src = 'about:blank';
    ui.layerUrl = '';
  }

  function bindAppPointer(node, app) {
    var st = null;
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); openContextMenu(e.clientX, e.clientY, app); });
    node.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.classList && e.target.classList.contains('app__badge')) return;
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, longFired: false, dragging: false };
      ui.pressTimer = setTimeout(function () {
        if (!st) return;
        st.longFired = true;
        setEditing(true);
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (x) {} }
      }, 500);
    });
    document.addEventListener('pointermove', function (e) {
      if (!st || e.pointerId !== st.id) return;
      var dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.moved && Math.abs(dx) + Math.abs(dy) > 8) {
        st.moved = true;
        clearTimeout(ui.pressTimer);
        if (ui.form !== 'phone' && !ui.editing) setEditing(true);
      }
      if (st.moved && ui.editing && !st.dragging) {
        st.dragging = true;
        node.classList.add('is-dragging');
        node.style.touchAction = 'none';
        document.body.style.cursor = 'grabbing';
      }
      if (st.dragging) { e.preventDefault(); moveDrag(e.clientX, e.clientY, node); }
    }, { passive: false });
    function end(e) {
      if (!st || (e.pointerId !== undefined && e.pointerId !== st.id)) return;
      clearTimeout(ui.pressTimer);
      var wasDragging = st.dragging, wasMoved = st.moved, wasLong = st.longFired;
      st = null;
      node.classList.remove('is-dragging'); node.style.touchAction = '';
      document.body.style.cursor = '';
      if (wasDragging) { finishDrag(node); return; }
      if (!wasMoved && !wasLong && !ui.editing) openApp(app);
    }
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }

  function moveDrag(x, y, node) {
    var under = document.elementFromPoint(x, y);
    if (!under) return;
    var target = under.closest ? under.closest('.app') : null;
    if (!target || target === node || !target.parentNode || target.parentNode !== node.parentNode) return;
    var rect = target.getBoundingClientRect();
    var before = (x < rect.left + rect.width / 2);
    if (document.documentElement.getAttribute('dir') === 'rtl' && (x !== rect.left + rect.width / 2)) before = !before;
    try {
      if (before) node.parentNode.insertBefore(node, target);
      else node.parentNode.insertBefore(node, target.nextSibling);
    } catch (e) {}
  }

  function finishDrag(node) {
    var page = node.parentNode;
    var ids = Array.prototype.slice.call(page.querySelectorAll('.app')).map(function (n) { return n.getAttribute('data-id'); });
    var byId = {};
    state.apps.forEach(function (a) { byId[a.id] = a; });
    var reordered = [];
    ids.forEach(function (id) { if (byId[id]) { reordered.push(byId[id]); delete byId[id]; } });
    Object.keys(byId).forEach(function (id) { reordered.push(byId[id]); });
    var changed = reordered.some(function (a, i) { return state.apps[i] && state.apps[i].id !== a.id; });
    if (changed) {
      var prev = state.apps.slice();
      state.apps = reordered;
      state.apps.forEach(function (a, i) { a.pos = { page: 0, slot: i }; });
      save();
      showToast(t('toast.saved'), t('toast.undo.arrange'), function () { state.apps = prev; save(); renderDesk(); }, 10000);
    }
    renderDesk();
  }

  function setEditing(on) {
    ui.editing = on;
    document.documentElement.classList.toggle('is-editing', on);
    renderChrome();
    var bar = $('#editBar');
    if (on && !bar) {
      bar = el('button', 'btn-primary', t('editor.done'));
      bar.id = 'editBar';
      bar.style.cssText = 'position:fixed;z-index:30;inset-block-start:calc(70px + var(--safe-top));inset-inline-start:50%;transform:translateX(-50%);padding:0 20px;min-height:36px;font-size:14px;';
      if (document.documentElement.getAttribute('dir') === 'rtl') bar.style.transform = 'translateX(50%)';
      bar.addEventListener('click', function () { setEditing(false); });
      document.body.appendChild(bar);
    } else if (!on && bar) { bar.remove(); }
    if (on) showToast(t('editor.hint'));
  }

  /* ---------------- delete / undo ---------------- */
  function requestDelete(app, node) {
    showConfirm({
      title: t('editor.delete.confirm', { name: displayName(app) }),
      desc: '',
      danger: true,
      action: t('editor.delete.action'),
      onConfirm: function () {
        var idx = state.apps.findIndex(function (a) { return a.id === app.id; });
        var removed = state.apps.splice(idx, 1)[0];
        state.dock = state.dock.filter(function (id) { return id !== app.id; });
        save();
        renderDesk();
        showToast(t('toast.deleted', { name: displayName(removed) }), t('toast.undo'), function () {
          state.apps.splice(Math.min(idx, state.apps.length), 0, removed);
          save(); renderDesk();
        }, 5000);
      }
    });
  }

  /* ---------------- sheet: add / edit ---------------- */
  function openSheet(mode, app) {
    ui.sheetMode = mode; ui.editingId = app ? app.id : null;
    ui.iconMode = app ? app.icon.type : 'auto';
    ui.openMode = app ? app.open : 'tab';
    ui.emoji = app && app.icon.type === 'emoji' ? app.icon.value : '';
    ui.uploadedIcon = app && app.icon.type === 'image' ? app.icon.value : '';
    ui.pendingIcon = app ? app.icon : null;
    closePanels();
    $('#sheetTitle').textContent = mode === 'edit' ? t('sheet.edit.title') : t('sheet.add.title');
    $('#fUrl').value = app ? app.url : '';
    $('#fName').value = app ? displayName(app) : '';
    $('#fUrlErr').textContent = ''; $('#fNameErr').textContent = '';
    syncSegmented('#iconMode', ui.iconMode);
    syncSegmented('#openMode', ui.openMode);
    syncIconExtra();
    $('#sheet').classList.add('is-open');
    $('#scrim').classList.add('is-open');
    setTimeout(function () { if (mode === 'add') $('#fUrl').focus(); }, 280);
  }
  function closeSheet() { $('#sheet').classList.remove('is-open'); if (!ui.openPanel) $('#scrim').classList.remove('is-open'); }

  function syncSegmented(sel, mode) {
    $$(sel + ' button').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-mode') === mode); });
  }
  function syncIconExtra() {
    var extra = $('#iconExtra'), emojiInput = $('#fEmoji'), picks = $('#emojiPicks'), file = $('#fIconFile');
    var show = ui.iconMode !== 'auto';
    extra.hidden = !show;
    emojiInput.hidden = ui.iconMode !== 'emoji';
    file.hidden = ui.iconMode !== 'upload';
    picks.hidden = ui.iconMode !== 'emoji';
    $('#iconHint').textContent = ui.iconMode === 'upload' ? (ui.uploadedIcon ? t('sheet.fetch.ok') : '') : '';
    if (ui.iconMode === 'emoji') {
      emojiInput.value = ui.emoji;
      picks.textContent = '';
      EMOJIS.forEach(function (em) {
        var b = el('button', ui.emoji === em ? 'is-active' : '', em);
        b.type = 'button';
        b.addEventListener('click', function () { ui.emoji = em; emojiInput.value = em; syncIconExtra(); });
        picks.appendChild(b);
      });
    }
  }

  function sheetIconResult(app) {
    if (ui.iconMode === 'emoji') {
      var v = $('#fEmoji').value.trim() || ui.emoji;
      return v ? { type: 'emoji', value: v, hue: hueOf(v + (app ? app.url : '')) } : { type: 'letter', value: '', hue: 210 };
    }
    if (ui.iconMode === 'upload') return ui.uploadedIcon ? { type: 'image', value: ui.uploadedIcon, hue: 210 } : { type: 'letter', value: '', hue: 210 };
    if (ui.pendingIcon && ui.pendingIcon.type !== 'letter') return ui.pendingIcon;
    return null;
  }

  function submitSheet(e) {
    e.preventDefault();
    $('#fUrlErr').textContent = ''; $('#fNameErr').textContent = '';
    var nu = normalizeUrl($('#fUrl').value);
    if (!nu.ok) { $('#fUrlErr').textContent = nu.error; $('#fUrl').focus(); return; }
    var name = $('#fName').value.trim();
    if (name.length > 40) { $('#fNameErr').textContent = t('error.name.long', { max: 40 }); return; }
    if (!name) name = deriveName(nu.url);
    var existing = ui.sheetMode === 'edit' ? state.apps.filter(function (a) { return a.id === ui.editingId; })[0] : null;
    var icon = sheetIconResult(existing);
    var open = ui.openMode;
    if (existing) {
      var nameChanged = name !== displayName(existing);
      if (nameChanged) delete existing.i18nKey;
      existing.url = nu.url; existing.name = name; existing.open = open;
      if (icon) existing.icon = icon;
      save(); renderDesk(); closeSheet(); showToast(t('toast.saved'));
      return;
    }
    var app = { id: uid(), url: nu.url, name: name, icon: icon || { type: 'letter', value: name.slice(0, 1), hue: hueOf(nu.url) }, open: open, pos: { page: 0, slot: state.apps.length }, createdAt: Date.now(), openCount: 0 };
    state.apps.push(app);
    if (state.dock.length < 4) state.dock.push(app.id);
    save(); renderDesk(); closeSheet();
    showToast(t('toast.added', { name: displayName(app) }));
    if (!icon) probeFavicon(app, nu.url);
  }

  function deriveName(url) {
    var h = hostOf(url).replace(/^www\./, '');
    var first = h.split('.')[0] || 'Web';
    return first.charAt(0).toUpperCase() + first.slice(1);
  }

  function probeFavicon(app, url) {
    var host = hostOf(url), origin = originOf(url);
    var candidates = [];
    if (origin) candidates.push(origin + '/favicon.ico');
    if (host) {
      candidates.push('https://icons.duckduckgo.com/ip3/' + host + '.ico');
      candidates.push('https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=128');
    }
    var i = 0;
    function next() {
      if (i >= candidates.length) return;
      var src = candidates[i++];
      var img = new Image();
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; next(); } }, 3000);
      img.onload = function () {
        if (done) return; done = true; clearTimeout(timer);
        if (img.naturalWidth < 8) { next(); return; }
        var target = state.apps.filter(function (a) { return a.id === app.id; })[0];
        if (target) { target.icon = { type: 'image', value: src, hue: app.icon.hue }; save(); renderDesk(); }
      };
      img.onerror = function () { if (done) return; done = true; clearTimeout(timer); next(); };
      img.src = src;
    }
    next();
  }

  /* ---------------- panels ---------------- */
  function openPanel(id) {
    closeSheet();
    $$('.panel').forEach(function (p) { p.classList.remove('is-open'); });
    var p = document.getElementById(id);
    if (!p) return;
    ui.openPanel = id;
    p.classList.add('is-open');
    $('#scrim').classList.add('is-open');
    var f = p.querySelector('input:not([hidden]), button');
    if (f) setTimeout(function () { f.focus(); }, 200);
  }
  function closePanels() {
    ui.openPanel = null;
    $$('.panel').forEach(function (p) { p.classList.remove('is-open'); });
    if (!$('#sheet').classList.contains('is-open')) $('#scrim').classList.remove('is-open');
  }

  /* ---------------- settings ---------------- */
  function renderSettings() {
    var b = $('#settingsBody'); b.textContent = '';
    b.appendChild(el('div', 'section-title', t('settings.section.appearance')));
    var c1 = el('div', 'card');
    c1.appendChild(themeRow());
    c1.appendChild(wallpaperRow());
    c1.appendChild(switchRow(t('settings.anim'), t('settings.anim.desc'), state.settings.anim !== false, function (v) {
      state.settings.anim = v; save(); applyAnim();
    }));
    b.appendChild(c1);

    b.appendChild(el('div', 'section-title', t('settings.section.language')));
    var c2 = el('div', 'card');
    var langRow = el('button', 'link-row');
    var main = el('div');
    main.appendChild(el('div', 'setting__label', t('settings.language')));
    main.appendChild(el('div', 'setting__desc', t('settings.language.desc')));
    langRow.appendChild(main);
    langRow.appendChild(el('span', 'setting__label', I.META[I.getLocale()].localName));
    langRow.appendChild(el('span', 'link-row__chev', '›'));
    langRow.addEventListener('click', renderLanguage);
    c2.appendChild(langRow);
    b.appendChild(c2);

    b.appendChild(el('div', 'section-title', t('settings.section.data')));
    var c3 = el('div', 'card');
    c3.appendChild(dockRow());
    c3.appendChild(linkRow(t('settings.data.export'), t('settings.data.export.desc'), doExport));
    c3.appendChild(linkRow(t('settings.data.import'), t('settings.data.import.desc'), function () { $('#importFile').click(); }));
    var clr = linkRow(t('settings.data.clear'), t('settings.data.clear.desc'), confirmClear);
    clr.querySelector('.setting__label').style.color = 'var(--system-red)';
    c3.appendChild(clr);
    b.appendChild(c3);

    b.appendChild(el('div', 'section-title', t('settings.section.help')));
    var c4 = el('div', 'card');
    c4.appendChild(linkRow(t('settings.help.replay'), '', function () { closePanels(); startOnboarding(true); }));
    c4.appendChild(linkRow(t('settings.help.shortcuts'), '', openShortcuts));
    c4.appendChild(linkRow(t('help.title'), '', openHelp));
    c4.appendChild(linkRow(t('settings.help.feedback'), '', sendFeedback));
    b.appendChild(c4);

    var about = el('div', 'section-title', t('settings.about'));
    b.appendChild(about);
    b.appendChild(el('p', 'panel__subtitle', t('settings.about.desc', { version: '2.0.0' })));
  }

  function themeRow() {
    var row = el('div', 'setting');
    var m = el('div', 'setting__main');
    m.appendChild(el('div', 'setting__label', t('settings.theme')));
    m.appendChild(el('div', 'setting__desc', t('settings.theme.desc')));
    row.appendChild(m);
    var seg = el('div', 'mini-seg');
    [['auto', 'settings.theme.auto'], ['light', 'settings.theme.light'], ['dark', 'settings.theme.dark']].forEach(function (p) {
      var btn = el('button', state.settings.theme === p[0] ? 'is-active' : '', t(p[1]));
      btn.addEventListener('click', function () { state.settings.theme = p[0]; save(); applyTheme(); renderSettings(); renderChrome(); });
      seg.appendChild(btn);
    });
    row.appendChild(seg);
    return row;
  }
  function wallpaperRow() {
    var row = el('div', 'setting');
    row.style.flexWrap = 'wrap';
    var m = el('div', 'setting__main');
    m.style.flex = '1 0 100%';
    m.appendChild(el('div', 'setting__label', t('settings.wallpaper')));
    m.appendChild(el('div', 'setting__desc', t('settings.wallpaper.desc')));
    row.appendChild(m);
    var grid = el('div', 'wp-grid');
    grid.style.flex = '1 0 100%';
    for (var i = 1; i <= 9; i++) {
      (function (n) {
        var key = n === 9 ? 'solid' : String(n);
        var item = el('button', 'wp-item' + (state.settings.wallpaper === key ? ' is-active' : ''));
        item.setAttribute('data-wp', key);
        item.setAttribute('aria-label', t('a11y.wallpaper', { name: key === 'solid' ? t('settings.wallpaper.solid') : t('wallpaper.' + key) }));
        item.appendChild(el('span', '', key === 'solid' ? t('settings.wallpaper.solid') : t('wallpaper.' + key)));
        item.addEventListener('click', function () { setWallpaper(key); renderSettings(); });
        grid.appendChild(item);
      })(i);
    }
    var up = el('button', 'btn-primary btn-soft', t('settings.wallpaper.upload'));
    up.style.cssText = 'grid-column:1/-1;min-height:36px;font-size:13px;';
    up.addEventListener('click', function () { $('#wallpaperFile').click(); });
    grid.appendChild(up);
    row.appendChild(grid);
    return row;
  }
  function switchRow(label, desc, on, fn) {
    var row = el('div', 'setting');
    var m = el('div', 'setting__main');
    m.appendChild(el('div', 'setting__label', label));
    if (desc) m.appendChild(el('div', 'setting__desc', desc));
    row.appendChild(m);
    var sw = el('button', 'switch' + (on ? ' is-on' : ''));
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    sw.setAttribute('aria-label', label);
    sw.addEventListener('click', function () {
      var now = !sw.classList.contains('is-on');
      sw.classList.toggle('is-on', now);
      sw.setAttribute('aria-checked', now ? 'true' : 'false');
      fn(now);
    });
    row.appendChild(sw);
    return row;
  }
  function linkRow(label, desc, fn) {
    var row = el('button', 'link-row');
    var m = el('div');
    m.appendChild(el('div', 'setting__label', label));
    if (desc) m.appendChild(el('div', 'setting__desc', desc));
    row.appendChild(m);
    row.appendChild(el('span', 'link-row__chev', '›'));
    row.addEventListener('click', fn);
    return row;
  }

  /* FR-17: Dock editor — reorder and remove members, max 6. */
  function dockRow() {
    var row = el('button', 'link-row');
    var m = el('div');
    m.appendChild(el('div', 'setting__label', t('editor.dockEdit')));
    m.appendChild(el('div', 'setting__desc', t('editor.dockHint', { max: MAX_DOCK })));
    row.appendChild(m);
    row.appendChild(el('span', 'link-row__chev', '›'));
    row.addEventListener('click', openDockPanel);
    return row;
  }
  function openDockPanel() { renderDockPanel(); openPanel('dockPanel'); }
  function renderDockPanel() {
    var list = $('#dockList'); list.textContent = '';
    $('#dockHint').textContent = t('editor.dockHint', { max: MAX_DOCK });
    var members = state.dock.map(function (id) { return state.apps.filter(function (a) { return a.id === id; })[0]; }).filter(Boolean);
    if (!members.length) {
      list.appendChild(el('p', 'empty__desc', t('editor.dockEmpty')));
    }
    members.forEach(function (app, idx) {
      var row = el('div', 'dock-list__item');
      var ic = iconNode(app, true);
      var m = el('div'); m.style.minWidth = '0';
      m.appendChild(el('div', 'search-item__name', displayName(app)));
      row.appendChild(ic); row.appendChild(m);
      var ctl = el('div', 'dock-list__ctl');
      var up = el('button', 'iconbtn'); up.setAttribute('aria-label', t('common.edit'));
      up.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
      up.disabled = idx === 0;
      up.addEventListener('click', function () { moveDock(idx, -1); });
      var down = el('button', 'iconbtn'); down.setAttribute('aria-label', t('common.edit'));
      down.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
      down.disabled = idx === members.length - 1;
      down.addEventListener('click', function () { moveDock(idx, 1); });
      var rm = el('button', 'iconbtn'); rm.classList.add('is-danger'); rm.setAttribute('aria-label', t('a11y.app.delete', { name: displayName(app) }));
      rm.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      rm.addEventListener('click', function () {
        state.dock = state.dock.filter(function (id) { return id !== app.id; });
        save(); renderDesk(); renderDockPanel();
      });
      ctl.appendChild(up); ctl.appendChild(down); ctl.appendChild(rm);
      row.appendChild(ctl);
      list.appendChild(row);
    });
  }
  function moveDock(idx, dir) {
    var to = idx + dir;
    if (to < 0 || to >= state.dock.length) return;
    var a = state.dock[idx], b = state.dock[to];
    state.dock[idx] = b; state.dock[to] = a;
    save(); renderDesk(); renderDockPanel();
  }

  /* ---------------- language picker ---------------- */
  function renderLanguage() { renderLanguageList(); openPanel('langPanel'); }
  function renderLanguageList() {
    var list = $('#langList'); list.textContent = '';
    var follow = el('button', 'lang-item' + (I.isFollowSystem() ? ' is-active' : ''));
    var fm = el('div');
    fm.appendChild(el('div', 'lang-item__local', t('settings.language.follow')));
    fm.appendChild(el('div', 'lang-item__en', 'Auto'));
    follow.appendChild(fm);
    if (I.isFollowSystem()) follow.appendChild(el('span', 'lang-item__check', '✓'));
    follow.addEventListener('click', function () { I.setLocale('__system__'); showToast(t('toast.lang', { name: t('settings.language.follow') })); });
    list.appendChild(follow);
    I.LOCALES.forEach(function (code) {
      var m = I.META[code];
      var item = el('button', 'lang-item' + (!I.isFollowSystem() && I.getLocale() === code ? ' is-active' : ''));
      var box = el('div');
      box.appendChild(el('div', 'lang-item__local', m.localName));
      box.appendChild(el('div', 'lang-item__en', m.englishName));
      item.appendChild(box);
      item.setAttribute('aria-label', t('a11y.languageOption', { local: m.localName, english: m.englishName }));
      if (!I.isFollowSystem() && I.getLocale() === code) item.appendChild(el('span', 'lang-item__check', '✓'));
      item.addEventListener('click', function () {
        I.setLocale(code);
        showToast(t('toast.lang', { name: m.localName }));
      });
      list.appendChild(item);
    });
  }

  function afterLocaleChange() {
    var vp = $('#viewport');
    var keepScroll = vp ? vp.scrollLeft : 0;
    applyStatic();
    renderDesk();
    if (vp) vp.scrollLeft = keepScroll;
    if (ui.openPanel === 'settingsPanel') renderSettings();
    if (ui.openPanel === 'langPanel') renderLanguageList();
    if (ui.openPanel === 'searchPanel') renderSearch();
    if (ui.openPanel === 'dockPanel') renderDockPanel();
    if ($('#sheet').classList.contains('is-open')) {
      $('#sheetTitle').textContent = ui.sheetMode === 'edit' ? t('sheet.edit.title') : t('sheet.add.title');
      syncIconExtra();
    }
    renderHelpIfOpen(); renderShortcutsIfOpen();
    if ($('#onboarding').classList.contains('is-open')) renderOnboarding();
    if (ui.editing) { var bar = $('#editBar'); if (bar) bar.textContent = t('editor.done'); }
  }

  /* ---------------- help / shortcuts ---------------- */
  function renderHelpList() {
    var list = $('#helpList'); list.textContent = '';
    for (var i = 1; i <= 6; i++) list.appendChild(el('li', '', t('help.' + i)));
  }
  function openHelp() { renderHelpList(); openPanel('helpPanel'); }
  function renderHelpIfOpen() { if (ui.openPanel === 'helpPanel') renderHelpList(); }
  function renderShortcutsBody() {
    var b = $('#shortcutsBody'); b.textContent = '';
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    var mod = isMac ? '⌘' : 'Ctrl';
    var rows = [
      [t('shortcuts.search'), mod + ' K'],
      [t('shortcuts.settings'), mod + ' ,'],
      [t('shortcuts.close'), 'Esc'],
      [t('shortcuts.open'), 'Enter'],
      [t('shortcuts.navigate'), '← ↑ → ↓'],
      [t('shortcuts.delete'), 'Delete / ⌫'],
      [t('shortcuts.edit'), 'E'],
      [t('settings.help.shortcuts'), '?']
    ];
    rows.forEach(function (r) {
      var row = el('div', 'kbd-row');
      row.appendChild(el('span', '', r[0]));
      row.appendChild(el('kbd', '', r[1]));
      b.appendChild(row);
    });
  }
  function openShortcuts() { renderShortcutsBody(); openPanel('shortcutsPanel'); }
  function renderShortcutsIfOpen() { if (ui.openPanel === 'shortcutsPanel') renderShortcutsBody(); }
  function sendFeedback() {
    var body = 'locale=' + encodeURIComponent(I.getLocale()) + '&apps=' + state.apps.length + '&ua=' + encodeURIComponent(navigator.userAgent);
    window.location.href = 'mailto:hello@webdesk.app?subject=WebDesk%20feedback&body=' + encodeURIComponent(body);
  }

  /* ---------------- export / import / clear ---------------- */
  function serialize() {
    return {
      version: VERSION,
      locale: I.getLocale(),
      apps: state.apps,
      dock: state.dock,
      folders: state.folders || [],
      settings: state.settings,
      meta: state.meta
    };
  }
  function doExport() {
    try {
      var blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = el('a'); a.href = url; a.download = I.exportName() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      showToast(t('toast.exported'));
    } catch (e) { showToast(t('error.generic')); }
  }
  function handleImport(file) {
    if (file.size > 2 * 1024 * 1024) { showToast(t('error.import.size')); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var d;
      try { d = JSON.parse(reader.result); } catch (e) { showToast(t('error.import.invalid')); return; }
      if (!d || !Array.isArray(d.apps)) { showToast(t('error.import.invalid')); return; }
      var incomingVersion = typeof d.version === 'number' ? d.version : 1;
      if (incomingVersion > VERSION) { showToast(t('error.import.version')); return; }
      var migrated = incomingVersion < VERSION;
      showConfirm({
        title: t('confirm.import.title'),
        desc: t('confirm.import.desc', { count: d.apps.length }),
        action: t('confirm.import.merge'),
        extraAction: t('confirm.import.overwrite'),
        onConfirm: function () { applyImport(d, false, migrated); },
        onExtra: function () { applyImport(d, true, migrated); }
      });
    };
    reader.readAsText(file);
  }
  function applyImport(d, overwrite, migrated) {
    var incoming = d.apps.map(function (a) {
      return {
        id: a.id || uid(), url: a.url, name: a.name || deriveName(a.url),
        icon: a.icon || { type: 'letter', value: (a.name || '?').slice(0, 1), hue: hueOf(a.url || '') },
        open: a.open === 'layer' ? 'layer' : 'tab',
        pos: a.pos || { page: 0, slot: 0 }, createdAt: a.createdAt || Date.now(), openCount: a.openCount || 0
      };
    }).filter(function (a) { return normalizeUrl(a.url).ok; });
    if (overwrite) state.apps = incoming;
    else {
      var ids = {};
      state.apps.forEach(function (a) { ids[a.id] = true; });
      incoming.forEach(function (a) { if (ids[a.id]) a.id = uid(); state.apps.push(a); });
    }
    if (d.settings) {
      state.settings.theme = d.settings.theme || state.settings.theme;
      state.settings.wallpaper = d.settings.wallpaper || state.settings.wallpaper;
      state.settings.anim = d.settings.anim !== undefined ? d.settings.anim : state.settings.anim;
      state.settings.onboardingDone = !!d.settings.onboardingDone;
    }
    if (Array.isArray(d.dock)) state.dock = d.dock.slice(0, MAX_DOCK);
    applyTheme(); applyWallpaper(); applyAnim();
    if (d.locale && I.matchLocale(d.locale)) { I.setLocale(d.locale); afterLocaleChange(); }
    save(); renderDesk();
    showToast(migrated ? t('error.import.migrated') : t('toast.imported', { count: incoming.length }));
  }
  function confirmClear() {
    showConfirm({
      title: t('confirm.clear.title'),
      desc: t('confirm.clear.desc', { keyword: t('confirm.clear.keyword') }),
      keyword: t('confirm.clear.keyword'),
      danger: true,
      action: t('confirm.clear.action'),
      onConfirm: function () {
        state = defaultState();
        state.apps = []; state.dock = [];
        state.settings.onboardingDone = true;
        save(); renderDesk(); closePanels();
        showToast(t('toast.cleared'));
      }
    });
  }

  /* ---------------- confirm dialog ---------------- */
  function showConfirm(cfg) {
    ui.confirmCfg = cfg;
    $('#confirmTitle').textContent = cfg.title || '';
    $('#confirmDesc').textContent = cfg.desc || '';
    var input = $('#confirmInput');
    input.hidden = !cfg.keyword; input.value = '';
    var actions = $('#confirmActions'); actions.textContent = '';
    var cancel = el('button', 'btn-primary btn-soft', t('common.cancel'));
    cancel.setAttribute('data-close', 'confirmPanel');
    actions.appendChild(cancel);
    if (cfg.extraAction) {
      var ex = el('button', 'btn-primary btn-soft', cfg.extraAction);
      ex.addEventListener('click', function () { if (cfg.onExtra) { closePanels(); cfg.onExtra(); } });
      actions.appendChild(ex);
    }
    var ok = el('button', 'btn-primary' + (cfg.danger ? ' btn-danger' : ''), cfg.action || t('common.confirm'));
    ok.addEventListener('click', function () {
      if (cfg.keyword && input.value.trim() !== cfg.keyword) { input.focus(); return; }
      closePanels();
      if (cfg.onConfirm) cfg.onConfirm();
    });
    actions.appendChild(ok);
    openPanel('confirmPanel');
  }

  /* ---------------- toast / banner ---------------- */
  function showToast(text, undoLabel, undoFn, ms) {
    clearTimeout(ui.toastTimer);
    $('#toastText').textContent = text;
    var u = $('#toastUndo');
    if (undoLabel && undoFn) {
      u.hidden = false; u.textContent = undoLabel;
      u.onclick = function () { undoFn(); hideToast(); };
    } else { u.hidden = true; u.onclick = null; }
    $('#toast').classList.add('is-open');
    ui.toastTimer = setTimeout(hideToast, ms || 3000);
  }
  function hideToast() { $('#toast').classList.remove('is-open'); clearTimeout(ui.toastTimer); }
  function showBanner(text, actionLabel, fn) {
    clearTimeout(ui.bannerTimer);
    $('#bannerText').textContent = text;
    var b = $('#bannerAction');
    if (actionLabel) { b.hidden = false; b.textContent = actionLabel; b.onclick = function () { fn(); hideBanner(); }; }
    else { b.hidden = true; b.onclick = null; }
    $('#banner').classList.add('is-open');
    if (!actionLabel) ui.bannerTimer = setTimeout(hideBanner, 3200);
  }
  function hideBanner() { $('#banner').classList.remove('is-open'); clearTimeout(ui.bannerTimer); }

  /* ---------------- context menu ---------------- */
  function openContextMenu(x, y, app) {
    var menu = $('#ctx'); menu.textContent = '';
    function add(label, fn, danger) {
      var b = el('button', danger ? 'is-danger' : '', label);
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', function () { closeContextMenu(); fn(); });
      menu.appendChild(b);
    }
    if (app) {
      add(t('common.open'), function () { openApp(app); });
      add(t('common.openNewTab'), function () { window.open(app.url, '_blank', 'noopener,noreferrer'); });
      add(t('common.edit'), function () { openSheet('edit', app); });
      add(state.dock.indexOf(app.id) >= 0 ? t('editor.removeFromDock') : t('editor.addToDock'), function () {
        if (state.dock.indexOf(app.id) >= 0) state.dock = state.dock.filter(function (i) { return i !== app.id; });
        else if (state.dock.length < MAX_DOCK) { state.dock.push(app.id); showToast(t('toast.addedToDock')); }
        save(); renderDesk();
      });
      menu.appendChild(el('div', 'ctx__sep'));
      add(t('common.delete'), function () { requestDelete(app, null); }, true);
    } else {
      add(t('topbar.add'), function () { openSheet('add'); });
      add(t('topbar.wallpaper'), function () { openPanel('settingsPanel'); renderSettings(); });
      add(t('common.autoArrange'), autoArrange);
      add(t('editor.sortByFrequency'), sortByFrequency);
    }
    menu.classList.add('is-open');
    var w = 200, h = menu.offsetHeight || 220;
    menu.style.left = Math.min(x, window.innerWidth - w - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - h - 8) + 'px';
  }
  function closeContextMenu() { $('#ctx').classList.remove('is-open'); }
  function autoArrange() {
    var prev = state.apps.slice();
    state.apps.sort(function (a, b) { return displayName(a).localeCompare(displayName(b), I.getLocale(), { numeric: true }); });
    state.apps.forEach(function (a, i) { a.pos = { page: 0, slot: i }; });
    save(); renderDesk();
    showToast(t('toast.saved'), t('toast.undo.arrange'), function () { state.apps = prev; save(); renderDesk(); }, 10000);
  }

  /* FR-21: sort by local open frequency; explicit user confirm, never auto-applied. */
  function sortByFrequency() {
    var prev = state.apps.slice();
    state.apps.sort(function (a, b) { return (b.openCount || 0) - (a.openCount || 0); });
    state.apps.forEach(function (a, i) { a.pos = { page: 0, slot: i }; });
    save(); renderDesk();
    showToast(t('toast.saved'), t('toast.undo.arrange'), function () { state.apps = prev; save(); renderDesk(); }, 10000);
  }

  /* ---------------- onboarding ---------------- */
  var OB_ARTS = [
    '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/></svg>',
    '<svg viewBox="0 0 24 24"><path d="M8 3v4a4 4 0 008 0V3"/><path d="M12 11v10M9 14h6"/></svg>',
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 3 2.6 15 0 18M12 3c-2.6 3-2.6 15 0 18"/></svg>'
  ];
  function startOnboarding(force) {
    ui.obStep = 0;
    $('#onboarding').classList.add('is-open');
    $('#scrim').classList.add('is-open');
    renderOnboarding(force);
  }
  function renderOnboarding() {
    var s = ui.obStep + 1;
    $('#obArt').innerHTML = OB_ARTS[ui.obStep];
    $('#obProgress').textContent = t('onboarding.progress', { current: s, total: 3 });
    $('#obTitle').textContent = t('onboarding.' + s + '.title');
    $('#obDesc').textContent = t('onboarding.' + s + '.desc');
    var dots = $('#obDots'); dots.textContent = '';
    for (var i = 0; i < 3; i++) dots.appendChild(el('span', i === ui.obStep ? 'is-active' : ''));
    $('#obNext').textContent = ui.obStep === 2 ? t('onboarding.done') : (ui.obStep === 0 ? t('onboarding.start') : t('onboarding.next'));
    $('#obSkip').textContent = t('onboarding.skip');
  }
  function nextOnboarding() {
    if (ui.obStep < 2) { ui.obStep++; renderOnboarding(); }
    else finishOnboarding();
  }
  function finishOnboarding() {
    $('#onboarding').classList.remove('is-open');
    $('#scrim').classList.remove('is-open');
    state.settings.onboardingDone = true; save();
    if (state.apps.length === 0) openSheet('add');
  }

  /* ---------------- theme / wallpaper / anim ---------------- */
  function applyTheme() {
    var mode = state.settings.theme;
    if (mode === 'auto') {
      var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    } else document.documentElement.setAttribute('data-theme', mode);
  }
  function setWallpaper(key) {
    state.settings.wallpaper = key; save(); applyWallpaper();
    showToast(t('toast.wallpaper'));
  }
  function applyWallpaper() {
    var w = $('#wallpaper'), key = state.settings.wallpaper;
    if (key === 'custom' && state.settings.customWallpaper) {
      w.classList.add('is-custom'); w.classList.remove('is-solid');
      w.style.backgroundImage = 'url("' + state.settings.customWallpaper + '")';
      w.removeAttribute('data-wp');
    } else {
      w.classList.remove('is-custom');
      w.style.backgroundImage = '';
      w.classList.toggle('is-solid', key === 'solid');
      w.setAttribute('data-wp', key);
    }
  }
  function applyAnim() {
    document.documentElement.classList.toggle('no-anim', state.settings.anim === false);
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (state.settings.theme === 'auto') applyTheme(); });

  /* ---------------- static i18n application ---------------- */
  function applyStatic(root) {
    root = root || document;
    $$('[data-i18n]', root).forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    var attrs = [['data-i18n-placeholder', 'placeholder'], ['data-i18n-aria', 'aria-label'], ['data-i18n-title', 'title'], ['data-i18n-alt', 'alt']];
    attrs.forEach(function (pair) {
      $$('[' + pair[0] + ']', root).forEach(function (n) { n.setAttribute(pair[1], t(n.getAttribute(pair[0]))); });
    });
    $$('[data-i18n-aria]', root).forEach(function (n) { n.setAttribute('title', t(n.getAttribute('data-i18n-aria'))); });
  }

  /* ---------------- search ---------------- */
  var PINYIN_INITIALS = {
    '\u8c03':'t','\u97f3':'y','\u5668':'q','\u8282':'j','\u62cd':'p','\u594f':'z','\u66f2':'q','\u5e93':'k','\u7b14':'b','\u8bb0':'j','\u65e5':'r','\u5386':'l','\u8bbe':'s','\u7f6e':'z','\u641c':'s','\u7d22':'s','\u5730':'d','\u56fe':'t','\u7801':'m','\u6587':'w','\u6863':'d','\u8ba1':'s','\u7ffb':'f','\u8bd1':'y','\u7f51':'w','\u9875':'y','\u5e94':'y','\u7528':'y','\u6dfb':'t','\u52a0':'j','\u5220':'s','\u9664':'c','\u5bfc':'d','\u51fa':'c','\u5165':'r','\u4e3b':'z','\u9898':'t','\u58c1':'b','\u7eb8':'z','\u8bed':'y','\u8a00':'y','\u5e2e':'b','\u52a9':'z','\u7a7a':'k','\u72b6':'z','\u6001':'t'
  };
  function pinyinInitials(s) {
    return String(s).split('').map(function (c) { return PINYIN_INITIALS[c] || c.toLowerCase(); }).join('');
  }
  function renderSearch() {
    var kw = $('#searchInput').value.trim().toLowerCase();
    ui.searchKeyword = kw;
    var box = $('#searchResults'); box.textContent = '';
    var hits = state.apps.filter(function (a) {
      if (!kw) return true;
      return displayName(a).toLowerCase().indexOf(kw) >= 0 || a.url.toLowerCase().indexOf(kw) >= 0 ||
        pinyinInitials(displayName(a)).indexOf(kw) >= 0;
    });
    if (kw) box.appendChild(el('div', 'panel__subtitle', t('search.count', { count: hits.length })));
    hits.forEach(function (app) {
      var row = el('button', 'search-item');
      var c = iconNode(app, false);
      c.className = 'search-item__icon';
      row.appendChild(c);
      var m = el('div'); m.style.minWidth = '0';
      m.appendChild(el('div', 'search-item__name', displayName(app)));
      m.appendChild(el('div', 'search-item__url', app.url));
      row.appendChild(m);
      row.addEventListener('click', function () { closePanels(); openApp(app); });
      box.appendChild(row);
    });
    if (!hits.length && kw) {
      box.appendChild(el('p', 'empty__desc', t('search.empty', { keyword: $('#searchInput').value.trim() })));
      var add = el('button', 'btn-primary btn-soft', t('search.empty.add'));
      add.addEventListener('click', function () {
        var v = $('#searchInput').value.trim();
        closePanels(); openSheet('add');
        if (/^https?:\/\//i.test(v)) $('#fUrl').value = v;
      });
      box.appendChild(add);
    }
  }

  /* ---------------- keyboard ---------------- */
  function onKey(e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPanel('searchPanel'); renderSearch(); return; }
    if (mod && e.key === ',') { e.preventDefault(); renderSettings(); openPanel('settingsPanel'); return; }
    if (e.key === 'Escape') {
      if ($('#layer').classList.contains('is-open')) { closeLayer(); return; }
      if ($('#onboarding').classList.contains('is-open')) { finishOnboarding(); return; }
      if ($('#ctx').classList.contains('is-open')) { closeContextMenu(); return; }
      if (ui.editing) { setEditing(false); return; }
      if ($('#sheet').classList.contains('is-open')) { closeSheet(); return; }
      if (ui.openPanel) { closePanels(); return; }
      return;
    }
    if (e.key === '?' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openShortcuts(); return; }
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      if (e.key === 'Enter' && ui.openPanel === 'searchPanel') {
        var first = $('#searchResults .search-item');
        if (first) { e.preventDefault(); first.click(); }
      }
      return;
    }
    if (e.key.toLowerCase() === 'e') { setEditing(!ui.editing); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && ui.editing) {
      var apps = $$('.app');
      var focused = document.activeElement;
      if (focused && focused.classList.contains('app')) {
        var id = focused.getAttribute('data-id');
        var app = state.apps.filter(function (a) { return a.id === id; })[0];
        if (app) { e.preventDefault(); requestDelete(app, focused); }
      }
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0) {
      var nodes = $$('.app');
      if (!nodes.length) return;
      var idx = nodes.indexOf(document.activeElement);
      var step = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
      if (document.documentElement.getAttribute('dir') === 'rtl' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) step = -step;
      var next = idx < 0 ? 0 : (idx + step + nodes.length) % nodes.length;
      e.preventDefault(); nodes[next].focus();
    }
  }

  /* ---------------- events ---------------- */
  function bind() {
    $('#btnAdd').addEventListener('click', function () { openSheet('add'); });
    $('#btnSettings').addEventListener('click', function () { renderSettings(); openPanel('settingsPanel'); });
    $('#btnLang').addEventListener('click', renderLanguage);
    $('#btnTheme').addEventListener('click', function () {
      var order = ['auto', 'light', 'dark'];
      state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % 3];
      save(); applyTheme(); renderChrome();
      if (ui.openPanel === 'settingsPanel') renderSettings();
    });
    $('#btnSearch').addEventListener('click', function () { openPanel('searchPanel'); renderSearch(); });

    $('#sheetClose').addEventListener('click', closeSheet);
    $('#sheetCancel').addEventListener('click', closeSheet);
    $('#appForm').addEventListener('submit', submitSheet);
    $('#fUrl').addEventListener('blur', function () {
      var nu = normalizeUrl(this.value);
      if (nu.ok && !$('#fName').value.trim()) {
        $('#fName').value = deriveName(nu.url);
        $('#fNameErr').textContent = '';
      }
    });
    $$('#iconMode button').forEach(function (b) {
      b.addEventListener('click', function () { ui.iconMode = b.getAttribute('data-mode'); syncSegmented('#iconMode', ui.iconMode); syncIconExtra(); });
    });
    $$('#openMode button').forEach(function (b) {
      b.addEventListener('click', function () { ui.openMode = b.getAttribute('data-mode'); syncSegmented('#openMode', ui.openMode); });
    });
    $('#fEmoji').addEventListener('input', function () { ui.emoji = this.value.trim(); syncIconExtra(); });
    $('#fIconFile').addEventListener('change', function () { readImage(this, function (data) { ui.uploadedIcon = data; syncIconExtra(); }); });

    var wf = el('input'); wf.type = 'file'; wf.id = 'wallpaperFile'; wf.accept = 'image/*'; wf.hidden = true;
    document.body.appendChild(wf);
    wf.addEventListener('change', function () {
      readImage(this, function (data) {
        state.settings.wallpaper = 'custom'; state.settings.customWallpaper = data;
        save(); applyWallpaper(); showToast(t('toast.wallpaper'));
      });
    });

    document.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-close]') : null;
      if (b) closePanels();
    });
    $('#scrim').addEventListener('click', function () { closePanels(); closeSheet(); closeContextMenu(); });
    $('#importFile').addEventListener('change', function () { if (this.files[0]) handleImport(this.files[0]); this.value = ''; });
    $('#searchInput').addEventListener('input', renderSearch);

    $('#layerBack').addEventListener('click', closeLayer);
    $('#layerClose').addEventListener('click', closeLayer);
    $('#layerNewTab').addEventListener('click', function () { if (ui.layerUrl) window.open(ui.layerUrl, '_blank', 'noopener,noreferrer'); });

    $('#obNext').addEventListener('click', nextOnboarding);
    $('#obSkip').addEventListener('click', finishOnboarding);

    $('#desk').addEventListener('contextmenu', function (e) {
      if (e.target.closest('.app')) return;
      e.preventDefault(); openContextMenu(e.clientX, e.clientY, null);
    });
    document.addEventListener('pointerdown', function (e) {
      if (!$('#ctx').contains(e.target)) closeContextMenu();
    }, true);

    $('#viewport').addEventListener('scroll', function () {
      if (ui.form !== 'phone') return;
      var idx = Math.round(this.scrollLeft / Math.max(this.clientWidth, 1));
      if (idx !== ui.currentPage) { ui.currentPage = idx; renderPager(Math.ceil(state.apps.length / ui.capacity)); }
    }, { passive: true });

    window.addEventListener('resize', function () { renderDesk(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('offline', function () { showBanner(t('banner.offline')); });
    window.addEventListener('online', function () { showBanner(t('banner.online')); });

    var brand = $('.brand__name'), bt = null;
    brand.addEventListener('pointerdown', function () { bt = setTimeout(renderLanguage, 800); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { brand.addEventListener(ev, function () { clearTimeout(bt); }); });

    I.onChange(function () { afterLocaleChange(); });
  }

  function readImage(input, cb) {
    var f = input.files && input.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 2560, w = img.width, h = img.height;
        if (w > max || h > max) { var s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        try { cb(c.toDataURL('image/jpeg', .82)); } catch (e) { cb(r.result); }
      };
      img.onerror = function () { cb(r.result); };
      img.src = r.result;
    };
    r.readAsDataURL(f);
  }

  /* ---------------- boot ---------------- */
  function boot() {
    applyTheme(); applyWallpaper(); applyAnim();
    applyStatic();
    bind();
    renderDesk();
    if (!state.settings.onboardingDone) setTimeout(function () { startOnboarding(); }, 350);
    else save();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
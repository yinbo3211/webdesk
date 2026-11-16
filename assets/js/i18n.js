/* WebDesk i18n runtime — every visible string comes from the locale bundle. */
(function () {
  'use strict';
  var META = window.WD_LOCALES;
  var BUNDLES = window.WD_BUNDLES;
  var DEFAULT = 'zh-Hans';
  var FALLBACKS = ['en-US', 'zh-Hans'];
  var STORAGE_KEY = 'webdesk.settings.locale';
  var listeners = [];
  var current = DEFAULT;
  var channel = null;

  try { channel = new BroadcastChannel('webdesk-locale'); } catch (e) { /* older browsers */ }

  function isLocale(v) { return !!(v && Object.prototype.hasOwnProperty.call(META, v)); }

  /* BCP 47 progressive fallback: zh-Hant-HK -> zh-Hant -> zh-Hans */
  function matchLocale(tag) {
    if (!tag) return null;
    if (isLocale(tag)) return tag;
    var parts = String(tag).split('-');
    while (parts.length > 1) {
      parts.pop();
      var candidate = parts.join('-');
      if (isLocale(candidate)) return candidate;
    }
    var base = String(tag).split('-')[0];
    for (var i = 0; i < Object.keys(META).length; i++) {
      var l = Object.keys(META)[i];
      if (l.split('-')[0] === base) return l;
    }
    return null;
  }

  /* Priority: URL ?lang > local memory > navigator.languages > default */
  function detectLocale() {
    try {
      var url = new URL(window.location.href).searchParams.get('lang');
      if (url) { var byUrl = matchLocale(url); if (byUrl) return { locale: byUrl, source: 'url' }; }
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === '__system__') return { locale: bySystem(), source: 'system' };
      if (saved) { var bySaved = matchLocale(saved); if (bySaved) return { locale: bySaved, source: 'memory' }; }
      var byBrowser = bySystem();
      if (byBrowser !== DEFAULT) return { locale: byBrowser, source: 'browser' };
      return { locale: DEFAULT, source: 'default' };
    } catch (e) { return { locale: DEFAULT, source: 'default' }; }
  }

  function bySystem() {
    var tags = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < tags.length; i++) { var m = matchLocale(tags[i]); if (m) return m; }
    return DEFAULT;
  }

  function bundle(locale) { return BUNDLES[locale] || BUNDLES[DEFAULT]; }

  /* Missing-key fallback chain: target -> en-US -> zh-Hans -> key name (dev only) */
  function lookup(key, locale) {
    var order = [locale].concat(FALLBACKS.filter(function (f) { return f !== locale; }));
    for (var i = 0; i < order.length; i++) {
      var b = BUNDLES[order[i]];
      if (b && Object.prototype.hasOwnProperty.call(b, key)) return b[key];
    }
    return key;
  }

  function pluralForm(value, locale) {
    var raw = lookup(value, locale);
    if (typeof raw === 'string') return raw;
    if (!raw || typeof raw !== 'object') return String(value || '');
    var n = Number(value && value.count !== undefined ? value.count : (window.WD_LAST_PLURAL_COUNT || 0));
    var cat;
    try { cat = new Intl.PluralRules(locale).select(n); } catch (e) { cat = n === 1 ? 'one' : 'other'; }
    return raw[cat] || raw.other || raw.one || '';
  }

  /* t('toast.added', {name:'Tuner'}) ; t('format.appCount', {count: 3}) */
  function t(key, vars) {
    var raw = lookup(key, current);
    if (raw && typeof raw === 'object') {
      window.WD_LAST_PLURAL_COUNT = vars && vars.count !== undefined ? vars.count : 0;
      raw = pluralForm(key, current);
    }
    var str = String(raw);
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        var v = vars[k];
        /* Numbers are locale-formatted too (PRD 8.4 carrier #9): ar-SA renders ٦,
           de-DE renders 1.234. Strings (names, URLs, keywords) pass through untouched. */
        var out = (typeof v === 'number') ? fmtNumber(v) : String(v);
        str = str.split('{' + k + '}').join(out);
      });
    }
    return str;
  }

  /* Intl-based localised formatting — never hand-rolled */
  function fmtDate(d, opts) {
    try { return new Intl.DateTimeFormat(current, opts || { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(d)); }
    catch (e) { return new Date(d).toLocaleDateString(); }
  }
  function fmtTime(d) {
    try { return new Intl.DateTimeFormat(current, { hour: 'numeric', minute: '2-digit' }).format(new Date(d)); }
    catch (e) { return new Date(d).toLocaleTimeString(); }
  }
  function fmtNumber(n, opts) {
    try { return new Intl.NumberFormat(current, opts || {}).format(n); }
    catch (e) { return String(n); }
  }
  function fmtRelative(d) {
    var diff = Math.round((Date.now() - new Date(d).getTime()) / 60000);
    if (diff < 1) return t('format.justNow');
    if (diff < 60) return t('format.minutesAgo', { count: diff });
    var h = Math.round(diff / 60);
    if (h < 24) return t('format.hoursAgo', { count: h });
    return t('format.daysAgo', { count: Math.round(h / 24) });
  }
  function fmtFileSize(bytes) {
    var kb = bytes / 1024;
    return t('format.shortDate', { date: fmtNumber(Math.round(kb * 10) / 10, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }) + ' KB';
  }

  var FONT_STACKS = {
    latin: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    hans: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    hant: '-apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif',
    ja: '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif',
    ko: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
    ar: '-apple-system, BlinkMacSystemFont, "SF Arabic", "Geeza Pro", "Segoe UI", Tahoma, sans-serif'
  };
  function fontStack(locale) {
    if (locale.indexOf('ar') === 0) return FONT_STACKS.ar;
    if (locale.indexOf('ko') === 0) return FONT_STACKS.ko;
    if (locale.indexOf('ja') === 0) return FONT_STACKS.ja;
    if (locale === 'zh-Hant') return FONT_STACKS.hant;
    if (locale.indexOf('zh') === 0) return FONT_STACKS.hans;
    return FONT_STACKS.latin;
  }

  /* Apply lang / dir / font to <html>, notify app to re-render dynamic parts */
  function applyDocument() {
    var root = document.documentElement;
    var m = META[current];
    root.setAttribute('lang', current);
    root.setAttribute('dir', m.dir);
    root.style.setProperty('--wd-font', fontStack(current));
    document.title = t('meta.title');
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('meta.description'));
  }

  function setLocale(locale, opts) {
    opts = opts || {};
    var system = (locale === '__system__');
    var next;
    if (system) next = bySystem();
    else {
      var matched = matchLocale(locale);
      if (!matched) return false;
      next = matched;
    }
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    current = next;
    try { localStorage.setItem(STORAGE_KEY, system ? '__system__' : next); } catch (e) { /* private mode */ }
    applyDocument();
    listeners.forEach(function (fn) { try { fn(current); } catch (e) { console.error(e); } });
    document.dispatchEvent(new CustomEvent('webdesk:localechange', { detail: { locale: current } }));
    var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
    window.WD_LAST_SWITCH_MS = Math.round((t1 - t0) * 10) / 10;
    if (!opts.silent && channel) { try { channel.postMessage({ type: 'locale', locale: system ? '__system__' : current }); } catch (e) {} }
    return true;
  }

  if (channel) {
    channel.onmessage = function (ev) {
      if (ev.data && ev.data.type === 'locale') {
        var incoming = ev.data.locale;
        var resolved = incoming === '__system__' ? bySystem() : incoming;
        if (resolved !== current) setLocale(incoming, { silent: true });
      }
    };
  }
  window.addEventListener('storage', function (ev) {
    if (ev.key === STORAGE_KEY && ev.newValue) {
      var resolved = ev.newValue === '__system__' ? bySystem() : ev.newValue;
      if (resolved !== current) setLocale(ev.newValue, { silent: true });
    }
  });
  /* Follow system: re-check on tab visibility restore (PRD 8.3) */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && isFollowSystem()) {
      var s = bySystem(); if (s !== current) setLocale(s, { silent: true });
    }
  });

  function isFollowSystem() {
    try { return localStorage.getItem(STORAGE_KEY) === '__system__'; } catch (e) { return false; }
  }

  function onChange(fn) { listeners.push(fn); }

  /* Boot */
  var detected = detectLocale();
  current = detected.locale;
  applyDocument();

  window.WD = window.WD || {};
  window.WD.i18n = {
    META: META,
    LOCALES: Object.keys(META),
    DEFAULT: DEFAULT,
    t: t,
    setLocale: setLocale,
    getLocale: function () { return current; },
    getSource: function () { return detected.source; },
    isFollowSystem: isFollowSystem,
    matchLocale: matchLocale,
    onChange: onChange,
    fmtDate: fmtDate,
    fmtTime: fmtTime,
    fmtNumber: fmtNumber,
    fmtRelative: fmtRelative,
    fmtFileSize: fmtFileSize,
    fontStack: fontStack,
    exportName: function () {
      var d = new Date();
      var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return t('meta.exportName', { date: iso }).replace(/[\\/:*?"<>|]/g, '-');
    }
  };
})();

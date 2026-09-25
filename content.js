// WikiMasters Auto-Pulls — content script exécuté sur https://www.wiki-masters.com/pulls
// Pilote l'interface comme un utilisateur : clic sur le paquet, flèches « suivant », « Continuer ».
// N'appelle jamais l'API du site directement.

(() => {
  if (window.__wmAutoPulls) return; // évite une double injection
  window.__wmAutoPulls = true;

  const LOG_PREFIX = '[WM-Auto]';
  const TICK_MS = 5000;          // tick de secours (Chrome throttle les timers en arrière-plan)
  const REVEAL_STEP_MS = 700;    // délai entre deux clics dans la révélation
  const REVEAL_TIMEOUT_MS = 60000;
  const OPEN_DELAY_MS = () => 1000 + Math.random() * 2000;
  const BACKOFF_MIN_MS = 30000;
  const BACKOFF_MAX_MS = 5 * 60000;
  const FORBIDDEN = ['recharg', 'abonner', 'cad', 'stripe'];

  const state = {
    enabled: true,
    phase: 'IDLE',          // IDLE | OPENING | REVEAL | PAUSED_HUMAN | BACKOFF | OFF
    busy: false,
    sessionOpened: 0,
    backoffMs: BACKOFF_MIN_MS,
    backoffUntil: 0,
    lastError: null,
  };

  // ---------- Helpers DOM ----------
  const main = () => document.querySelector('main');
  const text = (el) => (el ? el.innerText || '' : '');
  const isForbidden = (btn) => {
    const t = text(btn).toLowerCase();
    return FORBIDDEN.some((w) => t.includes(w));
  };
  const buttons = () => [...(main()?.querySelectorAll('button') || [])].filter((b) => !isForbidden(b));

  const findOpenButton = () => buttons().find((b) => text(b).trim() === 'Ouvrir');
  const findNextArrow = () => {
    const arrows = buttons().filter((b) => b.className.includes('w-12 h-12 rounded-full'));
    return arrows.length ? arrows[arrows.length - 1] : null;
  };
  const findCta = () => buttons().find((b) => b.className.includes('px-8 py-3'));
  const inReveal = () => /Carte\s*\d+\s*\/\s*\d+/.test(text(main()));

  const readCounter = () => {
    const t = text(main());
    const m = t.match(/(\d+)\s*\/\s*(\d+)\s*paquets/i) || t.match(/(\d+)\s*\/\s*(\d+)/);
    const n = t.match(/Prochain dans\s*(\d+):(\d+)/i);
    return {
      available: m ? parseInt(m[1], 10) : null,
      max: m ? parseInt(m[2], 10) : null,
      nextIn: n ? `${n[1]}:${n[2]}` : null,
    };
  };

  const humanCheckPresent = () => {
    if (document.querySelector('iframe[src*="captcha"], iframe[src*="turnstile"], iframe[src*="hcaptcha"], iframe[src*="recaptcha"]')) return true;
    const t = text(main()).toLowerCase();
    return /v[ée]rifi(cation|ez).*(humain|robot)|prouvez que vous|are you human|not a robot/.test(t);
  };

  const errorPresent = () => {
    const t = text(main()).toLowerCase();
    return /une erreur|erreur est survenue|r[ée]essayer plus tard|trop de requ/.test(t);
  };

  // ---------- Persistance / messages ----------
  const storage = globalThis.chrome?.storage?.local;
  const log = (msg, level = 'info') => {
    const line = `${new Date().toLocaleTimeString()} ${msg}`;
    console[level === 'error' ? 'error' : 'log'](LOG_PREFIX, msg);
    storage?.get({ logs: [] }, ({ logs }) => {
      logs.unshift(line);
      storage.set({ logs: logs.slice(0, 20) });
    });
  };
  const send = (payload) => {
    try { chrome.runtime.sendMessage(payload, () => void chrome.runtime.lastError); } catch (_) {}
  };
  const publish = () => {
    const c = readCounter();
    storage?.set({
      status: {
        phase: state.enabled ? state.phase : 'OFF',
        available: c.available,
        max: c.max,
        nextIn: c.nextIn,
        sessionOpened: state.sessionOpened,
        lastError: state.lastError,
        updatedAt: Date.now(),
      },
    });
    renderOverlay(c);
  };

  // ---------- Overlay ----------
  let overlay, overlayText, overlayBtn, titleTimer;
  const PHASE_LABEL = {
    IDLE: 'Actif',
    OPENING: 'Ouverture…',
    REVEAL: 'Révélation…',
    PAUSED_HUMAN: 'Vérification requise !',
    BACKOFF: 'Erreur, nouvel essai bientôt',
    OFF: 'Pause',
  };
  const renderOverlay = (c) => {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'wm-auto-overlay';
      Object.assign(overlay.style, {
        position: 'fixed', bottom: '12px', right: '12px', zIndex: 99999,
        background: 'rgba(15,23,20,0.92)', color: '#d1fae5', border: '1px solid #10b981',
        borderRadius: '10px', padding: '8px 12px', font: '12px system-ui, sans-serif',
        display: 'flex', gap: '10px', alignItems: 'center', boxShadow: '0 4px 16px rgba(0,0,0,.4)',
      });
      overlayText = document.createElement('span');
      overlayBtn = document.createElement('button');
      Object.assign(overlayBtn.style, {
        background: '#10b981', color: '#052e22', border: 'none', borderRadius: '6px',
        padding: '4px 8px', cursor: 'pointer', font: 'inherit', fontWeight: 600,
      });
      overlayBtn.addEventListener('click', () => storage?.set({ enabled: !state.enabled }));
      overlay.append(overlayText, overlayBtn);
      document.body.appendChild(overlay);
    }
    const phase = state.enabled ? state.phase : 'OFF';
    let label = `Auto-Pulls : ${PHASE_LABEL[phase] || phase}`;
    if (phase === 'IDLE' && c.available === 0 && c.nextIn) label += ` – prochain dans ${c.nextIn}`;
    if (phase === 'IDLE' && c.available > 0) label += ` – ${c.available} paquet(s) dispo`;
    label += ` · ${state.sessionOpened} ouvert(s)`;
    // n'écrire que si ça change : chaque écriture DOM réveille le MutationObserver
    if (overlayText.textContent !== label) overlayText.textContent = label;
    const btnLabel = state.enabled ? 'OFF' : 'ON';
    if (overlayBtn.textContent !== btnLabel) overlayBtn.textContent = btnLabel;
    const color = phase === 'PAUSED_HUMAN' ? '#f59e0b' : phase === 'OFF' ? '#6b7280' : '#10b981';
    if (overlay.style.borderColor !== color) overlay.style.borderColor = color;
  };
  const flashTitle = (on) => {
    clearInterval(titleTimer);
    if (!on) { document.title = document.title.replace(/^⚠️ /, ''); return; }
    const base = document.title.replace(/^⚠️ /, '');
    let flip = false;
    titleTimer = setInterval(() => { flip = !flip; document.title = (flip ? '⚠️ ' : '') + base; }, 1000);
  };

  // ---------- Machine à états ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function runReveal() {
    state.phase = 'REVEAL';
    publish();
    const deadline = Date.now() + REVEAL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!inReveal()) return true; // déjà revenu à l'écran initial
      const next = findNextArrow();
      const cta = findCta();
      if (cta && !cta.disabled && text(cta).trim() === 'Continuer') {
        cta.click();
        await sleep(REVEAL_STEP_MS);
        // attendre le retour de l'écran initial
        const back = Date.now() + 10000;
        while (Date.now() < back) {
          if (!inReveal()) return true;
          await sleep(300);
        }
        return !inReveal();
      }
      if (next && !next.disabled) next.click();
      await sleep(REVEAL_STEP_MS);
    }
    return false;
  }

  async function tryOpen() {
    if (state.busy || !state.enabled) return;
    if (Date.now() < state.backoffUntil) return;

    if (humanCheckPresent()) {
      if (state.phase !== 'PAUSED_HUMAN') {
        state.phase = 'PAUSED_HUMAN';
        log('Vérification humaine détectée : en pause, action manuelle requise', 'error');
        send({ type: 'human-check' });
        flashTitle(true);
      }
      publish();
      return;
    }
    if (state.phase === 'PAUSED_HUMAN') { flashTitle(false); state.phase = 'IDLE'; }

    // Révélation déjà en cours (ex : ouverture manuelle ou rechargement en plein milieu)
    if (inReveal()) {
      state.busy = true;
      try { await runReveal(); } finally { state.busy = false; state.phase = 'IDLE'; publish(); }
      return;
    }

    const btn = findOpenButton();
    if (!btn || btn.disabled) { state.phase = 'IDLE'; publish(); return; }

    state.busy = true;
    state.phase = 'OPENING';
    publish();
    try {
      await sleep(OPEN_DELAY_MS());
      const b = findOpenButton();
      if (!b || b.disabled || !state.enabled) return;
      b.click();
      // attendre l'apparition de la révélation
      const t0 = Date.now();
      while (!inReveal() && Date.now() - t0 < 15000) {
        if (errorPresent()) throw new Error('Erreur affichée par le site après le clic');
        await sleep(300);
      }
      if (!inReveal()) throw new Error("La révélation n'est pas apparue après le clic");
      const ok = await runReveal();
      if (!ok) throw new Error('Révélation non terminée avant le timeout');
      state.sessionOpened += 1;
      state.backoffMs = BACKOFF_MIN_MS;
      state.lastError = null;
      storage?.get({ totalOpened: 0 }, ({ totalOpened }) =>
        storage.set({ totalOpened: totalOpened + 1, lastOpenAt: Date.now() }));
      log(`Paquet ouvert (${state.sessionOpened} cette session)`);
      send({ type: 'opened', sessionOpened: state.sessionOpened });
      state.phase = 'IDLE';
    } catch (e) {
      state.lastError = e.message;
      state.phase = 'BACKOFF';
      state.backoffUntil = Date.now() + state.backoffMs;
      log(`${e.message} — nouvel essai dans ${Math.round(state.backoffMs / 1000)} s`, 'error');
      send({ type: 'error', message: e.message });
      state.backoffMs = Math.min(state.backoffMs * 2, BACKOFF_MAX_MS);
    } finally {
      state.busy = false;
      publish();
      // s'il reste des paquets, on enchaîne tout de suite
      setTimeout(tryOpen, 500);
    }
  }

  // ---------- Déclencheurs ----------
  const observer = new MutationObserver((records) => {
    if (state.busy) return;
    // ignorer les mutations provoquées par notre propre overlay
    if (records.every((r) => overlay && overlay.contains(r.target))) return;
    tryOpen();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  setInterval(() => { publish(); tryOpen(); }, TICK_MS);

  const init = (enabled) => {
    state.enabled = enabled;
    log(`Content script chargé (enabled=${enabled})`);
    publish();
    tryOpen();
  };
  if (storage) storage.get({ enabled: true }, ({ enabled }) => init(enabled));
  else init(true); // injection manuelle hors extension (test)
  chrome.storage?.onChanged?.addListener((changes) => {
    if (changes.enabled) {
      state.enabled = !!changes.enabled.newValue;
      state.phase = 'IDLE';
      state.backoffUntil = 0;
      log(state.enabled ? 'Activé' : 'Désactivé');
      publish();
      tryOpen();
    }
  });
})();

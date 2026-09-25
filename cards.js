// WikiMasters Auto-Pulls — capture des cartes révélées + récap au retour sur l'onglet.
// Chargé avant content.js (même monde isolé) ; expose window.WMCards.

(() => {
  if (window.WMCards) return;

  const storage = globalThis.chrome?.storage?.local;
  const MAX_CARDS = 1000;
  const RARITY_RE = /^(C|PC|R|SR|UR|L)$/;
  const RARITY_LABEL = { C: 'Commune', PC: 'Peu commune', R: 'Rare', SR: 'Super rare', UR: 'Ultra rare', L: 'Légendaire' };
  const RARITY_COLOR = { C: '#34d399', PC: '#60a5fa', R: '#a78bfa', SR: '#f472b6', UR: '#fbbf24', L: '#f97316' };

  const main = () => document.querySelector('main');
  const cleanUrl = (u) => (u || '').split('?')[0];
  const toNum = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10);

  // ---- Capture d'une carte affichée dans la vue de révélation ----
  const currentIndex = () => {
    const m = (main()?.innerText || '').match(/Carte\s*(\d+)\s*\/\s*(\d+)/);
    return m ? { idx: parseInt(m[1], 10), total: parseInt(m[2], 10) } : null;
  };

  const findCardContainer = () => {
    const root = main();
    if (!root) return null;
    const img = [...root.querySelectorAll('img')].find((i) => i.alt && !i.closest('#wm-auto-overlay'));
    let el = img;
    for (let i = 0; i < 8 && el; i++) {
      el = el.parentElement;
      if (!el || el === root) break;
      const lines = (el.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
      const hasRarity = lines.some((l) => RARITY_RE.test(l));
      const nums = lines.filter((l) => /^[\d\s  ]+$/.test(l));
      if (hasRarity && nums.length >= 2) return { el, img, lines };
    }
    return null;
  };

  const capture = () => {
    const pos = currentIndex();
    const c = findCardContainer();
    if (!pos || !c) return null;
    const { img, lines } = c;
    const rarity = lines.find((l) => RARITY_RE.test(l)) || '?';
    const nums = lines.filter((l) => /^[\d\s  ]+$/.test(l)).map(toNum);
    const name = img.alt.trim();
    const nameIdx = lines.indexOf(name);
    const desc = nameIdx >= 0 && lines[nameIdx + 1] && !RARITY_RE.test(lines[nameIdx + 1]) && !/^[\d\s  ]+$/.test(lines[nameIdx + 1])
      ? lines[nameIdx + 1] : '';
    const url = `https://fr.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, '_'))}`;
    return { idx: pos.idx, total: pos.total, rarity, name, desc, url, img: cleanUrl(img.currentSrc || img.src), stats: nums.slice(0, 2) };
  };

  // ---- Stockage ----
  let pending = new Map(); // idx -> card (paquet en cours)
  const record = () => {
    const card = capture();
    if (card && !pending.has(card.idx)) pending.set(card.idx, card);
    return card;
  };

  const finishPack = () => {
    const cards = [...pending.values()].sort((a, b) => a.idx - b.idx);
    pending = new Map();
    if (!cards.length) return Promise.resolve([]);
    const packAt = Date.now();
    const entries = cards.map((c) => ({ ...c, packAt }));
    return new Promise((resolve) => {
      if (!storage) { unseenLocal.push(...entries); resolve(entries); return; }
      storage.get({ cards: [], unseen: [] }, ({ cards: all, unseen }) => {
        const hidden = document.visibilityState !== 'visible' || !document.hasFocus();
        storage.set({
          cards: [...entries, ...all].slice(0, MAX_CARDS),
          unseen: hidden ? [...entries, ...unseen].slice(0, 200) : unseen,
        }, () => resolve(entries));
      });
    });
  };
  const unseenLocal = []; // mode injection manuelle (sans chrome.storage)

  const getUnseen = (cb) => {
    if (!storage) return cb(unseenLocal.slice());
    storage.get({ unseen: [] }, ({ unseen }) => cb(unseen));
  };
  const clearUnseen = () => {
    unseenLocal.length = 0;
    storage?.set({ unseen: [] });
  };

  // ---- Panneau de récap ----
  let panel;
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const showRecap = (cards) => {
    if (!cards.length) return;
    hideRecap();
    const byPack = new Map();
    for (const c of cards) {
      if (!byPack.has(c.packAt)) byPack.set(c.packAt, []);
      byPack.get(c.packAt).push(c);
    }
    const counts = cards.reduce((acc, c) => ((acc[c.rarity] = (acc[c.rarity] || 0) + 1), acc), {});
    const summary = Object.keys(RARITY_LABEL).filter((r) => counts[r])
      .map((r) => `<span style="color:${RARITY_COLOR[r]};font-weight:700">${counts[r]} ${r}</span>`).join(' · ');

    panel = document.createElement('div');
    panel.id = 'wm-auto-recap';
    panel.innerHTML = `
      <div class="wm-backdrop"></div>
      <div class="wm-box">
        <div class="wm-head">
          <div>
            <div class="wm-title">Pendant ton absence : ${cards.length} carte(s) dans ${byPack.size} paquet(s)</div>
            <div class="wm-sub">${summary}</div>
          </div>
          <button class="wm-close" type="button">Fermer</button>
        </div>
        <div class="wm-body">
          ${[...byPack.entries()].map(([at, list]) => `
            <div class="wm-pack">
              <div class="wm-pack-title">Paquet ouvert à ${fmtTime(at)}</div>
              <div class="wm-grid">
                ${list.map((c) => `
                  <div class="wm-card" style="--r:${RARITY_COLOR[c.rarity] || '#9ca3af'}">
                    <div class="wm-img">${c.img ? `<img src="${esc(c.img)}" alt="">` : ''}</div>
                    <div class="wm-rar">${esc(c.rarity)}</div>
                    <a class="wm-name" href="${esc(c.url)}" target="_blank" rel="noopener" title="${esc(c.name)}">${esc(c.name)}</a>
                    <div class="wm-desc">${esc(c.desc)}</div>
                    <div class="wm-stats"><span>⚔ ${(c.stats[0] ?? 0).toLocaleString('fr-FR')}</span><span>🛡 ${(c.stats[1] ?? 0).toLocaleString('fr-FR')}</span></div>
                  </div>`).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #wm-auto-recap{position:fixed;inset:0;z-index:100000;font:13px system-ui,sans-serif;color:#d1fae5}
      #wm-auto-recap .wm-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.65)}
      #wm-auto-recap .wm-box{position:absolute;top:5vh;left:50%;transform:translateX(-50%);width:min(960px,94vw);max-height:90vh;display:flex;flex-direction:column;background:#0f1714;border:1px solid #10b981;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.6)}
      #wm-auto-recap .wm-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #1f2b25}
      #wm-auto-recap .wm-title{font-size:16px;font-weight:700}
      #wm-auto-recap .wm-sub{margin-top:4px;color:#a7f3d0}
      #wm-auto-recap .wm-close{background:#10b981;color:#052e22;border:none;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer}
      #wm-auto-recap .wm-body{overflow:auto;padding:14px 18px}
      #wm-auto-recap .wm-pack-title{color:#6ee7b7;font-weight:600;margin:8px 0}
      #wm-auto-recap .wm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:14px}
      #wm-auto-recap .wm-card{position:relative;background:#16211c;border:2px solid var(--r);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:4px}
      #wm-auto-recap .wm-img{height:100px;border-radius:6px;overflow:hidden;background:#0b110e}
      #wm-auto-recap .wm-img img{width:100%;height:100%;object-fit:cover}
      #wm-auto-recap .wm-rar{position:absolute;top:6px;left:6px;background:var(--r);color:#052e22;font-weight:800;font-size:11px;padding:2px 6px;border-radius:6px}
      #wm-auto-recap .wm-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:inherit;text-decoration:none}
      #wm-auto-recap .wm-name:hover{text-decoration:underline}
      #wm-auto-recap .wm-desc{color:#9ca3af;font-size:11px;line-height:1.3;max-height:2.6em;overflow:hidden}
      #wm-auto-recap .wm-stats{display:flex;justify-content:space-between;font-size:11px;color:#a7f3d0;font-weight:600}
    `;
    panel.prepend(style);
    panel.querySelector('.wm-close').addEventListener('click', hideRecap);
    panel.querySelector('.wm-backdrop').addEventListener('click', hideRecap);
    document.body.appendChild(panel);
  };
  const hideRecap = () => {
    if (panel) { panel.remove(); panel = null; }
    clearUnseen();
  };

  // Au retour sur l'onglet : afficher le récap des cartes ouvertes hors de vue.
  let lastShown = 0;
  const maybeShowRecap = () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastShown < 2000) return;
    getUnseen((unseen) => {
      if (!unseen.length || panel) return;
      lastShown = Date.now();
      showRecap(unseen);
    });
  };
  document.addEventListener('visibilitychange', maybeShowRecap);
  window.addEventListener('focus', maybeShowRecap);

  window.WMCards = { capture, record, finishPack, showRecap, hideRecap, maybeShowRecap, getUnseen, RARITY_LABEL, RARITY_COLOR };
})();

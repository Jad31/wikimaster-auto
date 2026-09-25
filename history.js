const RARITY_LABEL = { C: 'Commune', PC: 'Peu commune', R: 'Rare', SR: 'Super rare', UR: 'Ultra rare', L: 'Légendaire' };
const RARITY_COLOR = { C: '#34d399', PC: '#60a5fa', R: '#a78bfa', SR: '#f472b6', UR: '#fbbf24', L: '#f97316' };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

let all = [];
let activeRarity = null;

function render() {
  const q = $('search').value.trim().toLowerCase();
  const list = all.filter((c) => (!activeRarity || c.rarity === activeRarity) &&
    (!q || (c.name || '').toLowerCase().includes(q) || (c.desc || '').toLowerCase().includes(q)));
  const counts = all.reduce((acc, c) => ((acc[c.rarity] = (acc[c.rarity] || 0) + 1), acc), {});
  const packs = new Set(all.map((c) => c.packAt)).size;
  $('summary').textContent = `${all.length} carte(s) dans ${packs} paquet(s)` +
    (list.length !== all.length ? ` — ${list.length} affichée(s)` : '');
  $('rarities').innerHTML = Object.keys(RARITY_LABEL).map((r) =>
    `<button data-r="${r}" class="${activeRarity === r ? 'active' : ''}" style="--r:${RARITY_COLOR[r]}" title="${RARITY_LABEL[r]}">${r} ${counts[r] || 0}</button>`).join('');
  $('rarities').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => { activeRarity = activeRarity === b.dataset.r ? null : b.dataset.r; render(); }));
  $('grid').innerHTML = list.map((c) => `
    <div class="card" style="--r:${RARITY_COLOR[c.rarity] || '#9ca3af'}">
      <div class="img">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : ''}</div>
      <div class="rar">${esc(c.rarity)}</div>
      <a class="name" href="${esc(c.url || '#')}" target="_blank" rel="noopener" title="${esc(c.name)}">${esc(c.name)}</a>
      <div class="desc">${esc(c.desc)}</div>
      <div class="stats"><span>⚔ ${Number(c.stats?.[0] ?? 0).toLocaleString('fr-FR')}</span><span>🛡 ${Number(c.stats?.[1] ?? 0).toLocaleString('fr-FR')}</span></div>
      <div class="when">${new Date(c.packAt).toLocaleString('fr-FR')}</div>
    </div>`).join('');
  $('empty').hidden = list.length > 0;
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('search').addEventListener('input', render);
$('exportJson').addEventListener('click', () => download('wikimasters-cards.json', JSON.stringify(all, null, 2), 'application/json'));
$('exportCsv').addEventListener('click', () => {
  const rows = [['date', 'rarete', 'nom', 'description', 'atk', 'def', 'wikipedia', 'image']]
    .concat(all.map((c) => [new Date(c.packAt).toISOString(), c.rarity, c.name, c.desc, c.stats?.[0] ?? '', c.stats?.[1] ?? '', c.url ?? '', c.img]));
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  download('wikimasters-cards.csv', '\ufeff' + csv, 'text/csv');
});
$('clear').addEventListener('click', () => {
  if (confirm('Vider tout l\'historique des cartes ?')) chrome.storage.local.set({ cards: [], unseen: [] });
});

const load = () => chrome.storage.local.get({ cards: [] }, ({ cards }) => { all = cards; render(); });
load();
chrome.storage.onChanged.addListener((ch) => { if (ch.cards) load(); });

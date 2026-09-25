const $ = (id) => document.getElementById(id);
const LABEL = {
  IDLE: 'Actif', OPENING: 'Ouverture…', REVEAL: 'Révélation…',
  PAUSED_HUMAN: 'Vérification requise', BACKOFF: 'Erreur, nouvel essai', OFF: 'Pause',
};

function render(data) {
  const { enabled = true, status = {}, totalOpened = 0, lastOpenAt = null, logs = [] } = data;
  const stale = !status.updatedAt || Date.now() - status.updatedAt > 90000;
  const phase = !enabled ? 'OFF' : stale ? 'NO_TAB' : status.phase || 'IDLE';
  $('toggle').textContent = enabled ? 'ON' : 'OFF';
  $('toggle').className = 'toggle' + (enabled ? '' : ' off');
  $('phase').textContent = phase === 'NO_TAB' ? 'Onglet /pulls fermé' : LABEL[phase] || phase;
  $('phase').className = 'phase ' + phase;
  $('available').textContent = status.available != null ? `${status.available} / ${status.max}` : '–';
  $('nextIn').textContent = status.nextIn || (status.available > 0 ? 'maintenant' : '–');
  $('session').textContent = status.sessionOpened ?? 0;
  $('total').textContent = totalOpened;
  $('last').textContent = lastOpenAt ? new Date(lastOpenAt).toLocaleString() : '–';
  $('logs').innerHTML = logs.map((l) => `<li>${l.replace(/</g, '&lt;')}</li>`).join('');
}

const refresh = () => chrome.storage.local.get(null, render);
refresh();
setInterval(refresh, 2000);
chrome.storage.onChanged.addListener(refresh);

$('toggle').addEventListener('click', () => {
  chrome.storage.local.get({ enabled: true }, ({ enabled }) => chrome.storage.local.set({ enabled: !enabled }));
});

$('openTab').addEventListener('click', () => {
  chrome.tabs.query({ url: 'https://www.wiki-masters.com/pulls*' }, (tabs) => {
    if (tabs[0]) chrome.tabs.update(tabs[0].id, { active: true });
    else chrome.tabs.create({ url: 'https://www.wiki-masters.com/pulls' });
  });
});

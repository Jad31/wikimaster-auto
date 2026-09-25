// Service worker : badge + notifications.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ enabled: true }, ({ enabled }) => chrome.storage.local.set({ enabled }));
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
});

const notify = (id, title, message) => {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 2,
  });
};

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'opened') {
    chrome.action.setBadgeText({ text: String(msg.sessionOpened), tabId: sender.tab?.id });
  } else if (msg.type === 'human-check') {
    notify('wm-human', 'WikiMasters Auto-Pulls', 'Vérification demandée par le site : action manuelle requise.');
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    chrome.action.setBadgeText({ text: '!', tabId: sender.tab?.id });
  } else if (msg.type === 'error') {
    notify('wm-error', 'WikiMasters Auto-Pulls', `Erreur : ${msg.message}`);
  }
});

chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.query({ url: 'https://www.wiki-masters.com/pulls*' }, (tabs) => {
    if (tabs[0]) chrome.tabs.update(tabs[0].id, { active: true });
  });
});

const SHOWDOWN_SNAPSHOT = "PCH_SHOWDOWN_SNAPSHOT";
const SHOWDOWN_REQUEST_SNAPSHOT = "PCH_SHOWDOWN_REQUEST_SNAPSHOT";
const APP_READY = "PCH_APP_READY";
const APP_REQUEST_SNAPSHOT = "PCH_APP_REQUEST_SNAPSHOT";
const BRIDGE_STATUS = "PCH_SHOWDOWN_BRIDGE_STATUS";
const SHOWDOWN_PAGE_STATUS = "PCH_SHOWDOWN_PAGE_STATUS";

const APP_URL_PATTERNS = [
  "http://localhost/*",
  "http://127.0.0.1/*",
  "https://pokemon-champions-helper.vercel.app/*",
  "https://mariomanzocco.github.io/PokemonChampionsHelper/*",
];

const SHOWDOWN_URL_PATTERNS = ["https://play.pokemonshowdown.com/*"];

const latestSnapshotsByTab = new Map();
const appTabIds = new Set();

function getLatestSnapshot() {
  let latest = null;

  for (const snapshot of latestSnapshotsByTab.values()) {
    if (!latest || Date.parse(snapshot.capturedAt || "") > Date.parse(latest.capturedAt || "")) {
      latest = snapshot;
    }
  }

  return latest;
}

function sendToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, () => {
    void chrome.runtime.lastError;
  });
}

function relayToAppTabs(snapshot) {
  chrome.tabs.query({ url: APP_URL_PATTERNS }, (tabs) => {
    for (const tab of tabs) {
      if (typeof tab.id !== "number") continue;
      appTabIds.add(tab.id);
      sendToTab(tab.id, { type: SHOWDOWN_SNAPSHOT, snapshot });
    }
  });
}

function requestShowdownSnapshots() {
  chrome.tabs.query({ url: SHOWDOWN_URL_PATTERNS }, (tabs) => {
    for (const tab of tabs) {
      if (typeof tab.id !== "number") continue;
      sendToTab(tab.id, { type: SHOWDOWN_REQUEST_SNAPSHOT });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === SHOWDOWN_SNAPSHOT) {
    const tabId = sender.tab?.id;
    if (typeof tabId === "number" && message.snapshot) {
      latestSnapshotsByTab.set(tabId, message.snapshot);
      relayToAppTabs(message.snapshot);
    }
    sendResponse?.({ ok: true });
    return false;
  }

  if (message.type === APP_READY) {
    const tabId = sender.tab?.id;
    if (typeof tabId === "number") appTabIds.add(tabId);
    const snapshot = getLatestSnapshot();
    sendResponse?.({ ok: true, snapshot });
    requestShowdownSnapshots();
    return false;
  }

  if (message.type === APP_REQUEST_SNAPSHOT) {
    const snapshot = getLatestSnapshot();
    sendResponse?.({ ok: true, snapshot });
    requestShowdownSnapshots();
    return false;
  }

  if (message.type === SHOWDOWN_PAGE_STATUS) {
    chrome.tabs.query({ url: APP_URL_PATTERNS }, (tabs) => {
      for (const tab of tabs) {
        if (typeof tab.id !== "number") continue;
        sendToTab(tab.id, {
          type: BRIDGE_STATUS,
          status: message.status || "waiting",
          message: message.message || "Showdown bridge is waiting for a battle.",
        });
      }
    });
    sendResponse?.({ ok: true });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  latestSnapshotsByTab.delete(tabId);
  appTabIds.delete(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({ url: APP_URL_PATTERNS }, (tabs) => {
    for (const tab of tabs) {
      if (typeof tab.id !== "number") continue;
      sendToTab(tab.id, {
        type: BRIDGE_STATUS,
        status: "installed",
        message: "Showdown bridge installed.",
      });
    }
  });
});

const APP_READY = "PCH_APP_READY";
const APP_REQUEST_SNAPSHOT = "PCH_APP_REQUEST_SNAPSHOT";
const SHOWDOWN_SNAPSHOT = "PCH_SHOWDOWN_SNAPSHOT";
const SHOWDOWN_BRIDGE_STATUS = "PCH_SHOWDOWN_BRIDGE_STATUS";
const PAGE_REQUEST = "PCH_REQUEST_SHOWDOWN_SNAPSHOT";

function postToApp(message) {
  window.postMessage(message, window.location.origin);
}

function sendReady() {
  chrome.runtime.sendMessage({ type: APP_READY }, (response) => {
    if (chrome.runtime.lastError) {
      postToApp({
        type: SHOWDOWN_BRIDGE_STATUS,
        status: "error",
        message: chrome.runtime.lastError.message,
      });
      return;
    }

    postToApp({
      type: SHOWDOWN_BRIDGE_STATUS,
      status: "ready",
      message: "Showdown bridge connected.",
    });

    if (response?.snapshot) {
      postToApp({ type: SHOWDOWN_SNAPSHOT, snapshot: response.snapshot });
    }
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === SHOWDOWN_SNAPSHOT && message.snapshot) {
    postToApp({ type: SHOWDOWN_SNAPSHOT, snapshot: message.snapshot });
    return false;
  }

  if (message.type === SHOWDOWN_BRIDGE_STATUS) {
    postToApp(message);
    return false;
  }

  return false;
});

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.type !== PAGE_REQUEST) return;

  chrome.runtime.sendMessage({ type: APP_REQUEST_SNAPSHOT }, (response) => {
    if (chrome.runtime.lastError) {
      postToApp({
        type: SHOWDOWN_BRIDGE_STATUS,
        status: "error",
        message: chrome.runtime.lastError.message,
      });
      return;
    }

    if (response?.snapshot) {
      postToApp({ type: SHOWDOWN_SNAPSHOT, snapshot: response.snapshot });
    } else {
      postToApp({
        type: SHOWDOWN_BRIDGE_STATUS,
        status: "waiting",
        message: "No Showdown battle snapshot received yet.",
      });
    }
  });
});

sendReady();

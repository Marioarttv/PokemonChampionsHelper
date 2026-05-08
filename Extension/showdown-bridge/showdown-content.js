const PCH_PAGE_SNAPSHOT = "PCH_SHOWDOWN_BRIDGE_PAGE_SNAPSHOT";
const PCH_PAGE_STATUS = "PCH_SHOWDOWN_BRIDGE_PAGE_STATUS";
const PCH_PAGE_REQUEST = "PCH_SHOWDOWN_BRIDGE_PAGE_REQUEST";
const PCH_EXTENSION_SNAPSHOT = "PCH_SHOWDOWN_SNAPSHOT";
const PCH_EXTENSION_REQUEST = "PCH_SHOWDOWN_REQUEST_SNAPSHOT";

function injectProbe() {
  if (document.documentElement.dataset.pchShowdownBridgeInjected === "true") {
    return;
  }

  document.documentElement.dataset.pchShowdownBridgeInjected = "true";
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("showdown-page-probe.js");
  script.async = false;
  script.onload = () => script.remove();
  (document.head || document.documentElement).append(script);
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || typeof data.type !== "string") return;

  if (data.type === PCH_PAGE_SNAPSHOT && data.snapshot) {
    chrome.runtime.sendMessage({ type: PCH_EXTENSION_SNAPSHOT, snapshot: data.snapshot }, () => {
      void chrome.runtime.lastError;
    });
    return;
  }

  if (data.type === PCH_PAGE_STATUS) {
    chrome.runtime.sendMessage({ type: "PCH_SHOWDOWN_PAGE_STATUS", status: data.status, message: data.message }, () => {
      void chrome.runtime.lastError;
    });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== PCH_EXTENSION_REQUEST) return false;
  window.postMessage({ type: PCH_PAGE_REQUEST }, window.location.origin);
  return false;
});

injectProbe();

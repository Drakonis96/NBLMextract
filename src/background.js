function enableActionSidePanel() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => {
      console.error("[NBLMextract] Failed to enable side panel on action click", error);
    });
}

chrome.runtime.onInstalled.addListener(() => {
  enableActionSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  enableActionSidePanel();
});

enableActionSidePanel();
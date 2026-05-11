const conversationTitleNode = document.getElementById("conversation-title");
const conversationSummaryNode = document.getElementById("conversation-summary");
const turnCountNode = document.getElementById("turn-count");
const userCountNode = document.getElementById("user-count");
const assistantCountNode = document.getElementById("assistant-count");
const exportButton = document.getElementById("export-button");
const refreshButton = document.getElementById("refresh-button");
const statusLineNode = document.getElementById("status-line");
const lastExportTitleNode = document.getElementById("last-export-title");
const lastExportMetaNode = document.getElementById("last-export-meta");

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

function setBusy(isBusy) {
  exportButton.disabled = isBusy;
  refreshButton.disabled = isBusy;
  exportButton.textContent = isBusy ? "Exportando…" : "Exportar conversación actual";
}

function setStatus(message, state = "idle") {
  statusLineNode.textContent = message;
  statusLineNode.dataset.state = state;
}

function updateLastExport(lastExport) {
  if (!lastExport) {
    lastExportTitleNode.textContent = "Aún no hay exportaciones";
    lastExportMetaNode.textContent = "Cuando exportes, aquí verás el archivo generado y el momento exacto.";
    return;
  }

  lastExportTitleNode.textContent = lastExport.title || lastExport.filename || "Exportación completada";
  const when = lastExport.exportedAt
    ? new Date(lastExport.exportedAt).toLocaleString("es-ES")
    : "momento no disponible";
  const parts = [
    lastExport.filename,
    `${lastExport.turnCount ?? "?"} turnos`,
    when
  ].filter(Boolean);
  lastExportMetaNode.textContent = parts.join(" · ");
}

function updateConversationCard(status) {
  if (!status?.isNotebookPage) {
    conversationTitleNode.textContent = "Pestaña no compatible";
    conversationSummaryNode.textContent = status?.message || "Abre una conversación de NotebookLM en la pestaña activa.";
    turnCountNode.textContent = "-";
    userCountNode.textContent = "-";
    assistantCountNode.textContent = "-";
    exportButton.disabled = true;
    return;
  }

  conversationTitleNode.textContent = status.title || "Conversación de NotebookLM";
  conversationSummaryNode.textContent = status.readyToExport
    ? `Lista para exportar desde ${status.url}`
    : "La conversación está abierta pero aún no se han detectado mensajes exportables.";
  turnCountNode.textContent = String(status.turnCount ?? 0);
  userCountNode.textContent = String(status.userTurns ?? 0);
  assistantCountNode.textContent = String(status.assistantTurns ?? 0);
  exportButton.disabled = !status.readyToExport;
}

async function requestActiveTabStatus() {
  const tab = await getActiveTab();

  if (!tab?.id) {
    return {
      isNotebookPage: false,
      message: "No se encontró una pestaña activa."
    };
  }

  if (!tab.url || !tab.url.startsWith("https://notebooklm.google.com/")) {
    return {
      isNotebookPage: false,
      message: "La pestaña activa no pertenece a NotebookLM."
    };
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "NBLMEXPORT_STATUS" });
  } catch {
    return {
      isNotebookPage: false,
      message: "No pude comunicarme con la página. Recarga NotebookLM y vuelve a intentarlo."
    };
  }
}

async function refreshPanelState() {
  setStatus("Actualizando estado de la pestaña activa…");

  const [status, storage] = await Promise.all([
    requestActiveTabStatus(),
    chrome.storage.local.get("lastExport")
  ]);

  updateConversationCard(status);
  updateLastExport(storage.lastExport);

  if (status?.isNotebookPage && status.readyToExport) {
    setStatus("La conversación está lista para exportarse.");
  } else {
    setStatus(status?.message || "Abre una conversación de NotebookLM para habilitar la exportación.");
  }
}

async function exportActiveConversation() {
  setBusy(true);
  setStatus("Enviando la exportación a la pestaña activa…");

  try {
    const tab = await getActiveTab();
    if (!tab?.id) {
      throw new Error("No se encontró una pestaña activa.");
    }

    const result = await chrome.tabs.sendMessage(tab.id, { type: "NBLMEXPORT_TRIGGER" });
    if (!result?.ok) {
      throw new Error(result?.error || "La exportación no pudo completarse.");
    }

    setStatus("Markdown descargado correctamente.", "success");
    await refreshPanelState();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Error inesperado al exportar.", "error");
  } finally {
    setBusy(false);
  }
}

refreshButton.addEventListener("click", () => {
  void refreshPanelState();
});

exportButton.addEventListener("click", () => {
  void exportActiveConversation();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.lastExport) {
    updateLastExport(changes.lastExport.newValue);
  }
});

chrome.tabs.onActivated.addListener(() => {
  void refreshPanelState();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.status === "complete" || changeInfo.url)) {
    void refreshPanelState();
  }
});

void refreshPanelState();
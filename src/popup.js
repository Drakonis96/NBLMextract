const exportButton = document.getElementById("export-button");
const statusNode = document.getElementById("status");

function setStatus(message, state = "idle") {
  statusNode.textContent = message;
  statusNode.dataset.state = state;
}

function setBusy(isBusy) {
  exportButton.disabled = isBusy;
  exportButton.textContent = isBusy ? "Exportando..." : "Exportar conversacion abierta";
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

async function triggerExport() {
  setBusy(true);
  setStatus("Buscando una pestaña activa de NotebookLM...");

  try {
    const tab = await getActiveTab();
    if (!tab?.id) {
      throw new Error("No se encontro una pestaña activa.");
    }

    if (!tab.url || !tab.url.startsWith("https://notebooklm.google.com/notebook/")) {
      throw new Error("La pestaña activa no es una conversacion abierta de NotebookLM.");
    }

    setStatus("Solicitando exportacion a la pestaña activa...");
    const response = await chrome.tabs.sendMessage(tab.id, { type: "NBLMEXPORT_TRIGGER" });

    if (!response?.ok) {
      throw new Error(response?.error || "La exportacion no pudo completarse.");
    }

    setStatus("Markdown descargado correctamente.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Error inesperado al exportar.", "error");
  } finally {
    setBusy(false);
  }
}

exportButton.addEventListener("click", () => {
  void triggerExport();
});
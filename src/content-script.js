import { buildFilename, buildMarkdown, extractConversation, getNotebookTitle } from "./core.js";

const BUTTON_ID = "nblmextract-export-button";
const FLOATING_HOST_ID = "nblmextract-floating-host";
const BUTTON_LABEL = "Exportar Markdown";
const TOOLBAR_SELECTORS = [
  ".chat-panel .panel-header .chat-header-buttons",
  ".chat-panel .panel-header",
  ".panel-header .chat-header-buttons",
  ".panel-header",
  "header"
];

let reinjectionTimer = null;
let hasMessageListener = false;

function isNotebookPage() {
  return location.hostname === "notebooklm.google.com" && location.pathname.includes("/notebook/");
}

function getToolbarHost() {
  for (const selector of TOOLBAR_SELECTORS) {
    const host = document.querySelector(selector);
    if (host) {
      return { element: host, floating: false };
    }
  }

  return { element: document.body, floating: true };
}

function setButtonState(button, label, state, disabled) {
  button.textContent = label;
  button.dataset.state = state;
  button.disabled = disabled;
}

function resetButton(button) {
  setButtonState(button, BUTTON_LABEL, "idle", false);
  button.removeAttribute("title");
}

function downloadMarkdown(markdown, filename) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1_000);
}

function showTemporaryState(button, label, state, title = "") {
  setButtonState(button, label, state, true);
  if (title) {
    button.title = title;
  }

  window.setTimeout(() => {
    resetButton(button);
  }, 2_400);
}

function setLastExport(metadata) {
  try {
    chrome.storage.local.set({ lastExport: metadata });
  } catch {
    // Ignore storage failures in content scripts.
  }
}

function buildExportPayload() {
  const conversation = extractConversation(document);
  if (conversation.turns.length === 0) {
    throw new Error("No se detectaron mensajes exportables en la conversacion abierta.");
  }

  const markdown = buildMarkdown(conversation);
  const filename = buildFilename(conversation);

  return {
    conversation,
    markdown,
    filename
  };
}

function exportConversation(button) {
  try {
    setButtonState(button, "Exportando...", "busy", true);

    const { conversation, markdown, filename } = buildExportPayload();
    downloadMarkdown(markdown, filename);
    setLastExport({
      filename,
      title: conversation.title,
      exportedAt: conversation.exportedAt,
      url: conversation.url,
      turnCount: conversation.turns.length
    });
    showTemporaryState(button, "Markdown listo", "success");
  } catch (error) {
    console.error("[NBLMextract] Export failed", error);
    showTemporaryState(
      button,
      "Error al exportar",
      "error",
      error instanceof Error ? error.message : "Unexpected export error"
    );
  }
}

function exportConversationFromMessage() {
  const existingButton = document.getElementById(BUTTON_ID);

  if (existingButton instanceof HTMLButtonElement) {
    exportConversation(existingButton);
    return { ok: true };
  }

  try {
    const { conversation, markdown, filename } = buildExportPayload();
    downloadMarkdown(markdown, filename);
    setLastExport({
      filename,
      title: conversation.title,
      exportedAt: conversation.exportedAt,
      url: conversation.url,
      turnCount: conversation.turns.length
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected export error"
    };
  }
}

function getConversationStatus() {
  if (!isNotebookPage()) {
    return {
      ok: false,
      isNotebookPage: false,
      message: "La pestaña activa no es una conversacion abierta de NotebookLM."
    };
  }

  const conversation = extractConversation(document);
  return {
    ok: true,
    isNotebookPage: true,
    title: getNotebookTitle(document),
    url: location.href,
    turnCount: conversation.turns.length,
    assistantTurns: conversation.turns.filter((turn) => turn.role === "assistant").length,
    userTurns: conversation.turns.filter((turn) => turn.role === "user").length,
    readyToExport: conversation.turns.length > 0
  };
}

function registerMessageListener() {
  if (hasMessageListener) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "NBLMEXPORT_TRIGGER") {
      sendResponse(exportConversationFromMessage());
      return true;
    }

    if (message?.type === "NBLMEXPORT_STATUS") {
      sendResponse(getConversationStatus());
      return true;
    }

    return false;
  });

  hasMessageListener = true;
}

function createButton() {
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = "nblmextract-button";
  button.setAttribute("aria-label", "Export current NotebookLM conversation to Markdown");
  resetButton(button);
  button.addEventListener("click", () => exportConversation(button));
  return button;
}

function removeFloatingHost() {
  document.getElementById(FLOATING_HOST_ID)?.remove();
}

function attachButton() {
  if (!isNotebookPage()) {
    document.getElementById(BUTTON_ID)?.remove();
    removeFloatingHost();
    return;
  }

  const currentButton = document.getElementById(BUTTON_ID);
  const target = getToolbarHost();

  if (currentButton) {
    const isAlreadyPlaced = target.floating
      ? currentButton.parentElement?.id === FLOATING_HOST_ID
      : currentButton.parentElement === target.element;

    if (isAlreadyPlaced) {
      return;
    }

    currentButton.remove();
    removeFloatingHost();
  }

  const button = createButton();

  if (target.floating) {
    const host = document.createElement("div");
    host.id = FLOATING_HOST_ID;
    host.appendChild(button);
    document.body.appendChild(host);
    return;
  }

  target.element.appendChild(button);
}

function scheduleAttach() {
  window.clearTimeout(reinjectionTimer);
  reinjectionTimer = window.setTimeout(() => {
    attachButton();
  }, 120);
}

function startObservers() {
  const observer = new MutationObserver(() => {
    scheduleAttach();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("popstate", scheduleAttach);
  window.addEventListener("pageshow", scheduleAttach);
}

function main() {
  attachButton();
  startObservers();
  registerMessageListener();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main, { once: true });
} else {
  main();
}
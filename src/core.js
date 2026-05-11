import TurndownService from "turndown";

const ROOT_SELECTORS = [
  ".chat-panel",
  "[role='main']",
  "main"
];

const USER_TURN_SELECTORS = [
  ".from-user-container",
  ".user-message",
  "[data-role='user']",
  "[data-message-author='user']"
];

const ASSISTANT_TURN_SELECTORS = [
  ".to-user-container",
  ".assistant-message",
  "[data-role='assistant']",
  "[data-message-author='assistant']"
];

const GENERIC_TURN_SELECTORS = [
  "[data-message-id]",
  ".message",
  ".chat-message"
];

const MESSAGE_BODY_SELECTORS = [
  ".message-text-content",
  ".message-content",
  "[data-message-content]",
  ".markdown",
  ".prose"
];

const CITATION_BUTTON_SELECTORS = [
  "button.citation-marker",
  "button[data-citation]"
];

const CONTROL_SELECTORS = [
  "button:not(.citation-marker)",
  "textarea",
  "input",
  "form",
  "svg",
  "mat-icon",
  "omnibar",
  "query-box",
  ".follow-up-chip",
  ".query-box-container",
  ".omnibar-container",
  ".scroll-carousel",
  ".create-artifact-button-container",
  "[contenteditable='true']"
];

const CONTROL_TEXT_PATTERNS = [
  /^more_horiz$/i,
  /^more_vert$/i,
  /^copy_all$/i,
  /^bookmark_border$/i,
  /^thumb_up$/i,
  /^thumb_down$/i,
  /^keep$/i,
  /^keep_pin$/i,
  /^share$/i,
  /^open_in_new$/i,
  /^arrow_forward$/i,
  /^expand_more$/i,
  /^expand_less$/i,
  /^keyboard_arrow_down$/i,
  /^refresh$/i,
  /^quick_phrases$/i,
  /^start typing\.\.\.$/i,
  /^loading$/i,
  /^audio overview$/i,
  /^video overview$/i,
  /^mind map$/i,
  /^save to note$/i,
  /^sources?$/i,
  /^\d+ sources$/i,
  /^\d+ fuent(?:e|es)$/i
];

const TITLE_SUFFIX_PATTERN = /\s*[-|]\s*NotebookLM.*$/i;

function firstMatch(root, selectors) {
  for (const selector of selectors) {
    const hit = root.querySelector(selector);
    if (hit) {
      return hit;
    }
  }

  return null;
}

function uniqueNodes(nodes) {
  return Array.from(new Set(nodes));
}

function getRoot(documentRef) {
  return firstMatch(documentRef, ROOT_SELECTORS) ?? documentRef.body;
}

function isNestedCandidate(candidate, allCandidates) {
  return allCandidates.some((other) => other !== candidate && other.contains(candidate));
}

function textLength(node) {
  return (node.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

function getMessageBody(turnNode) {
  for (const selector of MESSAGE_BODY_SELECTORS) {
    const body = turnNode.querySelector(selector);
    if (body && textLength(body) > 0) {
      return body;
    }
  }

  if (textLength(turnNode) > 0) {
    return turnNode;
  }

  return null;
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function parseCitationNumber(text) {
  const match = text.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function normalizeCitationLabel(label, number) {
  let cleaned = normalizeWhitespace(label);

  if (!cleaned) {
    return "";
  }

  cleaned = cleaned
    .replace(/^(citation|source|fuente|fonte|quelle|fonte)\s*/i, "")
    .replace(/^(open source|abrir fuente|ouvrir la source)\s*/i, "")
    .trim();

  if (number !== null) {
    const numberPrefix = new RegExp(`^\\[?${number}\\]?\\s*[:.-]?\\s*`);
    cleaned = cleaned.replace(numberPrefix, "").trim();
  }

  const colonIndex = cleaned.indexOf(": ");
  if (colonIndex > 0) {
    cleaned = cleaned.slice(colonIndex + 2).trim();
  }

  return cleaned;
}

function extractSourceFromCitation(button) {
  const buttonText = normalizeWhitespace(button.textContent ?? "");
  const number = parseCitationNumber(buttonText);
  const labelledNode = button.querySelector("span[aria-label], [aria-label], [title], [data-source-name]");

  const rawLabel = labelledNode?.getAttribute("aria-label")
    ?? labelledNode?.getAttribute("title")
    ?? button.getAttribute("aria-label")
    ?? button.getAttribute("title")
    ?? button.dataset.sourceName
    ?? "";

  const name = normalizeCitationLabel(rawLabel, number);

  if (!name) {
    return null;
  }

  return {
    number,
    name
  };
}

function replaceCitationButtons(node) {
  for (const selector of CITATION_BUTTON_SELECTORS) {
    node.querySelectorAll(selector).forEach((button) => {
      const number = parseCitationNumber(button.textContent ?? "");
      const replacement = number === null ? "" : ` [${number}] `;
      button.replaceWith(node.ownerDocument.createTextNode(replacement));
    });
  }
}

function removeControls(node) {
  CONTROL_SELECTORS.forEach((selector) => {
    node.querySelectorAll(selector).forEach((element) => element.remove());
  });
}

function removeControlText(node) {
  const view = node.ownerDocument.defaultView;
  const nodeFilter = view?.NodeFilter;

  if (!nodeFilter) {
    return;
  }

  const walker = node.ownerDocument.createTreeWalker(node, nodeFilter.SHOW_TEXT);
  const textNodesToRemove = [];

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const text = normalizeWhitespace(textNode.textContent ?? "");

    if (!text) {
      textNodesToRemove.push(textNode);
      continue;
    }

    if (CONTROL_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
      textNodesToRemove.push(textNode);
    }
  }

  textNodesToRemove.forEach((textNode) => textNode.parentNode?.removeChild(textNode));
}

function prepareMessageNode(bodyNode) {
  const cloned = bodyNode.cloneNode(true);
  replaceCitationButtons(cloned);
  removeControls(cloned);
  removeControlText(cloned);
  return cloned;
}

function markdownFromNode(bodyNode, turndownService) {
  const markdown = turndownService.turndown(bodyNode.innerHTML).trim();

  return markdown
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function inferRole(turnNode, previousRole) {
  if (USER_TURN_SELECTORS.some((selector) => turnNode.matches(selector) || turnNode.querySelector(selector))) {
    return "user";
  }

  if (ASSISTANT_TURN_SELECTORS.some((selector) => turnNode.matches(selector) || turnNode.querySelector(selector))) {
    return "assistant";
  }

  if (turnNode.querySelector(CITATION_BUTTON_SELECTORS.join(", "))) {
    return "assistant";
  }

  return previousRole === "user" ? "assistant" : "user";
}

function collectTurnCandidates(rootNode) {
  const selector = [
    ...USER_TURN_SELECTORS,
    ...ASSISTANT_TURN_SELECTORS,
    ...GENERIC_TURN_SELECTORS
  ].join(", ");

  const candidates = Array.from(rootNode.querySelectorAll(selector));
  const filtered = candidates.filter((candidate) => !isNestedCandidate(candidate, candidates));

  if (filtered.length > 0) {
    return uniqueNodes(filtered);
  }

  return uniqueNodes(
    Array.from(rootNode.querySelectorAll(MESSAGE_BODY_SELECTORS.join(", ")))
      .map((node) => node.parentElement)
      .filter(Boolean)
  );
}

function collectSources(turnNode) {
  const groupedSources = new Map();

  for (const selector of CITATION_BUTTON_SELECTORS) {
    turnNode.querySelectorAll(selector).forEach((button) => {
      const source = extractSourceFromCitation(button);
      if (!source) {
        return;
      }

      const key = source.name;
      const current = groupedSources.get(key) ?? {
        name: source.name,
        numbers: []
      };

      if (source.number !== null && !current.numbers.includes(source.number)) {
        current.numbers.push(source.number);
      }

      groupedSources.set(key, current);
    });
  }

  const sources = Array.from(groupedSources.values()).map((source) => ({
    ...source,
    numbers: source.numbers.sort((left, right) => left - right)
  }));

  sources.sort((left, right) => {
    const leftNumber = left.numbers[0] ?? null;
    const rightNumber = right.numbers[0] ?? null;

    if (leftNumber === null && rightNumber === null) {
      return left.name.localeCompare(right.name);
    }

    if (leftNumber === null) {
      return 1;
    }

    if (rightNumber === null) {
      return -1;
    }

    return leftNumber - rightNumber;
  });

  return sources;
}

function yamlString(value) {
  return JSON.stringify(value ?? "");
}

function markdownSourceLine(source) {
  if (!source.numbers || source.numbers.length === 0) {
    return `- ${source.name}`;
  }

  const markerList = source.numbers.join(", ");
  return `- [${markerList}] ${source.name}`;
}

export function createTurndownService() {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*"
  });

  service.addRule("removeScripts", {
    filter: ["script", "style", "noscript"],
    replacement: () => ""
  });

  service.keep(["sup", "sub"]);

  return service;
}

export function getNotebookTitle(documentRef) {
  const headerTitle = firstMatch(documentRef, [
    ".panel-header h1",
    ".chat-panel h1",
    "h1"
  ])?.textContent;

  const preferredTitle = normalizeWhitespace(headerTitle ?? "") || normalizeWhitespace(documentRef.title ?? "");

  if (!preferredTitle) {
    return "NotebookLM Conversation";
  }

  return preferredTitle.replace(TITLE_SUFFIX_PATTERN, "").trim() || "NotebookLM Conversation";
}

export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "conversation";
}

export function buildFilename(conversation) {
  const exportedAt = conversation.exportedAt ?? new Date().toISOString();
  const timestamp = exportedAt
    .replace(/[:]/g, "-")
    .replace(/\.\d{3}Z$/, "Z");

  return `notebooklm-conversation-${slugify(conversation.title)}-${timestamp}.md`;
}

export function extractConversation(documentRef, options = {}) {
  const root = getRoot(documentRef);
  const turndownService = createTurndownService();
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const turns = [];
  let previousRole = null;

  for (const candidate of collectTurnCandidates(root)) {
    const bodyNode = getMessageBody(candidate);
    if (!bodyNode || textLength(bodyNode) === 0) {
      continue;
    }

    const role = inferRole(candidate, previousRole);
    const cleanedNode = prepareMessageNode(bodyNode);
    const content = markdownFromNode(cleanedNode, turndownService);

    if (!content) {
      continue;
    }

    const turn = {
      index: turns.length + 1,
      role,
      content,
      sources: role === "assistant" ? collectSources(candidate) : []
    };

    turns.push(turn);
    previousRole = role;
  }

  return {
    title: getNotebookTitle(documentRef),
    url: documentRef.location?.href ?? "",
    exportedAt,
    turns
  };
}

export function buildMarkdown(conversation) {
  const lines = [
    "---",
    `title: ${yamlString(conversation.title)}`,
    "source: \"NotebookLM conversation\"",
    `url: ${yamlString(conversation.url)}`,
    `exported_at: ${yamlString(conversation.exportedAt)}`,
    `turns: ${conversation.turns.length}`,
    "---",
    "",
    `# ${conversation.title}`,
    "",
    `- Exported: ${conversation.exportedAt}`,
    `- URL: ${conversation.url || "Unavailable"}`,
    `- Turns: ${conversation.turns.length}`,
    "",
    "---",
    ""
  ];

  conversation.turns.forEach((turn, index) => {
    lines.push(`## Turn ${turn.index} - ${turn.role === "user" ? "Usuario" : "Agente"}`);
    lines.push("");
    lines.push(turn.content);
    lines.push("");

    if (turn.role === "assistant") {
      lines.push("### Fuentes");
      lines.push("");

      if (turn.sources.length === 0) {
        lines.push("- Sin fuentes detectadas");
      } else {
        turn.sources.forEach((source) => lines.push(markdownSourceLine(source)));
      }

      lines.push("");
    }

    if (index < conversation.turns.length - 1) {
      lines.push("---");
      lines.push("");
    }
  });

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
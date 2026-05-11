import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { buildFilename, buildMarkdown, extractConversation } from "../src/core.js";

function buildDocument(markup) {
  return new JSDOM(markup, {
    url: "https://notebooklm.google.com/notebook/abc123",
    contentType: "text/html"
  }).window.document;
}

test("extracts ordered user and assistant turns with sources", () => {
  const documentRef = buildDocument(`
    <!doctype html>
    <html>
      <head>
        <title>Research Session - NotebookLM</title>
      </head>
      <body>
        <main class="chat-panel">
          <div class="panel-header">
            <div class="chat-header-buttons"></div>
          </div>
          <div class="conversation">
            <div class="from-user-container">
              <div class="message-text-content">
                <p>Summarize the article in three points.</p>
              </div>
            </div>
            <div class="to-user-container">
              <div class="message-text-content">
                <p>
                  The paper argues for a staged rollout [1] and a stronger review loop [2].
                  <button class="citation-marker"><span aria-label="1: Paper A.pdf">1</span></button>
                  <button class="citation-marker"><span aria-label="2: Appendix B">2</span></button>
                </p>
              </div>
            </div>
            <div class="from-user-container">
              <div class="message-text-content">
                <p>Now compare it with the appendix.</p>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `);

  const conversation = extractConversation(documentRef, {
    exportedAt: "2026-05-11T09:30:00.000Z"
  });

  assert.equal(conversation.title, "Research Session");
  assert.equal(conversation.turns.length, 3);
  assert.deepEqual(conversation.turns.map((turn) => turn.role), ["user", "assistant", "user"]);
  assert.deepEqual(conversation.turns[1].sources, [
    { name: "Paper A.pdf", numbers: [1] },
    { name: "Appendix B", numbers: [2] }
  ]);

  const markdown = buildMarkdown(conversation);
  assert.match(markdown, /## Turn 1 - Usuario/);
  assert.match(markdown, /## Turn 2 - Agente/);
  assert.match(markdown, /### Fuentes\n\n- \[1\] Paper A\.pdf\n- \[2\] Appendix B/);
  assert.ok(markdown.indexOf("## Turn 1 - Usuario") < markdown.indexOf("## Turn 2 - Agente"));
});

test("deduplicates repeated citations and strips control text", () => {
  const documentRef = buildDocument(`
    <!doctype html>
    <html>
      <head>
        <title>NotebookLM</title>
      </head>
      <body>
        <main class="chat-panel">
          <div class="to-user-container">
            <div class="message-text-content">
              <p>
                Here is the answer.
                <button class="citation-marker"><span aria-label="1: Shared Source">1</span></button>
                <button class="citation-marker"><span aria-label="1: Shared Source">1</span></button>
              </p>
              <p>more_vert</p>
              <p>copy_all</p>
            </div>
          </div>
        </main>
      </body>
    </html>
  `);

  const conversation = extractConversation(documentRef, {
    exportedAt: "2026-05-11T09:30:00.000Z"
  });

  assert.equal(conversation.turns.length, 1);
  assert.deepEqual(conversation.turns[0].sources, [{ name: "Shared Source", numbers: [1] }]);
  assert.doesNotMatch(conversation.turns[0].content, /more_vert|copy_all/);
  assert.equal(buildFilename(conversation), "notebooklm-conversation-notebooklm-2026-05-11T09-30-00Z.md");
});

test("groups repeated documents under one source entry with all markers", () => {
  const documentRef = buildDocument(`
    <!doctype html>
    <html>
      <head>
        <title>Grouped Sources - NotebookLM</title>
      </head>
      <body>
        <main class="chat-panel">
          <div class="to-user-container">
            <div class="message-text-content">
              <p>
                Repeated references.
                <button class="citation-marker"><span aria-label="1: Source A">1</span></button>
                <button class="citation-marker"><span aria-label="2: Source A">2</span></button>
                <button class="citation-marker"><span aria-label="3: Source B">3</span></button>
              </p>
            </div>
          </div>
        </main>
      </body>
    </html>
  `);

  const conversation = extractConversation(documentRef, {
    exportedAt: "2026-05-11T09:30:00.000Z"
  });

  assert.deepEqual(conversation.turns[0].sources, [
    { name: "Source A", numbers: [1, 2] },
    { name: "Source B", numbers: [3] }
  ]);

  const markdown = buildMarkdown(conversation);
  assert.match(markdown, /### Fuentes\n\n- \[1, 2\] Source A\n- \[3\] Source B/);
});
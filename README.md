# NotebookLM Conversation Exporter

Chrome extension for exporting the currently open NotebookLM conversation into a structured Markdown file.

## What it does

- Detects the conversation visible in the open NotebookLM tab.
- Preserves the full chronological order of turns.
- Separates user messages from agent responses with explicit headings.
- Appends a `Fuentes` section immediately after each agent response.
- Lists the cited NotebookLM document names for each response.
- Opens a persistent Chrome side panel from the toolbar icon for export and status.
- Runs locally in the browser without copy-paste or external services.

## Project layout

```text
.
├── package.json
├── scripts/
│   └── build.mjs
├── src/
│   ├── content-script.js
│   ├── core.js
│   ├── manifest.json
│   └── styles.css
└── test/
    └── conversation-export.test.mjs
```

## Development

```bash
npm install
npm run test
npm run build
```

The build outputs a loadable unpacked extension in `extension/`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select the generated `extension/` folder.
5. Open a NotebookLM notebook conversation.

Click the extension icon in Chrome's toolbar to open the side panel. The in-page `Exportar Markdown` button still works as a direct shortcut inside NotebookLM.

## Usage

1. Open the target conversation in NotebookLM.
2. Click `Exportar Markdown` in the chat header.
3. If the header is not available yet, use the floating fallback button.
4. Chrome downloads a `.md` file for the active conversation.

## Markdown structure

The exported file contains:

- YAML front matter with title, URL, export timestamp, and number of turns.
- One section per turn using `## Turn N - Usuario` or `## Turn N - Agente`.
- A `### Fuentes` list after every agent turn.
- Stable formatting suitable for archiving and downstream parsing.

## Selector strategy

The extractor prioritizes NotebookLM-specific containers seen in current layouts:

- User turns: `.from-user-container`
- Agent turns: `.to-user-container`
- Message body: `.message-text-content`
- Citations: `button.citation-marker` with `span[aria-label]`

Fallback selectors are included for less structured message wrappers, but the extension stays anchored to NotebookLM-specific DOM first.
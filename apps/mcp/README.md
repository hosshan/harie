# @harie/mcp

English | [日本語](https://github.com/hosshan/harie/blob/main/apps/mcp/README.ja.md)

A local MCP server (stdio) for reading and writing Harie files: screenshots saved as ordinary JPEG / PNG images whose annotations (boxes, arrows, callouts, text) stay editable after saving.
It lets MCP clients such as Claude handle requests like "put a red box around the save button" or "fix the wording of this callout".

Harie is a tool for annotating screenshots in SaaS user guides. A Harie file opens in any image viewer as a normal picture, and Harie can reopen it to edit the annotations again and again.

The server never calls an LLM. The client's LLM looks at the image and decides what to annotate; the server only reads, writes and renders files.

## Tools

| Tool | What it does |
|---|---|
| `harie_open` | Opens a file and returns its annotations and the image. A plain image returns `status: plain` |
| `harie_create` | Creates a Harie file from a plain JPEG / PNG (default `<name>.harie.<ext>`; the original is kept). `format` (`jpeg` / `png`) picks the output format |
| `harie_preview` | Returns the image with annotation changes (ops) applied. The file is not changed |
| `harie_edit` | Applies annotation changes, re-renders and overwrites the file. `expectedRevision` provides optimistic locking |
| `harie_list` | Lists Harie files in a directory |
| `harie_mask` | Hides personal information by burning it into the base image (irreversible). Saves only with `confirm: true`; without it, only the masked image is returned |

The server can only access files under the directory given by `--root` (default: the current directory). `harie_mask` rewrites the base image, so the change cannot be undone once saved. To keep the original, save to another file with `outPath`.

## Setup

Requires Node.js 22 or later. Launch `@harie/mcp` from npm with `npx`.

### Claude Code

```sh
claude mcp add harie -- npx -y @harie/mcp --root ~/Pictures/guides
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "harie": {
      "command": "npx",
      "args": ["-y", "@harie/mcp", "--root", "/Users/you/Pictures/guides"]
    }
  }
}
```

### Run from the repository (development)

```sh
pnpm install
pnpm build   # produces apps/mcp/dist/index.mjs and dist/fonts/
claude mcp add harie -- node /path/to/harie/apps/mcp/dist/index.mjs --root ~/Pictures/guides
```

### Guide prompt (`harie_guide`)

The server ships a prompt, `harie_guide` (arguments: `path`, optional `intent`), with the same rules the web editor's AI suggestions use: which UI elements to highlight (only what the explanation needs, at most 8, in the order of operation), how to write each callout (1–2 sentences saying what the reader does; never invent features or copy personal data), the layout rules (each step gets a box, a number badge and a callout whose arrow points at the box; badges always sit outside the top-left corner of their box and never cover UI elements; a badge with an `anchor` to its box is placed there automatically), and the steps with these tools (open → mask personal data → add box + number badge + anchored callout → preview → save). In Claude Code it appears as `/mcp__harie__harie_guide`. A short version of the same rules is also sent as the server's `instructions`, so clients that read them follow the rules even without the prompt.

### Example prompts

- "Turn `settings.png` into a Harie file, draw a red box around the save button, and add a callout saying 'Click here to save'."
- "List the Harie files in `guides/` and add a title to any that don't have one."

Tool descriptions and the bundled font (Noto Sans JP) are currently Japanese-first, but annotation text can be written in any language the font covers, including English.

## Development

- `src/tools.ts`: tool implementations. `src/server.ts`: MCP registration and input validation. `src/paths.ts`: prevents access outside the root.
- Tests (`pnpm test`) connect a client through the SDK's InMemoryTransport and call the tools for real.
- The package bundles only the Regular / Bold weights of Noto Sans JP (`scripts/copy-assets.mjs`; license in `dist/fonts/OFL.txt`).

## License

MIT. The bundled font (Noto Sans JP Regular / Bold) is licensed under the SIL Open Font License 1.1 (`dist/fonts/OFL.txt`).

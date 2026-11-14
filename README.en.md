<p align="center">
  <img src="docs/brand/harie-symbol.svg" alt="" width="96">
</p>

<h1 align="center">Harie</h1>

<p align="center"><b>Just an image. Editable anytime.</b></p>

<p align="center">English | <a href="README.md">日本語</a></p>

<p align="center">
  <a href="https://harie.studio/en/">Website</a> ·
  <a href="https://harie.studio/app/">Open the web editor</a> ·
  <a href="https://chromewebstore.google.com/detail/harie/dgbghdgnmjcgjdmhfnmcdphkafkbefll?hl=en">Chrome extension</a> ·
  <a href="https://www.npmjs.com/package/@harie/mcp">MCP server</a>
</p>

<p align="center">
  <a href="https://github.com/hosshan/harie/stargazers"><img src="https://img.shields.io/github/stars/hosshan/harie?style=flat&logo=github" alt="GitHub stars"></a>
  <a href="https://chromewebstore.google.com/detail/harie/dgbghdgnmjcgjdmhfnmcdphkafkbefll"><img src="https://img.shields.io/chrome-web-store/users/dgbghdgnmjcgjdmhfnmcdphkafkbefll?label=Chrome%20users" alt="Chrome Web Store users"></a>
  <a href="https://www.npmjs.com/package/@harie/mcp"><img src="https://img.shields.io/npm/dm/@harie/mcp?label=%40harie%2Fmcp" alt="npm downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/hosshan/harie" alt="MIT License"></a>
  <a href="https://github.com/sponsors/hosshan"><img src="https://img.shields.io/github/sponsors/hosshan?label=Sponsors&logo=githubsponsors" alt="GitHub Sponsors"></a>
</p>

An app for adding boxes, arrows and captions to screenshots, for example when writing user guides for web services. Saved files display as ordinary JPEG / PNG images, and opening one in Harie lets you edit the annotations again and again. SVG, WebP, GIF, HEIC and more can be opened too (they are converted to PNG / JPEG when opened; saving is JPEG / PNG only).

![Harie demo. A saved PNG is opened in the web editor, its annotations come back, and only a callout's text is changed before saving again](docs/images/demo.en.gif)

A saved file works as a normal image as is. The image below was saved with Harie too: download it and open it in the [web editor](https://harie.studio/app/) to select and edit its annotations.

<p align="center">
  <img src="apps/site/src/assets/tasklane-notifications.en.harie.png" alt="An image saved with Harie: the notification settings of a fictional service, Tasklane, with numbered steps and captions" width="640">
</p>

- Documentation: [docs/](docs/README.md) (in Japanese)
- Design decisions: [docs/adr/](docs/adr/README.md) (in Japanese)
- For AI agents: [CLAUDE.md](CLAUDE.md)

```sh
pnpm install
pnpm check                      # lint + typecheck + test
pnpm --filter @harie/web dev    # web editor (http://localhost:5173/)
```

The MVP (M0–M5: web editor, Chrome extension, MCP server, AI suggestions and personal-data masking) is implemented. See [local setup](docs/05-development/local-setup.md) for running it locally and the [implementation plan](docs/04-plan/implementation-plan.md) for what comes next (both in Japanese).

The editor UI is available in English, Japanese, Korean, Traditional Chinese, Simplified Chinese, Spanish and Brazilian Portuguese.

## Apps

Usage, installation, local checks and release steps are in each app's README. These READMEs are in Japanese, except the MCP server's.

| App | Description |
|---|---|
| [apps/web](apps/web/README.md) | Web editor (PWA). Open an image, annotate it and save |
| [apps/extension](apps/extension/README.md) | Chrome extension. Capture the current page and annotate it right away |
| [apps/mcp](apps/mcp/README.md) | MCP server (`@harie/mcp` on npm). Read and write annotations from Claude and other clients |
| [apps/skill](apps/skill/README.md) | Claude Skill. Create and edit annotations from claude.ai and cloud sessions where MCP cannot be set up (upload the .skill file, or install as a Claude Code plugin) |
| [apps/cli](apps/cli/README.md) | Development CLI (`pnpm harie`). Inspect, create and re-render files |
| [apps/desktop](apps/desktop/README.md) | Desktop app (Tauri 2, macOS / Windows). Open with the OS dialog and save in place |
| [apps/site](apps/site/README.md) | Landing page (GitHub Pages). The web editor is published alongside it at `/app/` |

## Packages

| Package | Description |
|---|---|
| [packages/model](packages/model/README.md) | Schema and operations for annotation documents |
| [packages/format](packages/format/README.md) | Embedding into and reading from JPEG / PNG |
| [packages/render](packages/render/README.md) | Rendering annotations → SVG → pixels |
| [packages/ai](packages/ai/README.md) | AI annotation suggestions and personal-data detection |
| [packages/editor](packages/editor/README.md) | Editor UI (React) |

## Support Harie

Harie is an MIT-licensed open source project built by one developer. If it helps you, a ★ Star on this repository keeps the project going and helps others find it.

- To support it on an ongoing basis, you can sponsor it through [GitHub Sponsors](https://github.com/sponsors/hosshan).
- Bugs and requests ("I want to make this kind of guide image") are welcome in [Issues](https://github.com/hosshan/harie/issues).
- If you use Harie for your help center or internal guides, I'd love to hear about it.

## License

MIT ([LICENSE](LICENSE)). The bundled font (Noto Sans JP) is under the SIL Open Font License 1.1.

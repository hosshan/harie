// LP の小さな動き: デモ画像の注釈の付け外し、MCP の登録方法のタブ、コマンドのコピー（日本語版・英語版で共通。文言は HTML 側に持つ）

for (const button of document.querySelectorAll(".switch")) {
  const demo = document.getElementById(button.getAttribute("aria-controls"));
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(on));
    demo?.toggleAttribute("data-off", !on);
  });
}

for (const button of document.querySelectorAll(".copy")) {
  const source = document.getElementById(button.dataset.copy);
  const label = button.textContent;
  button.addEventListener("click", async () => {
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source.textContent ?? "");
      button.textContent = button.dataset.copied ?? label;
    } catch {
      // クリップボードが使えないときは、手でコピーできるように選択する
      getSelection()?.selectAllChildren(source);
    }
    setTimeout(() => {
      button.textContent = label;
    }, 2000);
  });
}

for (const list of document.querySelectorAll('[role="tablist"]')) {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls"))?.toggleAttribute("hidden", !on);
    }
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
}

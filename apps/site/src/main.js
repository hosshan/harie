// LP の小さな動き: デモ画像の注釈の付け外しと、コマンドのコピー（日本語版・英語版で共通。文言は HTML 側に持つ）

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

// LP の小さな動き: デモ画像の注釈の付け外しと、コマンドのコピー

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
  button.addEventListener("click", async () => {
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source.textContent ?? "");
      button.textContent = "コピーしました";
    } catch {
      // クリップボードが使えないときは、手でコピーできるように選択する
      getSelection()?.selectAllChildren(source);
    }
    setTimeout(() => {
      button.textContent = "コピー";
    }, 2000);
  });
}

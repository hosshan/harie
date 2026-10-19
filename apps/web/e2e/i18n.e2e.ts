import { expect, test } from "@playwright/test";

test.describe("NFR-I18N-01: 英語のブラウザ", () => {
  test.use({ locale: "en-US" });

  test("初めは英語で表示し、設定で日本語に切り替えると記録して開き直しても日本語のまま", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Open image" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("button", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await dialog.getByRole("button", { name: "日本語" }).click();
    await expect(page.getByRole("dialog", { name: "設定" })).toBeVisible();
    await expect(page.getByRole("button", { name: "画像を開く" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");

    await page.reload();
    await expect(page.getByRole("button", { name: "画像を開く" })).toBeVisible();
  });
});

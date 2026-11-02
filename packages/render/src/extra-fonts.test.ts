import { describe, expect, it } from "vitest";
import { requiredExtraFonts } from "./extra-fonts";

describe("requiredExtraFonts（NFR-I18N-01, ADR-0013）", () => {
  it("日本語・英語・繁體字・スペイン語だけなら補助フォントは要らない", () => {
    expect(requiredExtraFonts("設定を保存 Save ¿Guardar? 設定匯出 ação")).toEqual([]);
  });

  it("ハングルがあれば hangul", () => {
    expect(requiredExtraFonts("설정 저장")).toEqual(["hangul"]);
  });

  it("Noto Sans JP にない簡体字があれば simplified-chinese", () => {
    expect(requiredExtraFonts("导出设置")).toEqual(["simplified-chinese"]);
  });

  it("日本語と共通の漢字だけの簡体字なら要らない", () => {
    expect(requiredExtraFonts("保存")).toEqual([]);
  });

  it("両方あれば両方", () => {
    expect(requiredExtraFonts("한국어 / 简体中文")).toEqual(["hangul", "simplified-chinese"]);
  });
});

describe("textContent（ADR-0013）", async () => {
  const { textContent } = await import("./svg");

  it("日本語・英語だけなら tspan を作らない", () => {
    expect(textContent("設定 <Save>")).toBe("設定 &lt;Save&gt;");
  });

  it("ハングルと簡体字の範囲を補助フォントの tspan で囲む", () => {
    expect(textContent("설정 저장 / 导出")).toBe(
      '<tspan font-family="Noto Sans KR">설정 저장 </tspan>/ <tspan font-family="Noto Sans SC">导</tspan>出',
    );
  });
});

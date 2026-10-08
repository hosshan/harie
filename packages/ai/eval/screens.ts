// 評価用の合成画面。実在の画面・個人情報を使わないよう、Harie の注釈で架空の SaaS 画面を描く（CLAUDE.md）。
// 個人情報は架空の値（example ドメイン、テスト用のカード番号など）で、正解の範囲と種別を一緒に持つ
import {
  type Annotation,
  AnnotationSchema,
  createDocument,
  type HarieDocument,
  type PiiKind,
  type Rect,
} from "@harie/model";
import { annotationBounds } from "@harie/render";

export type Screen = {
  name: string;
  doc: HarieDocument;
  /** 補足の提案で「説明したいこと」として渡す文 */
  intent: string;
  /** 提案が指してほしい UI 要素（どれか 1 つの提案が重なれば当たり） */
  targets: Rect[];
  /** 写っている個人情報（正解） */
  pii: { kind: PiiKind; rect: Rect; text?: string }[];
};

class Builder {
  readonly annotations: Annotation[] = [];
  readonly pii: Screen["pii"] = [];
  private n = 0;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    // 下地の画像を白で覆い、その上に画面を描く
    this.box(0, 0, width, height, "#FFFFFF", "#FFFFFF");
  }

  private add(a: Record<string, unknown>): Annotation {
    const parsed = AnnotationSchema.parse({ id: `e${++this.n}`, ...a });
    this.annotations.push(parsed);
    return parsed;
  }

  box(x: number, y: number, w: number, h: number, fill = "#F5F6F8", stroke = "#D0D5DD"): Rect {
    this.add({ type: "rect", x, y, w, h, style: { fill, stroke, strokeWidth: 1, radius: 6 } });
    return { x, y, w, h };
  }

  text(
    x: number,
    y: number,
    text: string,
    opts: { size?: number; color?: string; bold?: boolean } = {},
  ) {
    return annotationBounds(
      this.add({
        type: "text",
        x,
        y,
        text,
        style: {
          fontSize: opts.size ?? 14,
          color: opts.color ?? "#1C2024",
          fontWeight: opts.bold ? "bold" : "normal",
        },
      }),
    );
  }

  button(x: number, y: number, w: number, label: string, primary = true): Rect {
    const rect = this.box(
      x,
      y,
      w,
      36,
      primary ? "#0B6BCB" : "#FFFFFF",
      primary ? "#0B6BCB" : "#D0D5DD",
    );
    this.text(x + 14, y + 10, label, { color: primary ? "#FFFFFF" : "#1C2024", bold: true });
    return rect;
  }

  secret(kind: PiiKind, x: number, y: number, text: string, size = 14) {
    this.pii.push({ kind, rect: this.text(x, y, text, { size }), text });
  }

  avatar(x: number, y: number, size: number) {
    // 顔の代わりに、顔写真らしい円（頭と肩）を描く
    this.add({
      type: "ellipse",
      x,
      y,
      w: size,
      h: size,
      style: { fill: "#E8D5C4", stroke: "#C9A98E", strokeWidth: 1 },
    });
    this.add({
      type: "ellipse",
      x: x + size * 0.3,
      y: y + size * 0.15,
      w: size * 0.4,
      h: size * 0.45,
      style: { fill: "#8C6A55", stroke: "#8C6A55", strokeWidth: 1 },
    });
    this.pii.push({ kind: "face", rect: { x, y, w: size, h: size } });
  }

  doc(): HarieDocument {
    return {
      ...createDocument({
        width: this.width,
        height: this.height,
        docId: "00000000-0000-4000-8000-000000000000",
        now: new Date("2026-10-08T00:00:00Z"),
      }),
      annotations: this.annotations,
    };
  }
}

function header(b: Builder, title: string) {
  b.box(0, 0, b.width, 56, "#FFFFFF", "#E4E7EC");
  b.text(24, 18, "Sample Cloud", { size: 18, bold: true, color: "#0B6BCB" });
  b.text(220, 20, title, { size: 15 });
}

function sidebar(b: Builder, items: string[]) {
  b.box(0, 56, 200, b.height - 56, "#F9FAFB", "#E4E7EC");
  items.forEach((item, i) => {
    b.text(24, 84 + i * 36, item);
  });
}

function notifications(): Screen {
  const b = new Builder(1280, 800);
  header(b, "設定");
  b.avatar(1040, 10, 36);
  b.secret("name", 1086, 12, "山田 太郎");
  b.secret("email", 1086, 30, "taro.yamada@example.co.jp", 11);
  sidebar(b, ["ホーム", "プロジェクト", "メンバー", "設定"]);
  b.text(240, 84, "通知設定", { size: 22, bold: true });
  const rows = ["コメントされたとき", "担当に指定されたとき", "期限の前日", "週次のまとめ"];
  rows.forEach((label, i) => {
    b.box(240, 132 + i * 64, 720, 52);
    b.text(260, 150 + i * 64, label);
    b.box(880, 146 + i * 64, 44, 24, i % 2 === 0 ? "#30A46C" : "#D0D5DD", "#FFFFFF");
  });
  const save = b.button(240, 412, 140, "変更を保存");
  b.button(396, 412, 120, "キャンセル", false);
  return {
    name: "通知設定",
    doc: b.doc(),
    intent: "通知の受け取り方を変えて保存する方法",
    targets: [save],
    pii: b.pii,
  };
}

function members(): Screen {
  const b = new Builder(1280, 800);
  header(b, "メンバー");
  sidebar(b, ["ホーム", "プロジェクト", "メンバー", "設定"]);
  b.text(240, 84, "メンバー", { size: 22, bold: true });
  const invite = b.button(1080, 80, 160, "メンバーを招待");
  b.box(240, 132, 1000, 40, "#F2F4F7");
  ["氏名", "メールアドレス", "電話番号", "権限"].forEach((h, i) => {
    b.text(260 + i * 260, 144, h, { bold: true });
  });
  const people = [
    ["佐藤 花子", "hanako.sato@example.com", "03-0000-1234", "管理者"],
    ["鈴木 一郎", "ichiro.suzuki@example.com", "090-0000-5678", "編集者"],
    ["高橋 美咲", "misaki.t@example.net", "080-0000-9012", "閲覧者"],
  ] as const;
  people.forEach(([name, email, phone, role], i) => {
    const y = 172 + i * 56;
    b.box(240, y, 1000, 56, "#FFFFFF", "#E4E7EC");
    b.secret("name", 260, y + 20, name);
    b.secret("email", 520, y + 20, email);
    b.secret("phone", 780, y + 20, phone);
    b.text(1040, y + 20, role);
  });
  return {
    name: "メンバー一覧",
    doc: b.doc(),
    intent: "新しいメンバーを招待する方法",
    targets: [invite],
    pii: b.pii,
  };
}

function billing(): Screen {
  const b = new Builder(1024, 768);
  header(b, "お支払い");
  b.text(40, 84, "お支払い情報", { size: 22, bold: true });
  b.box(40, 132, 944, 180);
  b.text(60, 150, "請求先", { bold: true });
  b.secret("name", 60, 180, "株式会社サンプル 経理部 田中 健太");
  b.secret("address", 60, 208, "〒000-0000 東京都架空区見本町 1-2-3");
  b.secret("phone", 60, 236, "TEL 03-0000-0000");
  b.box(40, 336, 944, 120);
  b.text(60, 354, "カード", { bold: true });
  b.secret("id", 60, 384, "4111 1111 1111 1111");
  b.text(60, 412, "有効期限 12/30");
  const change = b.button(824, 392, 140, "カードを変更", false);
  b.button(40, 480, 160, "請求書を表示");
  return {
    name: "お支払い",
    doc: b.doc(),
    intent: "支払いに使うカードを変える方法",
    targets: [change],
    pii: b.pii,
  };
}

function dashboard(): Screen {
  const b = new Builder(1280, 800);
  header(b, "レポート");
  sidebar(b, ["ホーム", "レポート", "設定"]);
  b.text(240, 84, "月次レポート", { size: 22, bold: true });
  ["売上", "新規顧客", "解約率"].forEach((label, i) => {
    b.box(240 + i * 330, 132, 310, 120);
    b.text(260 + i * 330, 150, label);
    b.text(260 + i * 330, 186, ["¥1,234,000", "128 社", "1.8%"][i] as string, {
      size: 28,
      bold: true,
    });
  });
  b.box(240, 276, 1000, 360);
  b.text(260, 296, "推移（サンプルデータ）");
  const csv = b.button(1080, 80, 160, "CSV を書き出す", false);
  return {
    name: "レポート（個人情報なし）",
    doc: b.doc(),
    intent: "レポートを CSV で書き出す方法",
    targets: [csv],
    pii: b.pii,
  };
}

export function screens(): Screen[] {
  return [notifications(), members(), billing(), dashboard()];
}

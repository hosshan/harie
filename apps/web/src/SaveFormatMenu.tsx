// 保存形式（JPEG / PNG）を選ぶメニュー（FR-FILE-01, 02）。ヘッダーの「保存」の左に置き、
// 狭い画面では三点メニューの中に同じ選択肢を出す
import type { ImageFormat } from "@harie/format";
import { Button } from "./components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { HeaderIcon } from "./Header";

const FORMATS: { value: ImageFormat; label: string; note: string }[] = [
  { value: "jpeg", label: "JPEG", note: "ファイルが小さい" },
  { value: "png", label: "PNG", note: "文字がくっきり残る" },
];

export function SaveFormatMenu({
  value,
  onChange,
  disabled,
}: {
  value: ImageFormat;
  onChange: (format: ImageFormat) => void;
  disabled?: boolean;
}) {
  const current = FORMATS.find((f) => f.value === value) ?? FORMATS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button aria-label={`ファイル形式: ${current?.label}`}>
          {current?.label}
          <HeaderIcon icon="chevron" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <SaveFormatMenuItems value={value} onChange={onChange} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 保存形式の選択肢（見出し + ラジオ）。メニューの中に置く */
export function SaveFormatMenuItems({
  value,
  onChange,
  disabled,
}: {
  value: ImageFormat;
  onChange: (format: ImageFormat) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <DropdownMenuLabel>保存形式</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={value}
        onValueChange={(v) => onChange(v === "png" ? "png" : "jpeg")}
      >
        {FORMATS.map((f) => (
          <DropdownMenuRadioItem key={f.value} value={f.value} disabled={disabled}>
            {f.label}
            <span className="text-xs text-muted-foreground">{f.note}</span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

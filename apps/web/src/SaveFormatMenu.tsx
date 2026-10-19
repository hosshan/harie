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
import { useWebMessages, type WebMessages } from "./messages";

const FORMATS: { value: ImageFormat; label: string; note: (m: WebMessages) => string }[] = [
  { value: "jpeg", label: "JPEG", note: (m) => m.save.jpegNote },
  { value: "png", label: "PNG", note: (m) => m.save.pngNote },
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
  const m = useWebMessages();
  const current = FORMATS.find((f) => f.value === value) ?? FORMATS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button aria-label={m.save.formatButton(current?.label ?? "")}>
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
  const m = useWebMessages();
  return (
    <>
      <DropdownMenuLabel>{m.save.format}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={value}
        onValueChange={(v) => onChange(v === "png" ? "png" : "jpeg")}
      >
        {FORMATS.map((f) => (
          <DropdownMenuRadioItem key={f.value} value={f.value} disabled={disabled}>
            {f.label}
            <span className="text-xs text-muted-foreground">{f.note(m)}</span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

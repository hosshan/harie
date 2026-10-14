// shadcn/ui の DropdownMenu（ADR-0010）。使う部品だけを置く
import { DropdownMenu as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-36 overflow-hidden rounded-md border border-input bg-popover p-1 text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      data-slot="dropdown-menu-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <Primitive.ItemIndicator>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Primitive.ItemIndicator>
      </span>
      {children}
    </Primitive.RadioItem>
  );
}

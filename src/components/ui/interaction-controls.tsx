"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Download, MoreHorizontal, ChevronDown, type LucideIcon } from "lucide-react";

type Choice<T extends string> = { value: T; label: string; icon?: LucideIcon; disabled?: boolean };

/** Icon-only controls always expose a text name and a 44px touch target. */
export function IconButton({ label, icon: Icon, className = "", pressed, ...props }: {
  label: string; icon: LucideIcon; pressed?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "aria-pressed" | "children" | "type">) {
  return <button type="button" aria-label={label} title={label} aria-pressed={pressed}
    className={`v4-icon-button ${className}`} {...props}><Icon size={19} aria-hidden="true" /></button>;
}

export function StatusBadge({ children, tone = "neutral" }: {
  children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return <span className={`v4-status-badge is-${tone}`}>{children}</span>;
}

/** Convert a collapsible desktop filter panel into an accessible modal sheet on mobile. */
export function useMobileFilterSheet({ open, onClose, triggerRef, sheetRef, closeRef }: {
  open: boolean; onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  sheetRef: RefObject<HTMLFormElement | null>;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )).filter(el => el.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sheetRef.current.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sheetRef.current.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keyDown);
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keyDown); trigger?.focus(); };
  }, [open, mobile, onClose, triggerRef, sheetRef, closeRef]);
  return mobile;
}

/** Roving focus for both tablists and radio-style segmented controls. */
export function nextSelectableIndex<T extends string>(options: readonly Choice<T>[], index: number, key: string) {
  if (!options.length) return index;
  const delta = key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;
  if (!delta && key !== "Home" && key !== "End") return index;
  const step = key === "End" ? -1 : delta || 1;
  let candidate = key === "Home" ? 0 : key === "End" ? options.length - 1 : (index + step + options.length) % options.length;
  for (let count = 0; count < options.length; count++) {
    if (!options[candidate].disabled) return candidate;
    candidate = (candidate + step + options.length) % options.length;
  }
  return index;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange, disabled = false, className = "" }: {
  label: string; options: readonly Choice<T>[]; value: T; onChange: (value: T) => void; disabled?: boolean; className?: string;
}) {
  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (disabled) return;
    const next = nextSelectableIndex(options, index, event.key);
    if (next !== index && options[next] && !options[next].disabled) {
      onChange(options[next].value);
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
    }
  };
  return <div className={`v4-segmented ${className}`} role="radiogroup" aria-label={label}>
    {options.map((choice, index) => {
      const Icon = choice.icon;
      return <button key={choice.value} role="radio" aria-checked={value === choice.value} tabIndex={value === choice.value ? 0 : -1}
        type="button" disabled={disabled || choice.disabled} onClick={() => onChange(choice.value)} onKeyDown={e => handleKey(e, index)}>
        {Icon && <Icon size={16} aria-hidden="true" />}{choice.label}
      </button>;
    })}
  </div>;
}

export function ContentTabs<T extends string>({ idBase, label, options, value, onChange }: {
  idBase: string; label: string; options: readonly Choice<T>[]; value: T; onChange: (value: T) => void;
}) {
  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    const next = nextSelectableIndex(options, index, event.key);
    event.preventDefault(); onChange(options[next].value);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  return <><div role="tablist" aria-label={label} className="v4-tablist">
    {options.map((option, index) => <button key={option.value} id={`${idBase}-tab-${option.value}`} type="button" role="tab"
      aria-controls={`${idBase}-panel-${option.value}`} aria-selected={value === option.value} tabIndex={value === option.value ? 0 : -1}
      disabled={option.disabled} onKeyDown={e => handleKey(e, index)} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>{options.filter(option => option.value !== value).map(option => <div key={option.value}
    id={`${idBase}-panel-${option.value}`} role="tabpanel" aria-labelledby={`${idBase}-tab-${option.value}`} hidden />)}</>;
}

export type MenuAction = { label: string; icon?: LucideIcon; onSelect?: () => void; href?: string; disabled?: boolean; danger?: boolean };

export function ActionMenu({ label = "Thao tác khác", items, icon: Icon = MoreHorizontal, prominent = false, disabled = false }: {
  label?: string; items: MenuAction[]; icon?: LucideIcon; prominent?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) {
      const menuHeight = Math.min(380, window.innerHeight * .7, items.length * 46 + 12);
      const below = window.innerHeight - rect.bottom;
      const top = below >= menuHeight + 8 ? rect.bottom + 6 : Math.max(8, rect.top - menuHeight - 6);
      setPosition({ top: Math.min(top, Math.max(8, window.innerHeight - menuHeight - 8)),
        left: Math.max(8, Math.min(rect.right - 224, window.innerWidth - 232)) });
    }
    const frame = requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus());
    const outside = (event: PointerEvent) => {
      if (!list.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Node && list.current?.contains(event.target)) return;
      setOpen(false); trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", closeOnScroll);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", closeOnScroll); window.removeEventListener("scroll", closeOnScroll, true); };
  }, [open, items.length]);

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); return; }
    if (event.key === "Tab") {
      // The popup lives in a portal. Without this, Tab jumps to the end of the
      // document rather than continuing from the trigger in the page.
      event.preventDefault();
      const focusable = Array.from(document.querySelectorAll<HTMLElement>(
        'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
      )).filter(node => !list.current?.contains(node) && node.tabIndex >= 0 && node.getClientRects().length > 0);
      const current = focusable.indexOf(trigger.current as HTMLElement);
      const direction = event.shiftKey ? -1 : 1;
      const target = current >= 0 && focusable.length
        ? focusable[(current + direction + focusable.length) % focusable.length] : trigger.current;
      setOpen(false);
      target?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nodes = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    if (!nodes.length) return;
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length;
    nodes[next]?.focus();
  };

  return <>
    <button ref={trigger} type="button" disabled={disabled || !items.some(item => !item.disabled)} className={prominent ? "v4-menu-trigger v4-menu-trigger-labeled" : "v4-menu-trigger"}
      aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} title={label}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } else if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); } }}
      onClick={() => setOpen(wasOpen => !wasOpen)}><Icon size={18} aria-hidden="true" />{prominent && <>{label}<ChevronDown size={15} aria-hidden="true" /></>}</button>
    {open && typeof document !== "undefined" && createPortal(<div ref={list} id={menuId} className="v4-action-menu" role="menu" aria-label={label}
      style={{ top: position.top, left: position.left }} onKeyDown={keyDown}>
      {items.map((item, index) => {
        const ItemIcon = item.icon;
        const inner: ReactNode = <>{ItemIcon && <ItemIcon size={16} aria-hidden="true" />}{item.label}</>;
        const itemClass = `v4-menu-item${item.danger ? " is-danger" : ""}`;
        return item.href && !item.disabled ? <a key={index} role="menuitem" className={itemClass} href={item.href}
          onClick={() => setOpen(false)}>{inner}</a> : <button key={index} role="menuitem" type="button" className={itemClass}
          disabled={item.disabled} aria-disabled={item.disabled || undefined} onClick={() => { setOpen(false); item.onSelect?.(); trigger.current?.focus(); }}>{inner}</button>;
      })}
    </div>, document.body)}
  </>;
}

export function ExportMenu({ items }: { items: { label: string; href: string }[] }) {
  return <ActionMenu label="Xuất dữ liệu" icon={Download} prominent items={items} />;
}

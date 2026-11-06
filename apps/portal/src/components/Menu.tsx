import { type ReactNode, useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { ChevronIcon } from "./icons";

/**
 * A small dropdown built on <details>: keyboard and screen-reader support come
 * from the browser. It closes when you pick something, click elsewhere, or
 * navigate.
 */
export function Menu({
  label,
  ariaLabel,
  tooltip,
  buttonClass,
  showChevron,
  alignRight,
  children,
}: {
  label: ReactNode;
  ariaLabel?: string;
  tooltip?: string;
  buttonClass?: string;
  showChevron?: boolean;
  alignRight?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const location = useLocation();
  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: close on every navigation.
  useEffect(close, [location]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) {
        ref.current.open = false;
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <details className="menu" ref={ref}>
      <summary className={buttonClass} aria-label={ariaLabel} data-tooltip={tooltip}>
        {label}
        {showChevron && <ChevronIcon />}
      </summary>
      {/* Picking an option (a button that doesn't navigate) closes the menu too. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: a bubbled click from the buttons inside, which are keyboard-operable themselves. */}
      <div
        className={alignRight ? "menu-list align-right" : "menu-list"}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) close();
        }}
      >
        {children}
      </div>
    </details>
  );
}

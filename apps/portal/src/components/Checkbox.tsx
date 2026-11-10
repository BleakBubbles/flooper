import { useEffect, useRef } from "react";

/**
 * A checkbox for selecting notes. `mixed` shows the in-between state (some
 * selected); `onToggle` gets whether Shift was held, for selecting a range.
 */
export function Checkbox({
  checked,
  mixed = false,
  label,
  className = "",
  onToggle,
}: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  className?: string;
  onToggle: (shift: boolean) => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = mixed && !checked;
  }, [mixed, checked]);
  return (
    <input
      ref={box}
      type="checkbox"
      className={`select-box ${className}`}
      aria-label={label}
      checked={checked}
      // Changes come through onClick, which knows about Shift; React wants a handler.
      onChange={() => {}}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(event.shiftKey);
      }}
    />
  );
}

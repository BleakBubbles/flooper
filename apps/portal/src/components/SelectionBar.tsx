import type { ReactNode } from "react";
import { Checkbox } from "./Checkbox";
import {
  ArchiveIcon,
  CheckIcon,
  MailIcon,
  MailOpenIcon,
  RestoreIcon,
  TrashIcon,
  XIcon,
} from "./icons";

/**
 * The list's title bar while notes are selected: how many, a box to select
 * all or none, then what to do with them. In "Recently deleted", restore or
 * delete for good instead.
 */
export function SelectionBar({
  count,
  all,
  deletedView,
  onSelectAll,
  onClear,
  onRead,
  onUnread,
  onDone,
  onArchive,
  onDelete,
  onRestore,
  onDeleteForever,
}: {
  count: number;
  /** Every note in the list is selected. */
  all: boolean;
  deletedView: boolean;
  onSelectAll: (on: boolean) => void;
  onClear: () => void;
  onRead: () => void;
  onUnread: () => void;
  onDone: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onDeleteForever: () => void;
}) {
  return (
    <div className="notes-bar selection-bar">
      <Checkbox
        checked={all}
        mixed={!all}
        label={all ? "Select none" : "Select all"}
        onToggle={() => onSelectAll(!all)}
      />
      <h2 id="notes-heading" className="notes-title selection-count" aria-live="polite">
        {count} selected
      </h2>
      <span className="selection-actions">
        {deletedView ? (
          <>
            <Action label="Restore" onClick={onRestore}>
              <RestoreIcon />
            </Action>
            <Action label="Delete forever" onClick={onDeleteForever}>
              <TrashIcon />
            </Action>
          </>
        ) : (
          <>
            <Action label="Mark as read" onClick={onRead}>
              <MailOpenIcon />
            </Action>
            <Action label="Mark as unread" onClick={onUnread}>
              <MailIcon />
            </Action>
            <Action label="Mark done" onClick={onDone}>
              <CheckIcon />
            </Action>
            <Action label="Archive" onClick={onArchive}>
              <ArchiveIcon />
            </Action>
            <Action label="Delete" onClick={onDelete}>
              <TrashIcon />
            </Action>
          </>
        )}
      </span>
      <span className="notes-bar-end">
        <Action label="Clear selection" onClick={onClear}>
          <XIcon />
        </Action>
      </span>
    </div>
  );
}

function Action({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      data-tooltip={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

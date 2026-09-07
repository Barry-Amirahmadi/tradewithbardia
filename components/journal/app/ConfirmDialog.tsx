"use client";

import { useEffect, useRef } from "react";

/**
 * DESTRUCTIVE ACTION CONFIRMATION — master prompt §26, §38.
 *
 * Built on the native `<dialog>` element rather than a div with
 * `role="dialog"`. `showModal()` gives focus trapping, Escape-to-dismiss,
 * inertness of the page behind it and the top layer for free — all things a
 * hand-rolled modal gets subtly wrong, and all things §38 requires.
 *
 * §26 asks that the consequence be clear before the action, not after. So the
 * body text says what is actually lost and that it cannot be undone, and the
 * confirm button names the act — "Delete permanently", never "OK". A button
 * labelled OK asks the user to remember what they clicked on.
 *
 * The cancel action is the default focus. If someone dismisses this dialog by
 * reflex, nothing should be destroyed.
 */

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="jdialog"
      aria-labelledby="jdialog-title"
      aria-describedby="jdialog-body"
      // Escape and the backdrop both mean "no". `cancel` fires for Escape,
      // `close` for anything else that closes it — both route to onCancel so
      // the parent's state cannot drift out of sync with the element's.
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
    >
      <h2 id="jdialog-title" className="type-h3">{title}</h2>
      <p id="jdialog-body" className="text-secondary">{body}</p>
      <div className="jdialog-actions">
        <button type="button" className="btn btn-ghost" ref={cancelRef} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="btn btn-destructive" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

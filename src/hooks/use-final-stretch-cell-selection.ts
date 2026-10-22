"use client";

import {
  applyFinalStretchPaste,
  clearFinalStretchSelection,
  FINAL_STRETCH_PASTE_FIELDS,
  finalStretchSelectionToText,
  getFinalStretchSelectionBounds,
  isFinalStretchGridPaste,
  isFinalStretchPasteField,
  parsePastedFinalStretchGrid,
  type FinalStretchCellRef,
  type FinalStretchPasteField,
} from "@/lib/final-stretch-paste";
import type { FinalStretchRowData } from "@/lib/final-stretch-types";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

const SELECTING_CLASS = "final-stretch-cell-selecting";

type CellSelection = {
  anchor: FinalStretchCellRef;
  focus: FinalStretchCellRef;
};

type CellDrag = {
  pointerId: number;
  anchor: FinalStretchCellRef;
  focus: FinalStretchCellRef;
  /** 別セルへ入った、または Shift で範囲にした */
  moved: boolean;
  rangeActive: boolean;
};

type Options = {
  editable: boolean;
  rows: FinalStretchRowData[];
  onRowsChange?: (rows: FinalStretchRowData[]) => void;
  tableRef: RefObject<HTMLTableElement | null>;
};

function readCell(element: Element | null): FinalStretchCellRef | null {
  const cell = element?.closest<HTMLElement>("[data-row-id][data-field]");
  if (!cell) return null;
  const rowId = cell.dataset.rowId;
  const field = cell.dataset.field;
  if (!rowId || !isFinalStretchPasteField(field)) return null;
  return { rowId, field };
}

function isGridClipboardTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement &&
    target.dataset.finalStretchClipboard === "true"
  );
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (isGridClipboardTarget(target)) return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  );
}

export function useFinalStretchCellSelection({
  editable,
  rows,
  onRowsChange,
  tableRef,
}: Options) {
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [cellDragActive, setCellDragActive] = useState(false);
  const selectionRef = useRef<CellSelection | null>(null);
  const rowsRef = useRef(rows);
  const onRowsChangeRef = useRef(onRowsChange);
  const rangeLockRef = useRef(false);
  const stopDragListenersRef = useRef<(() => void) | null>(null);
  const clipboardRef = useRef<HTMLTextAreaElement | null>(null);

  selectionRef.current = selection;
  rowsRef.current = rows;
  onRowsChangeRef.current = onRowsChange;

  const selectedKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!selection) return keys;
    const bounds = getFinalStretchSelectionBounds(
      rows,
      selection.anchor,
      selection.focus,
    );
    if (!bounds) return keys;
    for (let rowIndex = bounds.rowStart; rowIndex <= bounds.rowEnd; rowIndex += 1) {
      const rowId = bounds.flat[rowIndex]?.id;
      if (!rowId) continue;
      for (
        let fieldIndex = bounds.fieldStart;
        fieldIndex <= bounds.fieldEnd;
        fieldIndex += 1
      ) {
        keys.add(`${rowId}:${FINAL_STRETCH_PASTE_FIELDS[fieldIndex]}`);
      }
    }
    return keys;
  }, [rows, selection]);

  useEffect(() => {
    return () => {
      stopDragListenersRef.current?.();
      document.documentElement.classList.remove(SELECTING_CLASS);
      clipboardRef.current?.remove();
      clipboardRef.current = null;
    };
  }, []);

  const ensureClipboard = (text: string, focus: boolean) => {
    let area = clipboardRef.current;
    if (!area) {
      area = document.createElement("textarea");
      area.dataset.finalStretchClipboard = "true";
      area.tabIndex = -1;
      area.style.position = "fixed";
      area.style.left = "0";
      area.style.top = "0";
      area.style.width = "1px";
      area.style.height = "1px";
      area.style.opacity = "0";
      area.style.padding = "0";
      area.style.border = "0";
      area.style.pointerEvents = "none";
      document.body.appendChild(area);
      clipboardRef.current = area;
    }
    area.value = text;
    if (!focus) return;
    area.focus({ preventScroll: true });
    area.select();
  };

  useEffect(() => {
    if (!selection) {
      clipboardRef.current?.remove();
      clipboardRef.current = null;
      return;
    }
    if (cellDragActive) return;

    const text =
      finalStretchSelectionToText(rows, selection.anchor, selection.focus) ?? "";
    const active = document.activeElement;
    const area = clipboardRef.current;
    const shouldFocus =
      active === area ||
      active === tableRef.current ||
      active === document.body ||
      active === document.documentElement ||
      active == null;
    ensureClipboard(text, shouldFocus);
  }, [cellDragActive, rows, selection, tableRef]);

  useEffect(() => {
    const current = selectionRef.current;
    if (!current) return;
    if (!getFinalStretchSelectionBounds(rows, current.anchor, current.focus)) {
      selectionRef.current = null;
      setSelection(null);
    }
  }, [rows]);

  useEffect(() => {
    if (!editable || !selection) return;

    const shouldHandle = (target: EventTarget | null) => {
      if (isGridClipboardTarget(target)) return true;
      if (isTextEditingTarget(target)) return false;
      if (!(target instanceof Node)) return false;
      if (target === document.body || target === document.documentElement) {
        return true;
      }
      return tableRef.current?.contains(target) ?? false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const currentSelection = selectionRef.current;
      if (!currentSelection || !shouldHandle(event.target)) return;

      if (event.key === "Escape") {
        selectionRef.current = null;
        setSelection(null);
        return;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "c"
      ) {
        clipboardRef.current?.focus({ preventScroll: true });
        clipboardRef.current?.select();
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const applyRows = onRowsChangeRef.current;
      if (!applyRows) return;
      const next = clearFinalStretchSelection(
        rowsRef.current,
        currentSelection.anchor,
        currentSelection.focus,
      );
      if (!next) return;
      event.preventDefault();
      applyRows(next);
    };

    const onPaste = (event: ClipboardEvent) => {
      const currentSelection = selectionRef.current;
      const applyRows = onRowsChangeRef.current;
      if (!currentSelection || !applyRows || !shouldHandle(event.target)) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      const grid = isFinalStretchGridPaste(text)
        ? parsePastedFinalStretchGrid(text)
        : [[text]];
      if (grid.length === 0) return;
      event.preventDefault();
      applyRows(
        applyFinalStretchPaste(
          rowsRef.current,
          currentSelection.anchor.rowId,
          currentSelection.anchor.field,
          grid,
        ),
      );
    };

    const onPointerDownOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".final-stretch-grid")) return;
      selectionRef.current = null;
      setSelection(null);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    window.addEventListener("pointerdown", onPointerDownOutside);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("pointerdown", onPointerDownOutside);
    };
  }, [editable, selection, tableRef]);

  const startCellPointerDown = (event: ReactPointerEvent<HTMLTableCellElement>) => {
    if (!editable || event.button !== 0) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        ".final-stretch-row-delete, .final-stretch-month-add-btn, .final-stretch-col-resize",
      )
    ) {
      return;
    }

    const origin = event.target instanceof Element ? event.target : null;
    const cell = readCell(origin) ?? readCell(event.currentTarget);
    if (!cell) return;

    stopDragListenersRef.current?.();
    stopDragListenersRef.current = null;

    const anchor =
      event.shiftKey && selectionRef.current
        ? selectionRef.current.anchor
        : cell;

    if (event.shiftKey) {
      event.preventDefault();
      const next = { anchor, focus: cell };
      selectionRef.current = next;
      setSelection(next);
    } else if (selectionRef.current) {
      selectionRef.current = null;
      setSelection(null);
    }

    const drag: CellDrag = {
      pointerId: event.pointerId,
      anchor,
      focus: cell,
      moved: event.shiftKey,
      rangeActive: false,
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== drag.pointerId) return;
      const hit = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const nextCell =
        hit instanceof Element && tableRef.current?.contains(hit)
          ? readCell(hit)
          : null;
      if (!nextCell) return;
      if (
        nextCell.rowId === drag.focus.rowId &&
        nextCell.field === drag.focus.field
      ) {
        return;
      }

      const crossed =
        nextCell.rowId !== drag.anchor.rowId ||
        nextCell.field !== drag.anchor.field;
      if (!drag.moved && !crossed) return;

      if (!drag.rangeActive) {
        drag.rangeActive = true;
        drag.moved = true;
        setCellDragActive(true);
        document.documentElement.classList.add(SELECTING_CLASS);
        window.getSelection()?.removeAllRanges();
        const active = document.activeElement;
        if (active instanceof HTMLElement && active !== tableRef.current) {
          active.blur();
        }
        try {
          tableRef.current?.setPointerCapture(moveEvent.pointerId);
        } catch {
          // window の pointermove で追従する
        }
      }

      drag.focus = nextCell;
      const next = { anchor: drag.anchor, focus: nextCell };
      selectionRef.current = next;
      setSelection(next);
      moveEvent.preventDefault();
    };

    const finish = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== drag.pointerId) return;
      stopDragListenersRef.current?.();
      stopDragListenersRef.current = null;
      setCellDragActive(false);
      document.documentElement.classList.remove(SELECTING_CLASS);
      if (!drag.moved) return;

      window.getSelection()?.removeAllRanges();
      rangeLockRef.current = true;
      const swallowClick = (clickEvent: MouseEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        window.removeEventListener("click", swallowClick, true);
      };
      window.addEventListener("click", swallowClick, true);
      window.setTimeout(() => {
        window.removeEventListener("click", swallowClick, true);
      }, 0);
      const current = selectionRef.current;
      if (current) {
        const text =
          finalStretchSelectionToText(
            rowsRef.current,
            current.anchor,
            current.focus,
          ) ?? "";
        ensureClipboard(text, true);
      }
      requestAnimationFrame(() => {
        rangeLockRef.current = false;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    stopDragListenersRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  };

  const guardRangeFocus = (event: ReactFocusEvent<HTMLInputElement>) => {
    if (!rangeLockRef.current) return;
    event.currentTarget.blur();
    const area = clipboardRef.current;
    if (area) {
      area.focus({ preventScroll: true });
      area.select();
      return;
    }
    tableRef.current?.focus({ preventScroll: true });
  };

  const isCellSelected = (rowId: string, field: FinalStretchPasteField) =>
    selectedKeys.has(`${rowId}:${field}`);

  const isCellActive = (rowId: string, field: FinalStretchPasteField) =>
    selection?.anchor.rowId === rowId &&
    selection.anchor.field === field &&
    selectedKeys.has(`${rowId}:${field}`);

  return {
    cellDragActive,
    hasCellSelection: selection !== null,
    isCellSelected,
    isCellActive,
    startCellPointerDown,
    guardRangeFocus,
  };
}

/** Undo / Redo snapshot history stack. */
export class HistoryStack {
  constructor(limit = 50) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  push(snapshot) {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo(currentSnapshot) {
    if (!this.canUndo()) return null;
    this.redoStack.push(currentSnapshot);
    return this.undoStack.pop();
  }

  redo(currentSnapshot) {
    if (!this.canRedo()) return null;
    this.undoStack.push(currentSnapshot);
    return this.redoStack.pop();
  }
}

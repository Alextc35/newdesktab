/** Returns the application effects required for one immutable state change. */
export function detectApplicationChanges(state, previousState) {
  const settings = state.data.settings !== previousState.data.settings;
  const bookmarks = state.data.bookmarks !== previousState.data.bookmarks;
  const folders = state.data.folders !== previousState.data.folders;
  const widgets = state.data.widgets !== previousState.data.widgets;
  const recycleBin = state.data.recycleBin !== previousState.data.recycleBin
    || state.data.trash !== previousState.data.trash;
  const editing = state.ui.isEditing !== previousState.ui.isEditing;

  return Object.freeze({
    settings,
    bookmarks,
    folders,
    widgets,
    recycleBin,
    editing,
    grid: settings || bookmarks || folders || widgets || recycleBin
  });
}

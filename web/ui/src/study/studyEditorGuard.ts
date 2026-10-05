/** The mounted editor decides whether a destructive navigation can leave its draft. */
export function canLeaveStudyEditor(): boolean {
  return window.dispatchEvent(new Event('nooks:leave-study-editor', { cancelable: true }));
}

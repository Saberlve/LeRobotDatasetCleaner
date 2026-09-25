/** Buttons intentionally aren't text entry: in video overlays Space always
 * toggles playback, even if focus remained on Enlarge or Close. */
export function isVideoTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest(
      'input,textarea,select,[contenteditable="true"],[role="textbox"]',
    )
  );
}

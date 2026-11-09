/** Editors may cancel navigation while saving or ask before discarding a draft. */
export function allowNavigation():boolean {
  return window.dispatchEvent(new Event('jigsaw:before-navigate',{cancelable:true}));
}

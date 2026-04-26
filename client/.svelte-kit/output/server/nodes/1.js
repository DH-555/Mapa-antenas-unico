

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.xAXwpbaF.js","_app/immutable/chunks/C5jIMMia.js","_app/immutable/chunks/CncBNYTF.js","_app/immutable/chunks/DXLwiZ0H.js"];
export const stylesheets = [];
export const fonts = [];

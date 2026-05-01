

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const imports = ["_app/immutable/nodes/0.7Kb4VmB3.js","_app/immutable/chunks/DXwb0rUS.js","_app/immutable/chunks/DXLwiZ0H.js","_app/immutable/chunks/CSi-e-Ov.js"];
export const stylesheets = ["_app/immutable/assets/0.Dx4GCihE.css"];
export const fonts = [];

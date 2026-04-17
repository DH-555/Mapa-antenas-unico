

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/estadisticas/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/3.BH21NL66.js","_app/immutable/chunks/DXwb0rUS.js","_app/immutable/chunks/CioD0yWc.js","_app/immutable/chunks/DNSQyzL5.js","_app/immutable/chunks/DXLwiZ0H.js","_app/immutable/chunks/CSi-e-Ov.js"];
export const stylesheets = ["_app/immutable/assets/3.DUoLXBjW.css"];
export const fonts = [];

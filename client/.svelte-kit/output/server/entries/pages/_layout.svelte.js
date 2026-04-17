import { s as slot } from "../../chunks/dev.js";
//#region src/routes/+layout.svelte
function _layout($$renderer, $$props) {
	$$renderer.push(`<!--[-->`);
	slot($$renderer, $$props, "default", {}, null);
	$$renderer.push(`<!--]-->`);
}
//#endregion
export { _layout as default };

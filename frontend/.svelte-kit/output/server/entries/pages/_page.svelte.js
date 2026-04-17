import "../../chunks/environment.js";
import { L as attr, R as escape_html, a as ensure_array_like, n as attr_class } from "../../chunks/dev.js";
import "../../chunks/navigation.js";
import "maplibre-gl";
//#region src/routes/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let filteredAntenas = [];
		let phaseOptions = [];
		let operatorOptions = [];
		let selectedPhases = [];
		let selectedOperators = [];
		let idQuery = "";
		let isFilterPanelOpen = false;
		$: filteredAntenas.length;
		$$renderer.push(`<main class="svelte-1uha8ag"><div class="map-container svelte-1uha8ag"></div> <section class="panel"><h1>Mapa de antenas plan único</h1> `);
		$$renderer.push("<!--[0-->");
		$$renderer.push(`<p>Cargando datos...</p>`);
		$$renderer.push(`<!--]--></section> <aside${attr_class("filters-panel svelte-1uha8ag", void 0, { "open": isFilterPanelOpen })}><div class="filters-header svelte-1uha8ag"><h2 class="svelte-1uha8ag">Filtros</h2> <div class="filters-header-actions svelte-1uha8ag"><button type="button" class="svelte-1uha8ag">Reset</button> <button class="close-button svelte-1uha8ag" type="button">×</button></div></div> <section class="svelte-1uha8ag"><h3 class="svelte-1uha8ag">Buscar por ID</h3> <input class="search-input svelte-1uha8ag" type="text" inputmode="numeric" placeholder="Ej: 120"${attr("value", idQuery)}/></section> <section class="svelte-1uha8ag"><h3 class="svelte-1uha8ag">Fase</h3> <!--[-->`);
		const each_array = ensure_array_like(phaseOptions);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let phase = each_array[$$index];
			$$renderer.push(`<label class="svelte-1uha8ag"><input type="checkbox"${attr("value", phase)}${attr("checked", selectedPhases.includes(phase), true)}/> <span>${escape_html(phase)}</span></label>`);
		}
		$$renderer.push(`<!--]--></section> <section class="svelte-1uha8ag"><h3 class="svelte-1uha8ag">Operador</h3> <div class="operators-list svelte-1uha8ag"><!--[-->`);
		const each_array_1 = ensure_array_like(operatorOptions);
		for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
			let operator = each_array_1[$$index_1];
			$$renderer.push(`<label class="svelte-1uha8ag"><input type="checkbox"${attr("value", operator)}${attr("checked", selectedOperators.includes(operator), true)}/> <span>${escape_html(operator)}</span></label>`);
		}
		$$renderer.push(`<!--]--></div></section> <section class="svelte-1uha8ag"><button class="stats-link-button svelte-1uha8ag" type="button">Ir a estadísticas</button></section></aside></main> <button${attr_class("btn-filtros svelte-1uha8ag", void 0, { "hidden": isFilterPanelOpen })}>Filtros</button>`);
	});
}
//#endregion
export { _page as default };

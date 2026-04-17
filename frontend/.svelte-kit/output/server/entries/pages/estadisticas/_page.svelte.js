import "../../../chunks/environment.js";
import "../../../chunks/dev.js";
import "../../../chunks/navigation.js";
//#region src/routes/estadisticas/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let getSelectedRegions, statsSeries;
		let allAntenas = [];
		let provinceOptions = [];
		let selectedProvinces = [];
		let selectedCommunities = [];
		let filterMode = "province";
		const provinciaToCommunity = {
			"Álava": "País Vasco",
			"Albacete": "Castilla-La Mancha",
			"Alicante": "Comunitat Valenciana",
			"Almería": "Andalucía",
			"Ávila": "Castilla y León",
			"Badajoz": "Extremadura",
			"Barcelona": "Cataluña",
			"Burgos": "Castilla y León",
			"Cáceres": "Extremadura",
			"Cádiz": "Andalucía",
			"Cantabria": "Cantabria",
			"Castellón": "Comunitat Valenciana",
			"Ciudad Real": "Castilla-La Mancha",
			"Córdoba": "Andalucía",
			"Cuenca": "Castilla-La Mancha",
			"Girona": "Cataluña",
			"Granada": "Andalucía",
			"Guadalajara": "Castilla-La Mancha",
			"Guipúzcoa": "País Vasco",
			"Huelva": "Andalucía",
			"Huesca": "Aragón",
			"Jaén": "Andalucía",
			"La Coruña": "Galicia",
			"La Rioja": "La Rioja",
			"Las Palmas de Gran Canaria": "Canarias",
			"León": "Castilla y León",
			"Lleida": "Cataluña",
			"Lugo": "Galicia",
			"Madrid": "Comunidad de Madrid",
			"Málaga": "Andalucía",
			"Murcia": "Región de Murcia",
			"Navarra": "Navarra",
			"Ourense": "Galicia",
			"Palencia": "Castilla y León",
			"Palmas": "Canarias",
			"Pontevedra": "Galicia",
			"Salamanca": "Castilla y León",
			"Santa Cruz de Tenerife": "Canarias",
			"Segovia": "Castilla y León",
			"Sevilla": "Andalucía",
			"Soria": "Castilla y León",
			"Tarragona": "Cataluña",
			"Tenerife": "Canarias",
			"Teruel": "Aragón",
			"Toledo": "Castilla-La Mancha",
			"Valencia": "Comunitat Valenciana",
			"Valladolid": "Castilla y León",
			"Vizcaya": "País Vasco",
			"Zamora": "Castilla y León",
			"Zaragoza": "Aragón"
		};
		$: getSelectedRegions = () => {
			if (filterMode === "province") return selectedProvinces;
			return selectedCommunities.length > 0 ? provinceOptions.filter((p) => {
				const community = provinciaToCommunity[p] || p;
				return selectedCommunities.includes(community);
			}) : provinceOptions;
		};
		$: statsSeries = (() => {
			const regions = getSelectedRegions();
			const filtered = regions.length === 0 ? allAntenas : allAntenas.filter((antena) => regions.includes(antena.provincia));
			const counts = /* @__PURE__ */ new Map();
			filtered.forEach((antena) => {
				counts.set(antena.operador, (counts.get(antena.operador) ?? 0) + 1);
			});
			return [...counts.entries()].map(([label, value]) => ({
				label,
				value
			})).sort((a, b) => b.value - a.value);
		})();
		$: statsSeries.reduce((sum, item) => sum + item.value, 0);
		$$renderer.push(`<main class="svelte-1iknb9c"><div class="stats-page svelte-1iknb9c"><div class="stats-header svelte-1iknb9c"><h1 class="svelte-1iknb9c">Estadísticas</h1> <button type="button" class="svelte-1iknb9c">Volver al mapa</button></div> `);
		$$renderer.push("<!--[0-->");
		$$renderer.push(`<p>Cargando datos...</p>`);
		$$renderer.push(`<!--]--></div></main>`);
	});
}
//#endregion
export { _page as default };

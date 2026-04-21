import "../../../chunks/environment.js";
import "../../../chunks/dev.js";
import "../../../chunks/navigation.js";
//#region src/routes/estadisticas/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let getSelectedRegions, filteredAntenasByRegion, statsSeries, declaredStatsSeries, declaredTotals, latestHistoryRun;
		let allAntenas = [];
		let declarationHistory = null;
		let provinceOptions = [];
		let selectedProvinces = [];
		let selectedCommunities = [];
		let filterMode = "province";
		const provinciaToCommunity = {
			alava: "País Vasco",
			"araba alava": "País Vasco",
			albacete: "Castilla-La Mancha",
			alicante: "Comunitat Valenciana",
			"alicante alacant": "Comunitat Valenciana",
			almeria: "Andalucía",
			asturias: "Asturias",
			avila: "Castilla y León",
			badajoz: "Extremadura",
			"balears illes": "Balears, Illes",
			barcelona: "Cataluña",
			bizkaia: "País Vasco",
			burgos: "Castilla y León",
			caceres: "Extremadura",
			cadiz: "Andalucía",
			cantabria: "Cantabria",
			castellon: "Comunitat Valenciana",
			"castellon castello": "Comunitat Valenciana",
			"ciudad real": "Castilla-La Mancha",
			cordoba: "Andalucía",
			cuenca: "Castilla-La Mancha",
			coruna: "Galicia",
			"coruna a": "Galicia",
			"a coruna": "Galicia",
			girona: "Cataluña",
			granada: "Andalucía",
			guadalajara: "Castilla-La Mancha",
			gipuzkoa: "País Vasco",
			guipuzcoa: "País Vasco",
			huelva: "Andalucía",
			huesca: "Aragón",
			jaen: "Andalucía",
			leon: "Castilla y León",
			lleida: "Cataluña",
			lugo: "Galicia",
			madrid: "Comunidad de Madrid",
			malaga: "Andalucía",
			murcia: "Región de Murcia",
			navarra: "Navarra",
			ourense: "Galicia",
			palencia: "Castilla y León",
			palmas: "Canarias",
			"palmas las": "Canarias",
			"las palmas": "Canarias",
			pontevedra: "Galicia",
			rioja: "Rioja, La",
			"la rioja": "Rioja, La",
			"rioja la": "Rioja, La",
			salamanca: "Castilla y León",
			"santa cruz de tenerife": "Canarias",
			segovia: "Castilla y León",
			sevilla: "Andalucía",
			soria: "Castilla y León",
			tarragona: "Cataluña",
			tenerife: "Canarias",
			teruel: "Aragón",
			toledo: "Castilla-La Mancha",
			valencia: "Comunitat Valenciana",
			"valencia valencia": "Comunitat Valenciana",
			valladolid: "Castilla y León",
			vizcaya: "País Vasco",
			zamora: "Castilla y León",
			zaragoza: "Aragón"
		};
		function normalizeProvinceName(value) {
			return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
		}
		function getCommunityForProvince(province) {
			return provinciaToCommunity[normalizeProvinceName(province)] || province;
		}
		$: getSelectedRegions = () => {
			if (filterMode === "province") return selectedProvinces;
			return selectedCommunities.length > 0 ? provinceOptions.filter((p) => {
				const community = getCommunityForProvince(p);
				return selectedCommunities.includes(community);
			}) : provinceOptions;
		};
		$: filteredAntenasByRegion = (() => {
			const regions = getSelectedRegions();
			return regions.length === 0 ? allAntenas : allAntenas.filter((antena) => regions.includes(antena.provincia));
		})();
		$: statsSeries = (() => {
			const counts = /* @__PURE__ */ new Map();
			filteredAntenasByRegion.forEach((antena) => {
				counts.set(antena.operador, (counts.get(antena.operador) ?? 0) + 1);
			});
			return [...counts.entries()].map(([label, value]) => ({
				label,
				value
			})).sort((a, b) => b.value - a.value);
		})();
		$: statsSeries.reduce((sum, item) => sum + item.value, 0);
		$: declaredStatsSeries = (() => {
			const counts = /* @__PURE__ */ new Map();
			filteredAntenasByRegion.forEach((antena) => {
				const key = String(antena.operador ?? "Sin operador").trim() || "Sin operador";
				if (!counts.has(key)) counts.set(key, {
					operator: key,
					total: 0,
					declared: 0,
					percent: 0
				});
				const item = counts.get(key);
				item.total += 1;
				if (antena.declared) item.declared += 1;
			});
			return [...counts.values()].map((item) => ({
				...item,
				percent: item.total > 0 ? item.declared / item.total * 100 : 0
			})).sort((a, b) => b.percent - a.percent || b.total - a.total);
		})();
		$: declaredTotals = declaredStatsSeries.reduce((acc, item) => ({
			total: acc.total + item.total,
			declared: acc.declared + item.declared
		}), {
			total: 0,
			declared: 0
		});
		$: declaredTotals.total > 0 && declaredTotals.declared / declaredTotals.total * 100;
		$: latestHistoryRun = Array.isArray(declarationHistory?.runs) ? declarationHistory.runs[0] ?? null : null;
		$: Array.isArray(latestHistoryRun?.changes) && latestHistoryRun.changes;
		$: new Map(allAntenas.map((antena) => [Number(antena.id), antena]));
		$$renderer.push(`<main class="svelte-1iknb9c"><div class="stats-page svelte-1iknb9c"><div class="stats-header svelte-1iknb9c"><h1 class="svelte-1iknb9c">Estadísticas</h1> <button type="button" class="svelte-1iknb9c">Volver al mapa</button></div> `);
		$$renderer.push("<!--[0-->");
		$$renderer.push(`<p>Cargando datos...</p>`);
		$$renderer.push(`<!--]--></div></main>`);
	});
}
//#endregion
export { _page as default };

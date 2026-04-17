<script>
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  let loading = true;
  let error = "";
  let allAntenas = [];

  let provinceOptions = [];
  let communityOptions = [];

  let selectedProvinces = [];
  let selectedCommunities = [];
  let filterMode = "province"; // 'province' o 'community'

  // Mapeo de provincias a comunidades autónomas (normalizado para absorber variantes de nombres)
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
    zaragoza: "Aragón",
  };

  function normalizeProvinceName(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function getCommunityForProvince(province) {
    return provinciaToCommunity[normalizeProvinceName(province)] || province;
  }

  const communityLabelMap = {
    "Rioja, La": "La Rioja",
    "Balears, Illes": "Islas Baleares",
    "Comunitat Valenciana": "Valencia",
    "Región de Murcia": "Murcia",
    "Comunidad de Madrid": "Madrid",
  };

  function getCommunityLabel(community) {
    return communityLabelMap[community] || community;
  }

  function sortEs(a, b) {
    return String(a).localeCompare(String(b), "es", {
      sensitivity: "base",
    });
  }

  $: getSelectedRegions = () => {
    if (filterMode === "province") {
      return selectedProvinces;
    }
    return selectedCommunities.length > 0
      ? provinceOptions.filter((p) => {
          const community = getCommunityForProvince(p);
          return selectedCommunities.includes(community);
        })
      : provinceOptions;
  };

  $: statsSeries = (() => {
    const regions = getSelectedRegions();
    const filtered =
      regions.length === 0
        ? allAntenas
        : allAntenas.filter((antena) => regions.includes(antena.provincia));

    const counts = new Map();
    filtered.forEach((antena) => {
      counts.set(antena.operador, (counts.get(antena.operador) ?? 0) + 1);
    });

    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  })();

  $: totalCount = statsSeries.reduce((sum, item) => sum + item.value, 0);

  const colorMap = {
    "TELEFÓNICA MÓVILES ESPAÑA, S.A.": "#3b82f6", // Azul
    "ORANGE ESPAGNE S.A.": "#f97316", // Naranja
    "VODAFONE ESPAÑA S.A.": "#ef4444", // Rojo
    "AVATEL TELECOM S.A.": "#8b5cf6", // Morado
  };

  function getColor(label) {
    return colorMap[label] || "#10b981"; // Verde por defecto
  }

  function calculatePieSlice(index, data) {
    const slices = [];
    let currentAngle = 0;

    data.forEach((item, i) => {
      const sliceAngle = (item.value / totalCount) * 360;
      if (i === index) {
        slices.push({
          startAngle: currentAngle,
          endAngle: currentAngle + sliceAngle,
        });
      }
      currentAngle += sliceAngle;
    });

    return slices[0];
  }

  function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  }

  function describeArc(x, y, radius, startAngle, endAngle) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArc = endAngle - startAngle <= 180 ? "0" : "1";

    return [
      "M",
      x,
      y,
      "L",
      start.x,
      start.y,
      "A",
      radius,
      radius,
      0,
      largeArc,
      0,
      end.x,
      end.y,
      "Z",
    ].join(" ");
  }

  onMount(async () => {
    try {
      const response = await fetch("/data/antenas.json");
      if (!response.ok) {
        throw new Error("No se pudo cargar el JSON de antenas.");
      }

      const data = await response.json();
      allAntenas = data.antenas ?? [];

      provinceOptions = [
        ...new Set(allAntenas.map((antena) => antena.provincia)),
      ].sort(sortEs);
      communityOptions = [
        ...new Set(provinceOptions.map((p) => getCommunityForProvince(p))),
      ].sort(sortEs);
    } catch (loadError) {
      error =
        loadError instanceof Error ? loadError.message : "Error desconocido.";
    } finally {
      loading = false;
    }
  });
</script>

<main>
  <div class="stats-page">
    <div class="stats-header">
      <h1>Estadísticas</h1>
      <button type="button" on:click={() => goto("/")}>Volver al mapa</button>
    </div>

    {#if loading}
      <p>Cargando datos...</p>
    {:else if error}
      <p class="error">{error}</p>
    {:else}
      <div class="stats-filters">
        <div class="filter-mode-toggle">
          <button
            type="button"
            class:active={filterMode === "province"}
            on:click={() => {
              filterMode = "province";
              selectedCommunities = [];
            }}
          >
            Por Provincia
          </button>
          <button
            type="button"
            class:active={filterMode === "community"}
            on:click={() => {
              filterMode = "community";
              selectedProvinces = [];
            }}
          >
            Por Comunidad
          </button>
        </div>

        {#if filterMode === "province"}
          <div class="regions-grid">
            <label class="select-all">
              <input
                type="checkbox"
                checked={selectedProvinces.length === 0}
                on:change={() => {
                  selectedProvinces = [];
                }}
              />
              <span>Todas las provincias</span>
            </label>
            {#each provinceOptions as province}
              <label>
                <input
                  type="checkbox"
                  checked={selectedProvinces.includes(province)}
                  on:change={(e) => {
                    if (e.currentTarget.checked) {
                      selectedProvinces = [...selectedProvinces, province];
                    } else {
                      selectedProvinces = selectedProvinces.filter(
                        (p) => p !== province,
                      );
                    }
                  }}
                />
                <span>{province}</span>
              </label>
            {/each}
          </div>
        {:else}
          <div class="regions-grid">
            <label class="select-all">
              <input
                type="checkbox"
                checked={selectedCommunities.length === 0}
                on:change={() => {
                  selectedCommunities = [];
                }}
              />
              <span>Todas las comunidades</span>
            </label>
            {#each communityOptions as community}
              <label>
                <input
                  type="checkbox"
                  checked={selectedCommunities.includes(community)}
                  on:change={(e) => {
                    if (e.currentTarget.checked) {
                      selectedCommunities = [...selectedCommunities, community];
                    } else {
                      selectedCommunities = selectedCommunities.filter(
                        (c) => c !== community,
                      );
                    }
                  }}
                />
                <span>{getCommunityLabel(community)}</span>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <div class="chart-container">
        <div class="pie-chart">
          <svg viewBox="0 0 300 300" style="width: 100%; max-width: 300px;">
            {#each statsSeries as item, index}
              {@const slice = calculatePieSlice(index, statsSeries)}
              {#if slice.endAngle - slice.startAngle >= 359.999}
                <circle
                  cx="150"
                  cy="150"
                  r="120"
                  fill={getColor(item.label)}
                  stroke="white"
                  stroke-width="2"
                />
              {:else}
                <path
                  d={describeArc(
                    150,
                    150,
                    120,
                    slice.startAngle,
                    slice.endAngle,
                  )}
                  fill={getColor(item.label)}
                  stroke="white"
                  stroke-width="2"
                />
              {/if}
            {/each}
          </svg>
        </div>

        <div class="chart-legend">
          <h2>
            Antenas por operadora {totalCount > 0 && `(${totalCount} total)`}
          </h2>
          {#if statsSeries.length === 0}
            <p>No hay datos para los filtros seleccionados.</p>
          {:else}
            <div class="legend-items">
              {#each statsSeries as item, index}
                <div class="legend-item">
                  <div
                    class="legend-color"
                    style={`background: ${getColor(item.label)}`}
                  ></div>
                  <div class="legend-text">
                    <span class="legend-label">{item.label}</span>
                    <span class="legend-value">
                      {item.value} ({((item.value / totalCount) * 100).toFixed(
                        1,
                      )}%)
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</main>

<style>
  main {
    width: 100%;
    min-height: 100vh;
  }

  .stats-page {
    padding: 20px;
    width: 100%;
    background: linear-gradient(135deg, #dcfce7 0%, #f8fafc 50%, #dbeafe 100%);
    min-height: 100vh;
    box-sizing: border-box;
  }

  .stats-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }

  .stats-header h1 {
    margin: 0;
    font-size: clamp(1.5rem, 4vw, 2.2rem);
    color: #0f172a;
  }

  .stats-header button {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 8px 16px;
    background: rgba(248, 250, 252, 0.95);
    color: #0f172a;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .stats-header button:hover {
    background: rgba(248, 250, 252, 1);
  }

  .stats-filters {
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
  }

  .filter-mode-toggle {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 12px;
  }

  .filter-mode-toggle button {
    border: 0;
    padding: 8px 12px;
    background: transparent;
    color: #64748b;
    font-weight: 600;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
  }

  .filter-mode-toggle button.active {
    color: #0f172a;
    border-bottom-color: #22c55e;
  }

  .regions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
  }

  .regions-grid label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .regions-grid label.select-all {
    grid-column: 1 / -1;
    font-weight: 600;
  }

  .regions-grid input[type="checkbox"] {
    cursor: pointer;
  }

  .chart-container {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 32px;
    align-items: start;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 12px;
    padding: 24px;
  }

  .pie-chart {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .chart-legend h2 {
    margin: 0 0 16px;
    font-size: 1rem;
    color: #0f172a;
  }

  .legend-items {
    display: grid;
    gap: 12px;
  }

  .legend-item {
    display: grid;
    grid-template-columns: 20px 1fr;
    gap: 12px;
    align-items: center;
  }

  .legend-color {
    width: 20px;
    height: 20px;
    border-radius: 4px;
  }

  .legend-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .legend-label {
    font-weight: 600;
    color: #0f172a;
  }

  .legend-value {
    font-size: 0.85rem;
    color: #64748b;
  }

  .error {
    color: #dc2626;
    padding: 12px;
    background: #fee2e2;
    border-radius: 8px;
  }

  @media (max-width: 900px) {
    .chart-container {
      grid-template-columns: 1fr;
      gap: 24px;
    }

    .pie-chart {
      max-width: 280px;
      margin: 0 auto;
    }

    .regions-grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    }
  }

  @media (max-width: 640px) {
    .stats-page {
      padding: 12px;
    }

    .stats-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .stats-header button {
      width: 100%;
    }

    .regions-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .regions-grid label.select-all {
      grid-column: 1 / -1;
    }
  }
</style>

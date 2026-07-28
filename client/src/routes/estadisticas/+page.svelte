<script>
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  let loading = true;
  let error = "";
  let allAntenas = [];
  let declarationHistory = null;

  let provinceOptions = [];
  let communityOptions = [];

  let selectedProvinces = [];
  let selectedCommunities = [];
  let excludedHistoryOperators = [];
  let filterMode = "province"; // 'province' o 'community'
  let bandFilter = "all"; // 'all' | 'n78' | 'n28plus'
  const DECLARED_MATCH_DISTANCE_METERS = 900;
  const REQUIRED_5G_BANDS = new Set(["N78", "N78+", "N28", "N28+"]);
  const N78_BANDS = new Set(["N78", "N78+"]);
  const N28PLUS_BANDS = new Set(["N28+"]);

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

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function formatOperatorLabel(operator) {
    const label = String(operator ?? "").trim();
    const normalized = normalizeText(label);

    if (normalized.includes("avatel")) {
      return `${label} (Xfera/MasOrange)`;
    }

    return label;
  }

  function resolveDeclaredOperatorCode(operador) {
    const normalized = normalizeText(operador);
    if (normalized.includes("vodafone")) {
      return "1";
    }

    if (
      normalized.includes("telefonica") ||
      normalized.includes("moviles espana") ||
      normalized.includes("movistar")
    ) {
      return "7";
    }

    if (normalized.includes("orange") || normalized.includes("avatel")) {
      return "3";
    }

    return null;
  }

  function toRadians(value) {
    return (value * Math.PI) / 180;
  }

  function normalizeDeclaredApiOperatorCode(code) {
    const normalized = String(code ?? "").trim();
    if (normalized === "4") {
      return "3";
    }

    if (normalized === "22") {
      return "7";
    }

    return normalized;
  }

  function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const earthRadiusMeters = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function buildDeclaredIndex(declaredAntenas, cellSizeDegrees) {
    const index = new Map();

    declaredAntenas.forEach((declared, indexPosition) => {
      const operatorCode = normalizeDeclaredApiOperatorCode(declared.operator);
      if (!operatorCode) {
        return;
      }

      const lat = Number(declared.lat);
      const lon = Number(declared.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return;
      }

      const latCell = Math.floor(lat / cellSizeDegrees);
      const lonCell = Math.floor(lon / cellSizeDegrees);
      const key = `${operatorCode}:${latCell}:${lonCell}`;

      if (!index.has(key)) {
        index.set(key, []);
      }

      const declaredId = Number(declared.id);
      const matchKey = Number.isFinite(declaredId)
        ? declaredId
        : `${operatorCode}:${lat}:${lon}:${indexPosition}`;
      index.get(key).push({ ...declared, lat, lon, matchKey });
    });

    return index;
  }

  function collectDeclaredCandidates(antena, declaredIndex, cellSizeDegrees) {
    const operatorCode = resolveDeclaredOperatorCode(
      antena.compania || antena.operador,
    );
    if (!operatorCode) {
      return [];
    }

    const [lon, lat] = antena.coordenadas ?? [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return [];
    }

    const latCell = Math.floor(lat / cellSizeDegrees);
    const lonCell = Math.floor(lon / cellSizeDegrees);
    const candidatesWithDistance = [];

    for (let dLat = -1; dLat <= 1; dLat += 1) {
      for (let dLon = -1; dLon <= 1; dLon += 1) {
        const key = `${operatorCode}:${latCell + dLat}:${lonCell + dLon}`;
        const candidates = declaredIndex.get(key) ?? [];

        candidates.forEach((candidate) => {
          const distance = haversineDistanceMeters(
            lat,
            lon,
            candidate.lat,
            candidate.lon,
          );

          if (distance <= DECLARED_MATCH_DISTANCE_METERS) {
            candidatesWithDistance.push({ candidate, distance });
          }
        });
      }
    }

    return candidatesWithDistance;
  }

  function computeBestDeclaredMatches(antenas, declaredIndex, cellSizeDegrees) {
    const allCandidates = [];

    antenas.forEach((antena, antennaIndex) => {
      const candidates = collectDeclaredCandidates(
        antena,
        declaredIndex,
        cellSizeDegrees,
      );

      candidates.forEach(({ candidate, distance }) => {
        allCandidates.push({ antennaIndex, candidate, distance });
      });
    });

    allCandidates.sort((a, b) => a.distance - b.distance);

    const assignedAntennaIndexes = new Set();
    const assignedDeclaredMatchKeys = new Set();
    const matchesByAntennaIndex = new Map();

    allCandidates.forEach(({ antennaIndex, candidate }) => {
      if (
        assignedAntennaIndexes.has(antennaIndex) ||
        assignedDeclaredMatchKeys.has(candidate.matchKey)
      ) {
        return;
      }

      assignedAntennaIndexes.add(antennaIndex);
      assignedDeclaredMatchKeys.add(candidate.matchKey);
      matchesByAntennaIndex.set(antennaIndex, candidate);
    });

    return matchesByAntennaIndex;
  }

  function mergeDeclaredStatus(antenas, declaredAntenas) {
    const cellSizeDegrees = DECLARED_MATCH_DISTANCE_METERS / 111320;
    const declaredIndex = buildDeclaredIndex(declaredAntenas, cellSizeDegrees);
    const matchesByAntennaIndex = computeBestDeclaredMatches(
      antenas,
      declaredIndex,
      cellSizeDegrees,
    );

    const hasRequired5GBand = (bands) =>
      bands.some((band) => REQUIRED_5G_BANDS.has(String(band).toUpperCase()));

    const hasN78Band = (bands) =>
      bands.some((band) => N78_BANDS.has(String(band).toUpperCase()));

    const hasN28PlusBand = (bands) =>
      bands.some((band) => N28PLUS_BANDS.has(String(band).toUpperCase()));

    return antenas.map((antena, index) => {
      const match = matchesByAntennaIndex.get(index) ?? null;
      if (!match) {
        return {
          ...antena,
          declared: false,
          declaredN78: false,
          declaredN28Plus: false,
        };
      }

      const matchedBands = Array.isArray(match.bands) ? match.bands : [];
      const hasBands = matchedBands.length > 0;
      const hasRequiredBand = hasRequired5GBand(matchedBands);
      return {
        ...antena,
        declared: hasRequiredBand,
        declaredN78: hasBands ? hasN78Band(matchedBands) : false,
        declaredN28Plus: hasBands ? hasN28PlusBand(matchedBands) : false,
      };
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

  $: filteredAntenasByRegion = (() => {
    const regions = getSelectedRegions();
    return regions.length === 0
      ? allAntenas
      : allAntenas.filter((antena) => regions.includes(antena.provincia));
  })();

  $: statsSeries = (() => {
    const counts = new Map();
    filteredAntenasByRegion.forEach((antena) => {
      counts.set(antena.operador, (counts.get(antena.operador) ?? 0) + 1);
    });

    return [...counts.entries()]
      .map(([label, value]) => ({ label: formatOperatorLabel(label), value }))
      .sort((a, b) => b.value - a.value);
  })();

  $: totalCount = statsSeries.reduce((sum, item) => sum + item.value, 0);

  $: declaredStatsSeries = (() => {
    const counts = new Map();

    filteredAntenasByRegion.forEach((antena) => {
      const key =
        String(antena.operador ?? "Sin operador").trim() || "Sin operador";

      if (!counts.has(key)) {
        counts.set(key, {
          operator: formatOperatorLabel(key),
          total: 0,
          declared: 0,
          percent: 0,
        });
      }

      const item = counts.get(key);
      item.total += 1;

      const isDeclared =
        bandFilter === "n78"
          ? antena.declaredN78
          : bandFilter === "n28plus"
            ? antena.declaredN28Plus
            : antena.declared;

      if (isDeclared) {
        item.declared += 1;
      }
    });

    return [...counts.values()]
      .map((item) => ({
        ...item,
        percent: item.total > 0 ? (item.declared / item.total) * 100 : 0,
      }))
      .sort((a, b) => b.percent - a.percent || b.total - a.total);
  })();

  $: declaredTotals = declaredStatsSeries.reduce(
    (acc, item) => ({
      total: acc.total + item.total,
      declared: acc.declared + item.declared,
    }),
    { total: 0, declared: 0 },
  );

  $: declaredOverallPercent =
    declaredTotals.total > 0
      ? (declaredTotals.declared / declaredTotals.total) * 100
      : 0;

  $: latestHistoryRun = Array.isArray(declarationHistory?.runs)
    ? (declarationHistory.runs[0] ?? null)
    : null;

  $: latestHistoryChanges = Array.isArray(latestHistoryRun?.changes)
    ? latestHistoryRun.changes
    : [];

  $: latestBandChanges = Array.isArray(latestHistoryRun?.bandChanges)
    ? latestHistoryRun.bandChanges
    : [];

  $: allHistoryRuns = Array.isArray(declarationHistory?.runs)
    ? declarationHistory.runs
    : [];

  $: allDeclarationChanges = allHistoryRuns.flatMap((run) =>
    (Array.isArray(run?.changes) ? run.changes : []).map((item) => ({
      generatedAt: run.generatedAt,
      ...item,
    })),
  );

  $: allBandChanges = Array.isArray(declarationHistory?.bandChangesLog)
    ? declarationHistory.bandChangesLog
    : allHistoryRuns.flatMap((run) =>
        [
          ...(Array.isArray(run?.bandChanges)
            ? run.bandChanges
            : Array.isArray(run?.changes)
              ? run.changes
              : []),
        ].map((item) => ({
          generatedAt: run.generatedAt,
          ...item,
        })),
      );

  function hasRequiredBandInList(bands) {
    return (Array.isArray(bands) ? bands : []).some((band) =>
      REQUIRED_5G_BANDS.has(String(band).toUpperCase()),
    );
  }

  function isRelevantBandChange(item) {
    return (
      hasRequiredBandInList(item?.previousBands) ||
      hasRequiredBandInList(item?.currentBands)
    );
  }

  function buildDeclaredNowIdSet(changes) {
    return new Set(
      (Array.isArray(changes) ? changes : [])
        .filter((item) => item?.change === "declara_ahora")
        .map((item) => Number(item?.id))
        .filter((id) => Number.isFinite(id)),
    );
  }

  function buildDeclaredNowIdSetByRun(runs) {
    const map = new Map();

    (Array.isArray(runs) ? runs : []).forEach((run) => {
      const generatedAt = run?.generatedAt;
      if (!generatedAt) {
        return;
      }

      map.set(generatedAt, buildDeclaredNowIdSet(run?.changes));
    });

    return map;
  }

  function filterBandChangesWithoutDeclaredNow(bandChanges, declaredNowIds) {
    return (Array.isArray(bandChanges) ? bandChanges : []).filter((item) => {
      const id = Number(item?.id);
      return !Number.isFinite(id) || !declaredNowIds.has(id);
    });
  }

  $: latestBandChangesVisible = filterBandChangesWithoutDeclaredNow(
    latestBandChanges.filter(isRelevantBandChange),
    buildDeclaredNowIdSet(latestHistoryRun?.changes),
  );

  $: declaredNowIdsByRun = buildDeclaredNowIdSetByRun(allHistoryRuns);

  $: allBandChangesVisible = allBandChanges
    .filter(isRelevantBandChange)
    .filter((item) => {
      const declaredNowIds =
        declaredNowIdsByRun.get(item?.generatedAt) ?? new Set();
      return (
        filterBandChangesWithoutDeclaredNow([item], declaredNowIds).length > 0
      );
    });

  $: allDeclarationChangesVisible = allDeclarationChanges.filter((item) => {
    const current = antenaById.get(Number(item?.id));
    if (!current) {
      return true;
    }

    if (item?.change === "deja_de_declarar" && current.declared) {
      return false;
    }

    if (item?.change === "declara_ahora" && !current.declared) {
      return false;
    }

    return true;
  });

  function sortHistoryItems(items) {
    return [...items].sort((a, b) => {
      const dateA = new Date(a.generatedAt ?? 0).getTime();
      const dateB = new Date(b.generatedAt ?? 0).getTime();
      if (dateA !== dateB) {
        return dateB - dateA;
      }

      return Number(b.id ?? 0) - Number(a.id ?? 0);
    });
  }

  $: historyOperatorOptions = [
    ...new Set(
      [
        ...latestHistoryChanges.map((item) => item.operador),
        ...latestBandChangesVisible.map((item) => item.operador),
        ...allDeclarationChangesVisible.map((item) => item.operador),
        ...allBandChangesVisible.map((item) => item.operador),
      ].filter(Boolean),
    ),
  ].sort(sortEs);

  $: latestDeclarationHistoryVisible = latestHistoryChanges.filter(
    (item) => !excludedHistoryOperators.includes(item.operador),
  );

  $: latestBandChangesFiltered = latestBandChangesVisible.filter(
    (item) => !excludedHistoryOperators.includes(item.operador),
  );

  $: latestDeclarationSummary = latestDeclarationHistoryVisible.reduce(
    (acc, item) => {
      if (item.change === "declara_ahora") {
        acc.gained += 1;
      } else if (item.change === "deja_de_declarar") {
        acc.lost += 1;
      }

      return acc;
    },
    { gained: 0, lost: 0 },
  );

  $: accumulatedDeclarationChanges = allDeclarationChangesVisible.filter(
    (item) =>
      item.generatedAt !== latestHistoryRun?.generatedAt &&
      !excludedHistoryOperators.includes(item.operador),
  );

  $: accumulatedBandChanges = allBandChangesVisible.filter(
    (item) =>
      item.generatedAt !== latestHistoryRun?.generatedAt &&
      !excludedHistoryOperators.includes(item.operador),
  );

  $: accumulatedHistoryVisible = sortHistoryItems([
    ...accumulatedDeclarationChanges.map((item) => ({
      ...item,
      historyType: "declaration",
    })),
    ...accumulatedBandChanges.map((item) => ({
      ...item,
      historyType: "band",
      change: "cambio_bandas",
    })),
  ]);

  $: antenaById = new Map(
    allAntenas.map((antena) => [Number(antena.id), antena]),
  );

  const colorMap = {
    "TELEFÓNICA MÓVILES ESPAÑA, S.A.": "#3b82f6", // Azul
    "ORANGE ESPAGNE S.A.": "#f97316", // Naranja
    "VODAFONE ESPAÑA S.A.": "#ef4444", // Rojo
    "AVATEL TELECOM S.A.": "#8b5cf6", // Morado
  };

  function getColor(label) {
    const normalized = normalizeText(label);

    if (normalized.includes("avatel")) {
      return "#8b5cf6";
    }

    return colorMap[label] || "#10b981"; // Verde por defecto
  }

  function getHistoryStatusBadgeStyle(change) {
    if (change === "declara_ahora") {
      return "background: #dcfce7; border-color: #bbf7d0; color: #166534;";
    }

    if (change === "cambio_bandas") {
      return "background: #dbeafe; border-color: #bfdbfe; color: #1d4ed8;";
    }

    return "background: #fee2e2; border-color: #fecaca; color: #991b1b;";
  }

  function getHistoryOperatorButtonStyle(operator) {
    const color = getColor(operator);

    if (excludedHistoryOperators.includes(operator)) {
      return `border-color: ${color}; background: #fff; color: ${color};`;
    }

    return `border-color: ${color}; background: ${color}; color: #fff;`;
  }

  function getHistoryCardStyle(operator) {
    const color = getColor(operator);
    return `border-color: ${color}2a; background: ${color}12;`;
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

  function getHistoryPrimaryCode(item) {
    const current = Array.isArray(item?.currentCodes) ? item.currentCodes : [];
    const previous = Array.isArray(item?.previousCodes)
      ? item.previousCodes
      : [];
    return (current[0] ?? previous[0] ?? "").trim();
  }

  function getAntenasMovilesHistoryUrl(item) {
    const code = getHistoryPrimaryCode(item);
    if (!code) {
      return "";
    }

    const declaredLat = Number(item?.currentLat ?? item?.previousLat);
    const declaredLon = Number(item?.currentLon ?? item?.previousLon);
    if (Number.isFinite(declaredLon) && Number.isFinite(declaredLat)) {
      return `https://antenasmoviles.es/?b&${encodeURIComponent(code)}#19/${declaredLat.toFixed(6)}/${declaredLon.toFixed(6)}/osm`;
    }

    const sourceAntena = antenaById.get(Number(item?.id));
    const [lon, lat] = sourceAntena?.coordenadas ?? [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return `https://antenasmoviles.es/?b&${encodeURIComponent(code)}`;
    }

    return `https://antenasmoviles.es/?b&${encodeURIComponent(code)}#19/${Number(lat).toFixed(6)}/${Number(lon).toFixed(6)}/osm`;
  }

  function getOwnMapHistoryUrl(item) {
    const id = Number(item?.id);
    return Number.isFinite(id) ? `/?id=${encodeURIComponent(id)}` : "";
  }

  function getHistoryBandDiff(item) {
    const previousBands = Array.isArray(item?.previousBands)
      ? item.previousBands.map((band) => String(band).trim()).filter(Boolean)
      : [];
    const currentBands = Array.isArray(item?.currentBands)
      ? item.currentBands.map((band) => String(band).trim()).filter(Boolean)
      : [];

    const previousSet = new Set(previousBands);
    const currentSet = new Set(currentBands);
    const parts = [];

    currentBands.forEach((band) => {
      if (previousSet.has(band)) {
        parts.push({ value: band, kind: "same" });
      } else {
        parts.push({ value: band, kind: "added" });
      }
    });

    previousBands.forEach((band) => {
      if (!currentSet.has(band)) {
        parts.push({ value: band, kind: "removed" });
      }
    });

    return parts;
  }

  onMount(async () => {
    try {
      const [response, declaredResponse, historyResponse] = await Promise.all([
        fetch("/data/antenas.json"),
        fetch("/data/antenasMoviles.json"),
        fetch("/data/history.json"),
      ]);
      if (!response.ok) {
        throw new Error("No se pudo cargar el JSON de antenas.");
      }
      if (!declaredResponse.ok) {
        throw new Error("No se pudo cargar el JSON de antenas declaradas.");
      }

      const [data, declaredData] = await Promise.all([
        response.json(),
        declaredResponse.json(),
      ]);

      if (historyResponse.ok) {
        declarationHistory = await historyResponse.json();
      }

      const mergedAntenas = mergeDeclaredStatus(
        data.antenas ?? [],
        Array.isArray(declaredData.antenas) ? declaredData.antenas : [],
      );
      allAntenas = mergedAntenas;

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

      <div class="declared-chart-container">
        <h2>
          {bandFilter === "n78"
            ? "Con N78/N78+"
            : bandFilter === "n28plus"
              ? "Con N28+"
              : "Declaradas"} por operadora
          {declaredTotals.total > 0 &&
            `(${declaredTotals.declared}/${declaredTotals.total}, ${declaredOverallPercent.toFixed(1)}%)`}
        </h2>

        <div class="band-filter-toggle">
          <button
            type="button"
            class:active={bandFilter === "all"}
            on:click={() => (bandFilter = "all")}
          >
            Todo
          </button>
          <button
            type="button"
            class:active={bandFilter === "n78"}
            on:click={() => (bandFilter = "n78")}
          >
            N78/N78+
          </button>
          <button
            type="button"
            class:active={bandFilter === "n28plus"}
            on:click={() => (bandFilter = "n28plus")}
          >
            N28+
          </button>
        </div>

        {#if declaredStatsSeries.length === 0}
          <p>No hay datos para los filtros seleccionados.</p>
        {:else}
          <div class="declared-progress-list">
            {#each declaredStatsSeries as item}
              <div class="declared-progress-item">
                <div class="declared-progress-head">
                  <span class="declared-progress-label">{item.operator}</span>
                  <span class="declared-progress-value">
                    {item.declared}/{item.total} ({item.percent.toFixed(1)}%)
                  </span>
                </div>
                <div class="declared-progress-track">
                  <div
                    class="declared-progress-fill"
                    style={`width: ${item.percent.toFixed(2)}%; background: ${getColor(item.operator)}`}
                  ></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="history-container">
        <h2>Historial de cambios (declaración y bandas)</h2>
        {#if !latestHistoryRun}
          <p>No hay historial disponible todavía.</p>
        {:else}
          <p class="history-summary">
            Última actualización: {new Date(
              latestHistoryRun.generatedAt,
            ).toLocaleString("es-ES")}
          </p>

          <div class="history-operator-filter">
            <div class="history-operator-buttons">
              {#each historyOperatorOptions as operator}
                <button
                  type="button"
                  class:excluded={excludedHistoryOperators.includes(operator)}
                  style={getHistoryOperatorButtonStyle(operator)}
                  on:click={() => {
                    if (excludedHistoryOperators.includes(operator)) {
                      excludedHistoryOperators =
                        excludedHistoryOperators.filter(
                          (item) => item !== operator,
                        );
                    } else {
                      excludedHistoryOperators = [
                        ...excludedHistoryOperators,
                        operator,
                      ];
                    }
                  }}
                >
                  {formatOperatorLabel(operator)}
                </button>
              {/each}
            </div>
          </div>

          <div class="history-summary-list">
            <div class="history-summary-item">
              <span class="history-summary-icon up">+</span>
              <div>
                <div class="history-summary-label">Declaran ahora</div>
                <div class="history-summary-value">
                  {latestDeclarationSummary.gained}
                </div>
              </div>
            </div>
            <div class="history-summary-item">
              <span class="history-summary-icon down">-</span>
              <div>
                <div class="history-summary-label">Dejan de declarar</div>
                <div class="history-summary-value">
                  {latestDeclarationSummary.lost}
                </div>
              </div>
            </div>
            <div class="history-summary-item">
              <span class="history-summary-icon band">B</span>
              <div>
                <div class="history-summary-label">
                  Antenas con cambios de bandas
                </div>
                <div class="history-summary-value">
                  {latestBandChangesFiltered.length}
                </div>
              </div>
            </div>
            <div class="history-summary-item">
              <span class="history-summary-icon up">+</span>
              <div>
                <div class="history-summary-label">Bandas añadidas</div>
                <div class="history-summary-value">
                  {latestBandChangesFiltered.reduce(
                    (total, item) =>
                      total +
                      (Array.isArray(item?.addedBands)
                        ? item.addedBands.length
                        : 0),
                    0,
                  )}
                </div>
              </div>
            </div>
            <div class="history-summary-item">
              <span class="history-summary-icon down">-</span>
              <div>
                <div class="history-summary-label">Bandas eliminadas</div>
                <div class="history-summary-value">
                  {latestBandChangesFiltered.reduce(
                    (total, item) =>
                      total +
                      (Array.isArray(item?.removedBands)
                        ? item.removedBands.length
                        : 0),
                    0,
                  )}
                </div>
              </div>
            </div>
          </div>

          <h3 class="history-subtitle">
            Nuevas declaraciones o eliminaciones en la última actualización
          </h3>
          {#if latestDeclarationHistoryVisible.length === 0}
            <p>
              No hubo cambios de declaración respecto a la actualización
              anterior.
            </p>
          {:else}
            <div class="history-list">
              {#each latestDeclarationHistoryVisible as item}
                <article
                  class="history-item"
                  style={getHistoryCardStyle(item.operador)}
                >
                  <div class="history-item-head">
                    <span
                      class="history-badge"
                      style={getHistoryStatusBadgeStyle(item.change)}
                    >
                      {item.change === "declara_ahora"
                        ? "Declara ahora"
                        : "Deja de declarar"}
                    </span>
                    <span class="history-id">ID {item.id}</span>
                  </div>
                  <p class="history-operator">
                    {formatOperatorLabel(item.operador)}
                  </p>
                  <p class="history-address">
                    {item.provincia} · {item.direccion}
                  </p>
                  <p class="history-bands">
                    Bandas:
                    {#if getHistoryBandDiff(item).length === 0}
                      Sin bandas
                    {:else}
                      {#each getHistoryBandDiff(item) as bandPart, index}
                        <span class={`history-band ${bandPart.kind}`}
                          >{bandPart.value}</span
                        >{index < getHistoryBandDiff(item).length - 1
                          ? ", "
                          : ""}
                      {/each}
                    {/if}
                  </p>
                  {#if getAntenasMovilesHistoryUrl(item)}
                    <a
                      class="history-link"
                      href={getAntenasMovilesHistoryUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver antena en AntenasMoviles
                    </a>
                  {/if}
                  {#if getOwnMapHistoryUrl(item)}
                    <a class="history-link" href={getOwnMapHistoryUrl(item)}>
                      Ver en el mapa
                    </a>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}

          <h3 class="history-subtitle">
            Cambios de bandas en la última actualización
          </h3>
          {#if latestBandChangesFiltered.length === 0}
            <p>No hubo cambios de bandas en esta actualización.</p>
          {:else}
            <div class="history-list">
              {#each latestBandChangesFiltered as item}
                <article
                  class="history-item history-item-band"
                  style={getHistoryCardStyle(item.operador)}
                >
                  <div class="history-item-head">
                    <span
                      class="history-badge neutral"
                      style={getHistoryStatusBadgeStyle("cambio_bandas")}
                    >
                      Cambio de bandas
                    </span>
                    <span class="history-id">ID {item.id}</span>
                  </div>
                  <p class="history-operator">
                    {formatOperatorLabel(item.operador)}
                  </p>
                  <p class="history-address">
                    {item.provincia} · {item.direccion}
                  </p>
                  <p class="history-bands">
                    Bandas:
                    {#if getHistoryBandDiff(item).length === 0}
                      Sin bandas
                    {:else}
                      {#each getHistoryBandDiff(item) as bandPart, index}
                        <span class={`history-band ${bandPart.kind}`}
                          >{bandPart.value}</span
                        >{index < getHistoryBandDiff(item).length - 1
                          ? ", "
                          : ""}
                      {/each}
                    {/if}
                  </p>
                  {#if getAntenasMovilesHistoryUrl(item)}
                    <a
                      class="history-link"
                      href={getAntenasMovilesHistoryUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver antena en AntenasMoviles
                    </a>
                  {/if}
                  {#if getOwnMapHistoryUrl(item)}
                    <a class="history-link" href={getOwnMapHistoryUrl(item)}>
                      Ver en el mapa
                    </a>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}

          <h3 class="history-subtitle">
            Cambios acumulados ({accumulatedHistoryVisible.length})
          </h3>
          {#if accumulatedHistoryVisible.length === 0}
            <p>No hay cambios acumulados todavía.</p>
          {:else}
            <div class="history-list history-list-compact">
              {#each accumulatedHistoryVisible as item}
                <article
                  class={`history-item ${item.historyType === "band" ? "history-item-band" : ""}`}
                  style={getHistoryCardStyle(item.operador)}
                >
                  <div class="history-item-head">
                    <span
                      class={`history-badge ${item.historyType === "band" ? "neutral" : ""}`}
                      style={getHistoryStatusBadgeStyle(item.change)}
                    >
                      {item.historyType === "band"
                        ? "Cambio de bandas"
                        : item.change === "declara_ahora"
                          ? "Declara ahora"
                          : "Deja de declarar"}
                    </span>
                    <span class="history-id">
                      {new Date(item.generatedAt).toLocaleDateString("es-ES")} ·
                      ID {item.id}
                    </span>
                  </div>
                  <p class="history-operator">
                    {formatOperatorLabel(item.operador)}
                  </p>
                  <p class="history-address">
                    {item.provincia} · {item.direccion}
                  </p>
                  <p class="history-bands">
                    Bandas:
                    {#if getHistoryBandDiff(item).length === 0}
                      Sin bandas
                    {:else}
                      {#each getHistoryBandDiff(item) as bandPart, index}
                        <span class={`history-band ${bandPart.kind}`}
                          >{bandPart.value}</span
                        >{index < getHistoryBandDiff(item).length - 1
                          ? ", "
                          : ""}
                      {/each}
                    {/if}
                  </p>
                  {#if getAntenasMovilesHistoryUrl(item)}
                    <a
                      class="history-link"
                      href={getAntenasMovilesHistoryUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver antena en AntenasMoviles
                    </a>
                  {/if}
                  {#if getOwnMapHistoryUrl(item)}
                    <a class="history-link" href={getOwnMapHistoryUrl(item)}>
                      Ver en el mapa
                    </a>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}
        {/if}
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
    border: none;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
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
    grid-template-columns: minmax(280px, 340px) minmax(420px, 540px);
    gap: 40px;
    align-items: center;
    justify-content: center;
    justify-items: center;
    background: rgba(255, 255, 255, 0.92);
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
    width: 100%;
    box-sizing: border-box;
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

  .declared-chart-container {
    margin-top: 24px;
    background: rgba(255, 255, 255, 0.92);
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  }

  .declared-chart-container h2 {
    margin: 0 0 12px;
    font-size: 1rem;
    color: #0f172a;
  }

  .band-filter-toggle {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 12px;
  }

  .band-filter-toggle button {
    border: 0;
    padding: 6px 12px;
    background: transparent;
    color: #64748b;
    font-weight: 600;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
    font-size: 0.85rem;
  }

  .band-filter-toggle button.active {
    color: #0f172a;
    border-bottom-color: #22c55e;
  }

  .declared-progress-list {
    display: grid;
    gap: 14px;
  }

  .declared-progress-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 6px;
  }

  .declared-progress-label {
    font-size: 0.9rem;
    color: #0f172a;
    font-weight: 600;
  }

  .declared-progress-value {
    font-size: 0.82rem;
    color: #475569;
  }

  .declared-progress-track {
    height: 10px;
    border-radius: 999px;
    background: #e2e8f0;
    overflow: hidden;
  }

  .declared-progress-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.25s ease;
  }

  .history-container {
    margin-top: 24px;
    background: rgba(255, 255, 255, 0.92);
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  }

  .history-container h2 {
    margin: 0 0 12px;
    font-size: 1rem;
    color: #0f172a;
  }

  .history-operator-filter {
    margin: 0 0 12px;
    display: grid;
    gap: 10px;
  }

  .history-operator-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .history-operator-buttons button {
    border: 1px solid transparent;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      transform 0.15s ease,
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .history-operator-buttons button:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.14);
  }

  .history-operator-buttons button.excluded {
    opacity: 0.75;
  }

  .history-subtitle {
    margin: 16px 0 10px;
    font-size: 0.92rem;
    color: #0f172a;
  }

  .history-summary {
    margin: 0 0 12px;
    font-size: 0.85rem;
    color: #475569;
  }

  .history-summary-list {
    display: grid;
    gap: 10px;
    margin: 0 0 16px;
  }

  .history-summary-item {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 10px;
    align-items: start;
    padding: 10px 12px;
    border: 1px solid #edf2f7;
    border-radius: 10px;
    background: #f8fafc;
  }

  .history-summary-icon {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 800;
    border: 1px solid transparent;
  }

  .history-summary-icon.up {
    background: #dcfce7;
    border-color: #bbf7d0;
    color: #166534;
  }

  .history-summary-icon.down {
    background: #fee2e2;
    border-color: #fecaca;
    color: #991b1b;
  }

  .history-summary-icon.band {
    background: #dbeafe;
    border-color: #bfdbfe;
    color: #1d4ed8;
  }

  .history-summary-icon.neutral {
    background: #f1f5f9;
    border-color: #e2e8f0;
    color: #334155;
  }

  .history-summary-label {
    font-size: 0.78rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .history-summary-value {
    margin-top: 2px;
    font-size: 0.92rem;
    font-weight: 700;
    color: #0f172a;
  }

  .history-list {
    display: grid;
    gap: 10px;
    max-height: 420px;
    overflow-y: auto;
  }

  .history-list-compact {
    max-height: 520px;
  }

  .history-item {
    border: 1px solid #eef3f8;
    border-radius: 10px;
    padding: 10px 12px;
    background: #f8fafc;
  }

  .history-item-up {
    border-color: #d9f7e3;
    background: #f0fdf4;
  }

  .history-item-down {
    border-color: #fde2e2;
    background: #fef2f2;
  }

  .history-item-band {
    border-color: #dbeafe;
    background: #eff6ff;
  }

  .history-item-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }

  .history-badge {
    font-size: 0.73rem;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 999px;
  }

  .history-badge.up {
    background: #dcfce7;
    color: #166534;
  }

  .history-badge.down {
    background: #fee2e2;
    color: #991b1b;
  }

  .history-badge.neutral {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .history-id {
    font-size: 0.8rem;
    color: #475569;
    font-weight: 600;
  }

  .history-operator {
    margin: 0 0 3px;
    font-size: 0.88rem;
    color: #0f172a;
    font-weight: 600;
  }

  .history-address {
    margin: 0;
    font-size: 0.8rem;
    color: #475569;
  }

  .history-bands {
    margin: 6px 0 0;
    font-size: 0.8rem;
  }

  .history-band {
    color: #334155;
  }

  .history-band.removed {
    color: #b91c1c;
    text-decoration: line-through;
  }

  .history-band.added {
    color: #166534;
    font-weight: 700;
  }

  .history-link {
    display: inline-block;
    margin-top: 8px;
    font-size: 0.8rem;
    color: #0369a1;
    text-decoration: underline;
    font-weight: 600;
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

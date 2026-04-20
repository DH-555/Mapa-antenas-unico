<script>
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import maplibregl from "maplibre-gl";

    let mapContainer;
    let loading = true;
    let error = "";
    let map;
    let sourceReady = false;

    let allAntenas = [];
    let filteredAntenas = [];

    let phaseOptions = [];
    let operatorOptions = [];
    let provinceOptions = [];
    let communityOptions = [];

    let selectedPhases = [];
    let selectedOperators = [];
    let selectedProvinces = [];
    let selectedCommunities = [];
    let idQuery = "";
    let addressQuery = "";
    let showDeclaredStatus = false;
    let declaredDataLoading = false;
    let declaredDataLoaded = false;
    let declaredDataError = "";
    let declaredDataPromise = null;

    let isFilterPanelOpen = false;
    let filterMode = "province"; // 'province' o 'community'
    const DECLARED_MATCH_DISTANCE_METERS = 900;
    const REQUIRED_5G_BANDS = new Set(["N78", "N78+", "N28", "N28+"]);

    // Mapeo de provincias a comunidades autónomas
    const provinciaToCommunity = {
        Álava: "País Vasco",
        Albacete: "Castilla-La Mancha",
        Alicante: "Comunitat Valenciana",
        Almería: "Andalucía",
        Ávila: "Castilla y León",
        Badajoz: "Extremadura",
        Barcelona: "Cataluña",
        Burgos: "Castilla y León",
        Cáceres: "Extremadura",
        Cádiz: "Andalucía",
        Cantabria: "Cantabria",
        Castellón: "Comunitat Valenciana",
        "Ciudad Real": "Castilla-La Mancha",
        Córdoba: "Andalucía",
        Cuenca: "Castilla-La Mancha",
        Girona: "Cataluña",
        Granada: "Andalucía",
        Guadalajara: "Castilla-La Mancha",
        Guipúzcoa: "País Vasco",
        Huelva: "Andalucía",
        Huesca: "Aragón",
        Jaén: "Andalucía",
        "La Coruña": "Galicia",
        "La Rioja": "La Rioja",
        "Las Palmas de Gran Canaria": "Canarias",
        León: "Castilla y León",
        Lleida: "Cataluña",
        Lugo: "Galicia",
        Madrid: "Comunidad de Madrid",
        Málaga: "Andalucía",
        Murcia: "Región de Murcia",
        Navarra: "Navarra",
        Ourense: "Galicia",
        Palencia: "Castilla y León",
        Palmas: "Canarias",
        Pontevedra: "Galicia",
        Salamanca: "Castilla y León",
        "Santa Cruz de Tenerife": "Canarias",
        Segovia: "Castilla y León",
        Sevilla: "Andalucía",
        Soria: "Castilla y León",
        Tarragona: "Cataluña",
        Tenerife: "Canarias",
        Teruel: "Aragón",
        Toledo: "Castilla-La Mancha",
        Valencia: "Comunitat Valenciana",
        Valladolid: "Castilla y León",
        Vizcaya: "País Vasco",
        Zamora: "Castilla y León",
        Zaragoza: "Aragón",
    };

    $: totalAntenas = filteredAntenas.length;

    function getSelectedRegions() {
        if (filterMode === "province") {
            return selectedProvinces;
        }
        return selectedCommunities.length > 0
            ? provinceOptions.filter((p) => {
                  const community = provinciaToCommunity[p] || p;
                  return selectedCommunities.includes(community);
              })
            : provinceOptions;
    }

    function sortEs(a, b) {
        return String(a).localeCompare(String(b), "es", {
            sensitivity: "base",
        });
    }

    function buildGeoJson(antenas) {
        return {
            type: "FeatureCollection",
            features: antenas.map((antena) => ({
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: antena.coordenadas,
                },
                properties: {
                    id: antena.id,
                    fase: antena.fase,
                    operador: antena.operador,
                    compania: antena.compania,
                    provincia: antena.provincia,
                    direccion: antena.direccion,
                    declared: Boolean(antena.declared),
                    declaredMatched: Boolean(antena.declaredMatched),
                    declaredBands: (antena.declaredBands ?? []).join(", "),
                    declaredCodes: (antena.declaredCodes ?? []).join(", "),
                    declaredLat: antena.declaredLat ?? null,
                    declaredLon: antena.declaredLon ?? null,
                },
            })),
        };
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

        return (
            2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        );
    }

    function buildDeclaredIndex(declaredAntenas, cellSizeDegrees) {
        const index = new Map();

        declaredAntenas.forEach((declared) => {
            const operatorCode = String(declared.operator ?? "").trim();
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

            index.get(key).push({ ...declared, lat, lon });
        });

        return index;
    }

    function findDeclaredMatch(antena, declaredIndex, cellSizeDegrees) {
        const operatorCode = resolveDeclaredOperatorCode(
            antena.compania || antena.operador,
        );
        if (!operatorCode) {
            return null;
        }

        const [lon, lat] = antena.coordenadas ?? [];
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
            return null;
        }

        const latCell = Math.floor(lat / cellSizeDegrees);
        const lonCell = Math.floor(lon / cellSizeDegrees);

        let bestMatch = null;
        let bestDistance = Number.POSITIVE_INFINITY;

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

                    if (
                        distance <= DECLARED_MATCH_DISTANCE_METERS &&
                        distance < bestDistance
                    ) {
                        bestMatch = candidate;
                        bestDistance = distance;
                    }
                });
            }
        }

        return bestMatch;
    }

    function mergeDeclaredStatus(antenas, declaredAntenas) {
        const cellSizeDegrees = DECLARED_MATCH_DISTANCE_METERS / 111320;
        const declaredIndex = buildDeclaredIndex(
            declaredAntenas,
            cellSizeDegrees,
        );

        const hasRequired5GBand = (bands) =>
            bands.some((band) =>
                REQUIRED_5G_BANDS.has(String(band).toUpperCase()),
            );

        return antenas.map((antena) => {
            const match = findDeclaredMatch(
                antena,
                declaredIndex,
                cellSizeDegrees,
            );
            if (!match) {
                return {
                    ...antena,
                    declared: false,
                    declaredMatched: false,
                    declaredBands: [],
                    declaredCodes: [],
                    declaredLat: null,
                    declaredLon: null,
                };
            }

            const matchedBands = Array.isArray(match.bands) ? match.bands : [];

            return {
                ...antena,
                declared: hasRequired5GBand(matchedBands),
                declaredMatched: true,
                declaredBands: matchedBands,
                declaredCodes: Array.isArray(match.codes) ? match.codes : [],
                declaredLat: match.lat,
                declaredLon: match.lon,
            };
        });
    }

    function updateDeclaredVisibility() {
        if (!map) {
            return;
        }

        const opacityExpression = showDeclaredStatus
            ? ["case", ["boolean", ["get", "declared"], false], 1, 0.25]
            : 1;

        if (map.getLayer("antenas-dots")) {
            map.setPaintProperty(
                "antenas-dots",
                "circle-opacity",
                opacityExpression,
            );
        }

        if (map.getLayer("antenas-icons")) {
            map.setPaintProperty(
                "antenas-icons",
                "icon-opacity",
                opacityExpression,
            );
        }
    }

    async function ensureDeclaredDataLoaded() {
        if (declaredDataLoaded) {
            return true;
        }

        if (declaredDataPromise) {
            return declaredDataPromise;
        }

        declaredDataLoading = true;
        declaredDataError = "";

        declaredDataPromise = (async () => {
            try {
                const declaredResponse = await fetch(
                    "/data/antenasMoviles.json",
                );
                if (!declaredResponse.ok) {
                    throw new Error(
                        "No se pudo cargar el fichero de antenas declaradas.",
                    );
                }

                const declaredData = await declaredResponse.json();
                const declaredAntenas = Array.isArray(declaredData.antenas)
                    ? declaredData.antenas
                    : [];

                allAntenas = mergeDeclaredStatus(allAntenas, declaredAntenas);
                declaredDataLoaded = true;
                applyFilters();
                updateDeclaredVisibility();
                return true;
            } catch (loadError) {
                declaredDataError =
                    loadError instanceof Error
                        ? loadError.message
                        : "No se pudieron cargar las antenas declaradas.";
                return false;
            } finally {
                declaredDataLoading = false;
                declaredDataPromise = null;
            }
        })();

        return declaredDataPromise;
    }

    async function handleDeclaredToggle(event) {
        const checked = event.currentTarget.checked;
        showDeclaredStatus = checked;

        if (checked) {
            const loadedOk = await ensureDeclaredDataLoaded();
            if (!loadedOk) {
                showDeclaredStatus = false;
            }
        }

        updateDeclaredVisibility();
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

    function matchesAddressQuery(direccion, query) {
        if (query.length === 0) {
            return true;
        }

        const normalized = normalizeText(direccion);
        const compact = normalized.replace(/\s+/g, "");
        const queryCompact = query.replace(/\s+/g, "");

        // Coincidencia directa y sin separadores (villa / villa-verde / villaverde).
        if (normalized.includes(query) || compact.includes(queryCompact)) {
            return true;
        }

        // Coincidencia por prefijos de palabra para tolerar entradas parciales.
        const words = normalized.split(" ").filter(Boolean);
        const queryWords = query.split(" ").filter(Boolean);
        if (queryWords.length === 0) {
            return true;
        }

        return queryWords.every((queryWord) =>
            words.some((word) => word.startsWith(queryWord)),
        );
    }

    function calculateBounds(antenas) {
        const bounds = new maplibregl.LngLatBounds();
        antenas.forEach((antena) => bounds.extend(antena.coordenadas));
        return bounds;
    }

    async function addResizedMarkerImage(id, url, size = 64) {
        if (map.hasImage(id)) {
            return;
        }

        const imageElement = new Image();
        imageElement.src = url;
        await imageElement.decode();

        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const context = canvas.getContext("2d");
        if (!context) {
            return;
        }

        context.clearRect(0, 0, size, size);
        context.drawImage(imageElement, 0, 0, size, size);

        const imageData = context.getImageData(0, 0, size, size);
        if (!map.hasImage(id)) {
            map.addImage(id, imageData);
        }
    }

    async function tryAddResizedMarkerImage(id, url, size = 64) {
        try {
            await addResizedMarkerImage(id, url, size);
            return true;
        } catch (loadError) {
            console.warn(
                `No se pudo cargar icono ${id} desde ${url}.`,
                loadError,
            );
            return false;
        }
    }

    function applyFilters({ fit = false } = {}) {
        const idText = idQuery.trim();
        const addressText = normalizeText(addressQuery.trim());
        const selectedRegions = getSelectedRegions();
        const hasAddressSearch = addressText.length > 0;

        filteredAntenas = allAntenas.filter(
            (antena) =>
                selectedPhases.includes(antena.fase) &&
                selectedOperators.includes(antena.operador) &&
                (hasAddressSearch ||
                    selectedRegions.length === 0 ||
                    selectedRegions.includes(antena.provincia)) &&
                (idText.length === 0 || String(antena.id).includes(idText)) &&
                matchesAddressQuery(antena.direccion, addressText),
        );

        if (!sourceReady) {
            return;
        }

        const source = map.getSource("antenas");
        if (!source) {
            return;
        }

        source.setData(buildGeoJson(filteredAntenas));

        if (fit && filteredAntenas.length > 0) {
            if (hasAddressSearch) {
                if (filteredAntenas.length === 1) {
                    map.easeTo({
                        center: filteredAntenas[0].coordenadas,
                        zoom: 12,
                        duration: 400,
                    });
                    return;
                }

                map.fitBounds(calculateBounds(filteredAntenas), {
                    padding: { top: 60, right: 60, bottom: 60, left: 60 },
                    maxZoom: 12,
                    duration: 400,
                });
                return;
            }

            map.fitBounds(calculateBounds(filteredAntenas), {
                padding: { top: 60, right: 60, bottom: 60, left: 60 },
                maxZoom: 7,
                duration: 400,
            });
        }
    }

    function resetFilters() {
        selectedPhases = [...phaseOptions];
        selectedOperators = [...operatorOptions];
        selectedProvinces = [];
        selectedCommunities = [];
        idQuery = "";
        addressQuery = "";
        applyFilters({ fit: true });
    }

    onMount(() => {
        const setupMap = async () => {
            try {
                const response = await fetch("/data/antenas.json");
                if (!response.ok) {
                    throw new Error("No se pudo cargar el JSON de antenas.");
                }

                const data = await response.json();
                allAntenas = data.antenas ?? [];

                phaseOptions = [
                    ...new Set(allAntenas.map((antena) => antena.fase)),
                ].sort(sortEs);
                operatorOptions = [
                    ...new Set(allAntenas.map((antena) => antena.operador)),
                ].sort(sortEs);
                provinceOptions = [
                    ...new Set(allAntenas.map((antena) => antena.provincia)),
                ].sort(sortEs);
                communityOptions = [
                    ...new Set(
                        provinceOptions.map(
                            (p) => provinciaToCommunity[p] || p,
                        ),
                    ),
                ].sort(sortEs);

                selectedPhases = [...phaseOptions];
                selectedOperators = [...operatorOptions];

                filteredAntenas = [...allAntenas];

                map = new maplibregl.Map({
                    container: mapContainer,
                    style: "https://tiles.openfreemap.org/styles/liberty",
                    center: [-3.7038, 40.4168],
                    zoom: 5,
                });

                map.on("load", async () => {
                    try {
                        map.addControl(
                            new maplibregl.NavigationControl({
                                visualizePitch: true,
                                visualizeRoll: true,
                                showZoom: true,
                                showCompass: true,
                            }),
                        );
                        map.addControl(
                            new maplibregl.GeolocateControl({
                                positionOptions: {
                                    enableHighAccuracy: true,
                                },
                                trackUserLocation: true,
                            }),
                        );

                        const iconLoadResults = await Promise.all([
                            tryAddResizedMarkerImage(
                                "icon-vodafone",
                                "/markers/vodafone-icon.png",
                                56,
                            ),
                            tryAddResizedMarkerImage(
                                "icon-movistar",
                                "/markers/movistar-icon.png",
                                56,
                            ),
                            tryAddResizedMarkerImage(
                                "icon-orange",
                                "/markers/orange-icon.png",
                                56,
                            ),
                        ]);

                        map.addSource("antenas", {
                            type: "geojson",
                            data: buildGeoJson(filteredAntenas),
                        });

                        // 1) Lejos: puntos pequeños de color
                        map.addLayer({
                            id: "antenas-dots",
                            type: "circle",
                            source: "antenas",
                            maxzoom: 7,
                            paint: {
                                "circle-radius": 4,
                                "circle-stroke-width": 0.7,
                                "circle-stroke-color": "#ffffff",
                                "circle-opacity": 1,
                                "circle-color": [
                                    "case",
                                    [
                                        "in",
                                        "vodafone",
                                        [
                                            "downcase",
                                            [
                                                "coalesce",
                                                ["get", "compania"],
                                                ["get", "operador"],
                                                "",
                                            ],
                                        ],
                                    ],
                                    "#e60000",
                                    [
                                        "in",
                                        "orange",
                                        [
                                            "downcase",
                                            [
                                                "coalesce",
                                                ["get", "compania"],
                                                ["get", "operador"],
                                                "",
                                            ],
                                        ],
                                    ],
                                    "#ff7900",
                                    [
                                        "in",
                                        "avatel",
                                        [
                                            "downcase",
                                            [
                                                "coalesce",
                                                ["get", "compania"],
                                                ["get", "operador"],
                                                "",
                                            ],
                                        ],
                                    ],
                                    "#ff7900",
                                    "#019df4",
                                ],
                            },
                        });

                        // 2) Cerca: iconos (solo si cargaron correctamente)
                        if (iconLoadResults.every(Boolean)) {
                            map.addLayer({
                                id: "antenas-icons",
                                type: "symbol",
                                source: "antenas",
                                minzoom: 7,
                                layout: {
                                    "icon-image": [
                                        "case",
                                        [
                                            "in",
                                            "vodafone",
                                            [
                                                "downcase",
                                                [
                                                    "coalesce",
                                                    ["get", "compania"],
                                                    ["get", "operador"],
                                                    "",
                                                ],
                                            ],
                                        ],
                                        "icon-vodafone",
                                        [
                                            "in",
                                            "orange",
                                            [
                                                "downcase",
                                                [
                                                    "coalesce",
                                                    ["get", "compania"],
                                                    ["get", "operador"],
                                                    "",
                                                ],
                                            ],
                                        ],
                                        "icon-orange",
                                        [
                                            "in",
                                            "avatel",
                                            [
                                                "downcase",
                                                [
                                                    "coalesce",
                                                    ["get", "compania"],
                                                    ["get", "operador"],
                                                    "",
                                                ],
                                            ],
                                        ],
                                        "icon-orange",
                                        "icon-movistar",
                                    ],
                                    "icon-size": 0.64,
                                    "icon-anchor": "center",
                                    "icon-allow-overlap": true,
                                    "icon-ignore-placement": true,
                                },
                                paint: {
                                    "icon-opacity": 1,
                                },
                            });
                        }

                        sourceReady = true;

                        if (filteredAntenas.length > 0) {
                            map.fitBounds(calculateBounds(filteredAntenas), {
                                padding: {
                                    top: 60,
                                    right: 60,
                                    bottom: 60,
                                    left: 60,
                                },
                                maxZoom: 5,
                                duration: 0,
                            });
                        }

                        const showPopup = (event) => {
                            const feature = event.features?.[0];
                            if (!feature || feature.geometry.type !== "Point")
                                return;

                            const [lon, lat] = feature.geometry.coordinates;
                            const {
                                id,
                                fase,
                                operador,
                                provincia,
                                direccion,
                                declared,
                                declaredMatched,
                                declaredBands,
                                declaredCodes,
                                declaredLat,
                                declaredLon,
                            } = feature.properties;

                            const isDeclared =
                                declared === true || declared === "true";
                            const hasDeclaredMatch =
                                declaredMatched === true ||
                                declaredMatched === "true";
                            const declaredCodeList = String(declaredCodes ?? "")
                                .split(",")
                                .map((value) => value.trim())
                                .filter(Boolean);
                            const primaryDeclaredCode =
                                declaredCodeList[0] ?? "";
                            const targetLat = Number.isFinite(
                                Number(declaredLat),
                            )
                                ? Number(declaredLat)
                                : Number(lat);
                            const targetLon = Number.isFinite(
                                Number(declaredLon),
                            )
                                ? Number(declaredLon)
                                : Number(lon);
                            const antenasMovilesUrl =
                                hasDeclaredMatch && primaryDeclaredCode
                                    ? `https://antenasmoviles.es/?b&${encodeURIComponent(primaryDeclaredCode)}#19/${targetLat.toFixed(6)}/${targetLon.toFixed(6)}/osm`
                                    : "";
                            const declaredInfo = hasDeclaredMatch
                                ? `<br/><strong>Declarada:</strong> ${isDeclared ? "Si" : "No (sin banda 5G requerida)"}<br/><strong>Bandas:</strong> ${declaredBands || "Sin datos"}${declaredCodes ? `<br/><strong>Codigos declarados:</strong> ${declaredCodes}` : ""}${antenasMovilesUrl ? `<br/><a href="${antenasMovilesUrl}" target="_blank" rel="noopener noreferrer">Ver en AntenasMoviles</a>` : ""}`
                                : "<br/><strong>Declarada:</strong> No";

                            new maplibregl.Popup({ offset: 12 })
                                .setLngLat([lon, lat])
                                .setHTML(
                                    `<strong>ID:</strong> ${id}<br/><strong>Fase:</strong> ${fase}<br/><strong>Operador:</strong> ${operador}<br/><strong>Provincia:</strong> ${provincia}<br/><strong>Dirección:</strong> ${direccion}${declaredInfo}`,
                                )
                                .addTo(map);
                        };

                        ["antenas-dots", "antenas-icons"].forEach((layerId) => {
                            if (!map.getLayer(layerId)) {
                                return;
                            }

                            map.on("click", layerId, showPopup);
                            map.on("mouseenter", layerId, () => {
                                map.getCanvas().style.cursor = "pointer";
                            });
                            map.on("mouseleave", layerId, () => {
                                map.getCanvas().style.cursor = "";
                            });
                        });

                        updateDeclaredVisibility();
                    } catch (layerError) {
                        error =
                            layerError instanceof Error
                                ? layerError.message
                                : "Error al crear capas del mapa.";
                    }
                });
            } catch (setupError) {
                error =
                    setupError instanceof Error
                        ? setupError.message
                        : "Error desconocido.";
            } finally {
                loading = false;
            }
        };

        setupMap();

        return () => {
            map?.remove();
        };
    });

    $: if (sourceReady) {
        updateDeclaredVisibility();
    }
</script>

<main>
    <div class="map-container" bind:this={mapContainer}></div>
    <section class="panel">
        <h1>Mapa de antenas plan único</h1>
        {#if loading}
            <p>Cargando datos...</p>
        {:else if error}
            <p class="error">{error}</p>
        {:else}
            <p>{totalAntenas} antenas subvencionadas</p>
        {/if}
    </section>

    <aside class:open={isFilterPanelOpen} class="filters-panel">
        <div class="filters-header">
            <h2>Filtros</h2>
            <div class="filters-header-actions">
                <button type="button" on:click={resetFilters}>Reset</button>
                <button
                    class="close-button"
                    type="button"
                    on:click={() => (isFilterPanelOpen = false)}
                >
                    ×
                </button>
            </div>
        </div>

        <section>
            <h3>Buscar por ID</h3>
            <input
                class="search-input"
                type="text"
                inputmode="numeric"
                placeholder="Ej: 120"
                bind:value={idQuery}
                on:input={() => applyFilters({ fit: true })}
            />
        </section>

        <section>
            <h3>Buscar por dirección</h3>
            <input
                class="search-input"
                type="text"
                placeholder="Ej: Calle Mayor"
                bind:value={addressQuery}
                on:input={() => applyFilters({ fit: true })}
            />
        </section>

        <section>
            <h3>Fase</h3>
            {#each phaseOptions as phase}
                <label>
                    <input
                        type="checkbox"
                        value={phase}
                        bind:group={selectedPhases}
                        on:change={() => applyFilters()}
                    />
                    <span>{phase}</span>
                </label>
            {/each}
        </section>

        <section>
            <h3>Operador</h3>
            <div class="operators-list">
                {#each operatorOptions as operator}
                    <label>
                        <input
                            type="checkbox"
                            value={operator}
                            bind:group={selectedOperators}
                            on:change={() => applyFilters()}
                        />
                        <span>{operator}</span>
                    </label>
                {/each}
            </div>
        </section>

        <section>
            <h3>Declaradas (AntenasMoviles)</h3>
            <label>
                <input
                    type="checkbox"
                    bind:checked={showDeclaredStatus}
                    disabled={declaredDataLoading}
                    on:change={handleDeclaredToggle}
                />
                <span>Resaltar declaradas</span>
            </label>
            <p class="filter-help">
                Desactivado por defecto. Al activarlo, las no declaradas se ven
                tenues.
            </p>
            {#if declaredDataLoading}
                <p class="filter-loader">Cargando antenas declaradas...</p>
            {/if}
            {#if declaredDataError}
                <p class="filter-error">{declaredDataError}</p>
            {/if}
        </section>

        <section class="filters-credits">
            <h3>Aplicar filtros</h3>
            <p>
                Los filtros se aplican automaticamente al seleccionar opciones.
            </p>
            <p>
                Creditos: Datos del
                <a
                    href="https://digital.gob.es/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Ministerio para la Transformacion Digital y de la Funcion
                    Publica
                </a>
                y de la
                <a
                    href="https://www.red.es/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Fundacion publica
                </a>. Elaboracion de iconos:
                <a
                    href="https://antenasmoviles.es/"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Antenasmoviles.es
                </a>
            </p>
            <a
                class="follow-link-button"
                href="https://antenasmoviles.es/"
                target="_blank"
                rel="noopener noreferrer"
            >
                Ver todas las antenas
            </a>
        </section>

        <section>
            <button
                class="stats-link-button"
                type="button"
                on:click={() => goto("/estadisticas")}
            >
                Ir a estadísticas
            </button>
        </section>
    </aside>
</main>

<button
    class="btn-filtros"
    class:hidden={isFilterPanelOpen}
    on:click={() => (isFilterPanelOpen = true)}>Filtros</button
>

<style>
    :global(body) {
        margin: 0;
        padding: 0;
        overflow: hidden;
    }

    :global(html) {
        overflow: hidden;
    }

    main {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
    }

    .map-container {
        width: 100%;
        height: 100%;
        position: absolute;
        inset: 0;
    }

    .error {
        color: #fecaca;
    }

    .btn-filtros {
        position: fixed;
        bottom: 20px;
        left: 20px;
        padding: 12px 16px;
        background: #14532d;
        color: #ecfdf5;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        z-index: 100;
    }

    .btn-filtros.hidden {
        display: none;
    }

    .filters-panel {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 30;
        width: min(92vw, 340px);
        height: 100%;
        box-sizing: border-box;
        padding: 14px;
        background: rgba(15, 23, 42, 0.94);
        color: #f8fafc;
        transform: translateX(-102%);
        transition: transform 0.2s ease;
        overflow-y: auto;
        pointer-events: none;
    }

    .filters-panel.open {
        transform: translateX(0);
        pointer-events: auto;
    }

    .filters-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
    }

    .filters-header h2 {
        margin: 0;
        font-size: 1rem;
    }

    .filters-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .filters-header button {
        border: 0;
        border-radius: 8px;
        padding: 6px 10px;
        background: #22c55e;
        color: #052e16;
        font-size: 0.8rem;
        font-weight: 700;
        cursor: pointer;
    }

    .filters-header .close-button {
        width: 32px;
        height: 32px;
        padding: 0;
        border-radius: 999px;
        background: rgba(248, 250, 252, 0.2);
        color: #f8fafc;
        font-size: 1.2rem;
        line-height: 1;
    }

    .filters-panel section {
        margin-bottom: 16px;
    }

    .filters-panel h3 {
        margin: 0 0 8px;
        font-size: 0.9rem;
    }

    .search-input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 8px 10px;
        background: #0f172a;
        color: #f8fafc;
        font-size: 0.9rem;
    }

    .search-input::placeholder {
        color: #94a3b8;
    }

    .filters-panel label {
        display: grid;
        grid-template-columns: 16px 1fr;
        align-items: start;
        gap: 8px;
        margin-bottom: 7px;
        font-size: 0.85rem;
    }

    .operators-list {
        max-height: 48vh;
        overflow-y: auto;
        padding-right: 6px;
    }

    .filters-credits p {
        margin: 0 0 10px;
        font-size: 0.82rem;
        line-height: 1.35;
        color: #cbd5e1;
    }

    .filter-help {
        margin: 8px 0 0;
        font-size: 0.78rem;
        color: #cbd5e1;
        line-height: 1.35;
    }

    .filter-loader {
        margin: 8px 0 0;
        font-size: 0.78rem;
        color: #bfdbfe;
        line-height: 1.35;
    }

    .filter-error {
        margin: 8px 0 0;
        font-size: 0.78rem;
        color: #fecaca;
        line-height: 1.35;
    }

    .filters-credits p a {
        color: #86efac;
        text-decoration: underline;
    }

    .follow-link-button {
        display: block;
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(134, 239, 172, 0.35);
        border-radius: 10px;
        padding: 10px 12px;
        background: rgba(20, 83, 45, 0.35);
        color: #dcfce7;
        text-align: center;
        text-decoration: none;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s ease;
    }

    .follow-link-button:hover {
        background: rgba(20, 83, 45, 0.5);
    }

    .stats-link-button {
        width: 100%;
        border: 0;
        border-radius: 10px;
        padding: 10px 12px;
        background: #14532d;
        color: #ecfdf5;
        font-size: 0.92rem;
        font-weight: 700;
        cursor: pointer;
    }
</style>

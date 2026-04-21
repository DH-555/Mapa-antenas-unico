import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = "https://antenasmoviles.es/api/show";
const outputPath = path.resolve(
    __dirname,
    "../public/data/antenasMoviles.json",
);
const historyPath = path.resolve(__dirname, "../public/data/history.json");
const planAntenasPath = path.resolve(__dirname, "../public/data/antenas.json");
const DECLARED_MATCH_DISTANCE_METERS = 900;
const REQUIRED_5G_BANDS = new Set(["N78", "N78+", "N28", "N28+"]);
const CURRENT_RULES = {
    requiredBands: [...REQUIRED_5G_BANDS],
    distanceMeters: DECLARED_MATCH_DISTANCE_METERS,
    yoigoAsOrange: true,
};

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeBand(band) {
    return String(band ?? "")
        .replace(/\|/g, "")
        .trim()
        .toUpperCase();
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

function normalizeDeclaredApiOperatorCode(code, { yoigoAsOrange = true } = {}) {
    const normalized = String(code ?? "").trim();
    if (yoigoAsOrange && normalized === "4") {
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

function hasRequired5GBand(bands) {
    return bands.some((band) => REQUIRED_5G_BANDS.has(String(band).toUpperCase()));
}

function buildDeclaredIndex(declaredAntenas, cellSizeDegrees, rules = CURRENT_RULES) {
    const index = new Map();

    declaredAntenas.forEach((declared) => {
        const operatorCode = normalizeDeclaredApiOperatorCode(
            declared.operator,
            rules,
        );
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

function findDeclaredMatch(planAntena, declaredIndex, cellSizeDegrees) {
    const operatorCode = resolveDeclaredOperatorCode(
        planAntena.compania || planAntena.operador,
    );
    if (!operatorCode) {
        return null;
    }

    const [lon, lat] = planAntena.coordenadas ?? [];
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

function computeDeclaredStatusByPlanId(
    planAntenas,
    declaredAntenas,
    rules = CURRENT_RULES,
) {
    const cellSizeDegrees = DECLARED_MATCH_DISTANCE_METERS / 111320;
    const declaredIndex = buildDeclaredIndex(
        declaredAntenas,
        cellSizeDegrees,
        rules,
    );
    const states = new Map();

    planAntenas.forEach((planAntena) => {
        const match = findDeclaredMatch(planAntena, declaredIndex, cellSizeDegrees);
        const bands = Array.isArray(match?.bands) ? match.bands : [];
        const codes = Array.isArray(match?.codes) ? match.codes : [];

        states.set(Number(planAntena.id), {
            declared: Boolean(match && hasRequired5GBand(bands)),
            matched: Boolean(match),
            bands,
            codes,
        });
    });

    return states;
}

async function readJsonIfExists(filePath) {
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function writeHistory(planAntenas, previousSnapshot, currentSnapshot) {
    const existingHistory = await readJsonIfExists(historyPath);
    const previousRules = {
        requiredBands: Array.isArray(existingHistory?.rules?.requiredBands)
            ? existingHistory.rules.requiredBands
            : CURRENT_RULES.requiredBands,
        distanceMeters:
            typeof existingHistory?.rules?.distanceMeters === "number"
                ? existingHistory.rules.distanceMeters
                : CURRENT_RULES.distanceMeters,
        yoigoAsOrange:
            typeof existingHistory?.rules?.yoigoAsOrange === "boolean"
                ? existingHistory.rules.yoigoAsOrange
                : false,
    };

    const previousAntenas = Array.isArray(previousSnapshot?.antenas)
        ? previousSnapshot.antenas
        : [];
    const currentAntenas = Array.isArray(currentSnapshot?.antenas)
        ? currentSnapshot.antenas
        : [];

    const previousStates = computeDeclaredStatusByPlanId(
        planAntenas,
        previousAntenas,
        previousRules,
    );
    const currentStates = computeDeclaredStatusByPlanId(
        planAntenas,
        currentAntenas,
        CURRENT_RULES,
    );

    const changes = [];
    planAntenas.forEach((planAntena) => {
        const id = Number(planAntena.id);
        const previous = previousStates.get(id) ?? {
            declared: false,
            matched: false,
            bands: [],
            codes: [],
        };
        const current = currentStates.get(id) ?? {
            declared: false,
            matched: false,
            bands: [],
            codes: [],
        };

        if (previous.declared === current.declared) {
            return;
        }

        changes.push({
            id,
            operador: planAntena.operador,
            provincia: planAntena.provincia,
            direccion: planAntena.direccion,
            change: current.declared ? "declara_ahora" : "deja_de_declarar",
            fromDeclared: previous.declared,
            toDeclared: current.declared,
            previousBands: previous.bands,
            currentBands: current.bands,
            previousCodes: previous.codes,
            currentCodes: current.codes,
        });
    });

    const gained = changes.filter((item) => item.change === "declara_ahora").length;
    const lost = changes.filter((item) => item.change === "deja_de_declarar").length;

    const previousRuns = Array.isArray(existingHistory?.runs) ? existingHistory.runs : [];

    const run = {
        generatedAt: currentSnapshot.generatedAt,
        previousSnapshotAt: previousSnapshot?.generatedAt ?? null,
        summary: {
            totalChanges: changes.length,
            gained,
            lost,
        },
        changes,
    };

    const history = {
        updatedAt: currentSnapshot.generatedAt,
        rules: CURRENT_RULES,
        runs: [run, ...previousRuns].slice(0, 30),
    };

    await fs.writeFile(historyPath, JSON.stringify(history, null, 2), "utf8");
    return run;
}

function normalizeRecord(entry, index) {
    if (!Array.isArray(entry) || entry.length < 5) {
        return null;
    }

    const lat = toNumber(entry[0]);
    const lon = toNumber(entry[1]);
    const codes = Array.isArray(entry[2])
        ? entry[2].map((item) => String(item).trim()).filter(Boolean)
        : [];
    const operator = String(entry[3] ?? "").trim();
    const bands = Array.isArray(entry[4])
        ? [...new Set(entry[4].map(sanitizeBand).filter(Boolean))]
        : [];

    if (lat === null || lon === null || operator.length === 0) {
        return null;
    }

    return {
        id: index + 1,
        lat,
        lon,
        operator,
        codes,
        bands,
    };
}

async function main() {
    console.log(`Descargando datos desde ${API_URL} ...`);
    const previousSnapshot = await readJsonIfExists(outputPath);

    const response = await fetch(API_URL, {
        headers: {
            "user-agent": "Mapa-antenas-unico/1.0",
            accept: "application/json, text/plain, */*",
        },
    });

    if (!response.ok) {
        throw new Error(`Error HTTP ${response.status} al consultar la API.`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
        throw new Error("La API no devolvio un array JSON.");
    }

    const records = payload
        .map((entry, index) => normalizeRecord(entry, index))
        .filter(Boolean);

    const output = {
        generatedAt: new Date().toISOString(),
        source: API_URL,
        totalRaw: payload.length,
        total: records.length,
        antenas: records,
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");

    const planSnapshot = await readJsonIfExists(planAntenasPath);
    if (Array.isArray(planSnapshot?.antenas)) {
        const run = await writeHistory(planSnapshot.antenas, previousSnapshot, output);
        console.log(
            `Historial actualizado en ${historyPath} con ${run.summary.totalChanges} cambios (suben ${run.summary.gained}, bajan ${run.summary.lost}).`,
        );
    } else {
        console.warn(
            `No se encontro ${planAntenasPath}; no se pudo generar history.json.`,
        );
    }

    console.log(
        `JSON generado en ${outputPath} con ${records.length} registros validos.`,
    );
}

main().catch((error) => {
    console.error("Error descargando antenasMoviles:", error);
    process.exit(1);
});

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

    console.log(
        `JSON generado en ${outputPath} con ${records.length} registros validos.`,
    );
}

main().catch((error) => {
    console.error("Error descargando antenasMoviles:", error);
    process.exit(1);
});

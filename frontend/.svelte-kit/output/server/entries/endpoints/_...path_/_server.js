import { existsSync, readFileSync } from "fs";
import { join } from "path";
//#region src/routes/[...path]/+server.js
var mimeTypes = {
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".css": "text/css",
	".js": "application/javascript",
	".txt": "text/plain",
	".html": "text/html"
};
function getMimeType(filePath) {
	return mimeTypes[filePath.substring(filePath.lastIndexOf(".")).toLowerCase()] || "application/octet-stream";
}
async function GET({ params }) {
	try {
		const filePath = join(process.cwd(), "public", params.path || "");
		if (!existsSync(filePath)) return new Response("Not Found", { status: 404 });
		const data = readFileSync(filePath);
		const mimeType = getMimeType(filePath);
		return new Response(data, { headers: {
			"Content-Type": mimeType,
			"Cache-Control": "public, max-age=86400"
		} });
	} catch (error) {
		return new Response("Internal Server Error", { status: 500 });
	}
}
//#endregion
export { GET };

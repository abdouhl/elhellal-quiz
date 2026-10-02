import type { APIRoute } from "astro";
import { readdirSync } from "node:fs";

export const prerender = true;

/** Every question picture under /pics/, built at deploy time, for the service worker to save for offline play. */
export const GET: APIRoute = () => {
    const files = readdirSync("public/pics", { recursive: true, withFileTypes: true })
        .filter((f) => f.isFile() && /\.(png|jpe?g|webp|svg)$/.test(f.name))
        .map((f) => `/${f.parentPath.replace(/^public\//, "")}/${f.name}`.replaceAll("\\", "/"))
        .sort();
    return new Response(JSON.stringify(files), { headers: { "Content-Type": "application/json" } });
};

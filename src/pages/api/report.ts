import type { APIRoute } from "astro";
import { questionById } from "../../game/engine";

export const prerender = false;

/** Counts one "this question is wrong" flag: `{ id }`. */
export const POST: APIRoute = async ({ request, locals }) => {
    let body: { id?: unknown };
    try {
        body = await request.json();
    } catch {
        return new Response(null, { status: 400 });
    }
    const { id } = body;
    if (typeof id !== "string" || !questionById(id)) return new Response(null, { status: 400 });

    const db = locals.runtime?.env?.DB;
    if (!db) return new Response(null, { status: 503 });
    await db.prepare("INSERT INTO reports (id, n) VALUES (?1, 1) ON CONFLICT(id) DO UPDATE SET n = n + 1").bind(id).run();
    return new Response(null, { status: 204 });
};

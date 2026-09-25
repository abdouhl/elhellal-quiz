import type { APIRoute } from "astro";
import { questionById } from "../../game/engine";

export const prerender = false;

/** Records one answer and returns the question's running totals: `{ n, ok }`. */
export const POST: APIRoute = async ({ request, locals }) => {
    let body: { id?: unknown; ok?: unknown };
    try {
        body = await request.json();
    } catch {
        return new Response(null, { status: 400 });
    }
    const { id, ok } = body;
    if (typeof id !== "string" || typeof ok !== "boolean" || !questionById(id)) return new Response(null, { status: 400 });

    const db = locals.runtime?.env?.DB;
    if (!db) return new Response(null, { status: 503 });
    const row = await db
        .prepare(
            "INSERT INTO answers (id, n, ok) VALUES (?1, 1, ?2) ON CONFLICT(id) DO UPDATE SET n = n + 1, ok = ok + excluded.ok RETURNING n, ok",
        )
        .bind(id, ok ? 1 : 0)
        .first<{ n: number; ok: number }>();
    return Response.json(row, { headers: { "cache-control": "no-store" } });
};

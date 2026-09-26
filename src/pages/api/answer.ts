import type { APIRoute } from "astro";
import { questionById } from "../../game/engine";

export const prerender = false;

/** Answers a question needs before its correct-answer rate is shared. */
const MIN_ANSWERS = 10;

/**
 * With `?id=`, the question's running totals, `{ n, ok }`, without recording anything.
 * Without it, `{ [id]: percent correct }` for every question with enough answers (the deck's difficulty data).
 */
export const GET: APIRoute = async ({ url, locals }) => {
    const id = url.searchParams.get("id");
    const db = locals.runtime?.env?.DB;
    if (!db) return new Response(null, { status: 503 });
    if (id === null) {
        const { results } = await db.prepare("SELECT id, n, ok FROM answers WHERE n >= ?1").bind(MIN_ANSWERS).all<{ id: string; n: number; ok: number }>();
        const rates = Object.fromEntries(results.map((r) => [r.id, Math.round((100 * r.ok) / r.n)]));
        return Response.json(rates, { headers: { "cache-control": "public, max-age=3600" } });
    }
    if (!questionById(id)) return new Response(null, { status: 400 });
    const row = await db.prepare("SELECT n, ok FROM answers WHERE id = ?1").bind(id).first<{ n: number; ok: number }>();
    return Response.json(row ?? { n: 0, ok: 0 }, { headers: { "cache-control": "public, max-age=60" } });
};

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

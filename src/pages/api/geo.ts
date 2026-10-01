import type { APIRoute } from "astro";

export const prerender = false;

/** The visitor's country (ISO code, from Cloudflare), for suggesting a language; `{}` when unknown. */
export const GET: APIRoute = ({ request, locals }) => {
    const country = locals.runtime?.cf?.country ?? request.headers.get("cf-ipcountry");
    return Response.json(country ? { country } : {}, { headers: { "cache-control": "private, max-age=86400" } });
};

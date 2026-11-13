// The iOS app's question data, one file per language (see src/game/app-export.ts).
import type { APIRoute } from "astro";
import { LANGS } from "../../i18n";
import type { Lang } from "../../i18n";
import { engines } from "../../game/engines";
import { appData } from "../../game/app-export";

export const getStaticPaths = () => LANGS.map((lang) => ({ params: { lang } }));

export const GET: APIRoute = ({ params }) => {
    const lang = params.lang as Lang;
    return Response.json(appData(lang, engines[lang]));
};

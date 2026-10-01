// Ids that answer counts and reports are stored under: a plain question id for Arabic, `<lang>:<id>` otherwise.
import { DEFAULT_LANG, LANGS } from "../i18n";
import type { Lang } from "../i18n";
import { engines } from "./engines";

/** Whether `id` names a question that exists in its language. */
export function isStatId(id: string): boolean {
    const sep = id.indexOf(":");
    if (sep < 0) return !!engines[DEFAULT_LANG].questionById(id);
    const lang = id.slice(0, sep) as Lang;
    return lang !== DEFAULT_LANG && LANGS.includes(lang) && !!engines[lang].questionById(id.slice(sep + 1));
}

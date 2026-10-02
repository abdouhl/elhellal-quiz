// Every language's engine, for build-time pages and the API (client pages load only their own).
import type { Lang } from "../i18n";
import { engine as ar } from "./ar";
import { engine as en } from "./en";
import { engine as es } from "./es";
import type { Engine } from "./engine";

export const engines: Record<Lang, Engine> = { ar, en, es };

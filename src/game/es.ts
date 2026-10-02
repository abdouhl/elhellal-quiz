// The Spanish question set.
import data from "../data/es.json";
import { translatedEngine } from "./translated";
import type { Translation } from "./translated";

export const engine = translatedEngine("es", data as Translation);

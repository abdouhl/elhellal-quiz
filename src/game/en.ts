// The English question set.
import data from "../data/en.json";
import { translatedEngine } from "./translated";
import type { Translation } from "./translated";

export const engine = translatedEngine("en", data as Translation);

// iOS launch screens for the installed app: the logo on black, one PNG per screen size that
// Layout.astro lists. Run once (or after a logo change): bun scripts/build-splash.ts
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SIZES: [number, number][] = [
    [1320, 2868], [1206, 2622], [1290, 2796], [1179, 2556], [1284, 2778], [1170, 2532],
    [1125, 2436], [1242, 2688], [828, 1792], [1242, 2208], [750, 1334], [640, 1136],
    [2048, 2732], [1668, 2388], [1640, 2360], [1620, 2160], [1536, 2048],
];
// the favicon's 32×32 drawing, without its <svg> wrapper
const logo = readFileSync("public/favicon.svg", "utf8").replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, "");

mkdirSync("public/splash", { recursive: true });
for (const [w, h] of SIZES) {
    const size = Math.round(Math.min(w, h) * 0.28);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <rect width="100%" height="100%" fill="#000"/>
        <g transform="translate(${(w - size) / 2} ${(h - size) / 2}) scale(${size / 32})">${logo}</g>
    </svg>`;
    writeFileSync(`public/splash/${w}x${h}.png`, new Resvg(svg).render().asPng());
}
console.log(`${SIZES.length} splash screens in public/splash/`);

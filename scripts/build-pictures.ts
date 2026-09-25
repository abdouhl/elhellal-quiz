// Builds the picture questions: downloads flag images (flagcdn, public domain) and freely licensed
// photos of famous people and landmarks (Wikimedia Commons) into public/pics/, and writes
// src/data/pictures.json with each picture's answer, distractor group and credit line.
// Already-downloaded pictures are kept as they are, so re-running only fetches new entries.
// Run: bun scripts/build-pictures.ts
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "src/data/pictures.json");
const UA = { "User-Agent": "elhellal-quiz/0.1 (https://quiz.elhellal.com)" };

export interface Picture {
    /** flag | face | place */
    k: string;
    /** stable slug, unique within the kind; the question id is `p-<k>-<s>` */
    s: string;
    /** the correct answer (Arabic) */
    a: string;
    /** distractors are drawn from pictures of the same kind and group first */
    g: string;
    /** image path under /pics/ */
    img: string;
    /** attribution, empty for public-domain flags */
    c: string;
    /** source page for the attribution */
    u: string;
}

// --- flags: ISO codes by region (distractors come from the same region, so they look alike) ---
const REGIONS: Record<string, string> = {
    arab: "dz ma tn ly eg sd mr so dj km sa ae qa bh kw om ye iq sy jo lb ps",
    africa: "ao bj bw bf bi cm cv cf td cg cd ci gq er sz et ga gm gh gn gw ke ls lr mg mw ml mu mz na ne ng rw st sn sc sl za ss tz tg ug zm zw",
    asia: "af am az bd bt bn kh cn ge in id ir jp kz kg la my mv mn mm np kp kr pk ph sg lk tj th tl tm tr uz vn",
    europe: "al ad at by be ba bg hr cy cz dk ee fi fr de gr hu is ie it lv li lt lu mt md mc me nl mk no pl pt ro ru sm rs sk si es se ch ua gb va",
    americas: "ag ar bs bb bz bo br ca cl co cr cu dm do ec sv gd gt gy ht hn jm mx ni pa py pe kn lc vc sr tt us uy ve",
    oceania: "au fj ki mh fm nr nz pw pg ws sb to tv vu",
};
// Where the CLDR Arabic name isn't the everyday one.
const FLAG_NAMES: Record<string, string> = {
    ps: "فلسطين",
    va: "الفاتيكان",
    mm: "ميانمار",
    cd: "الكونغو الديمقراطية",
    cg: "الكونغو",
    ci: "ساحل العاج",
    kp: "كوريا الشمالية",
    kr: "كوريا الجنوبية",
    us: "الولايات المتحدة",
    gb: "المملكة المتحدة",
    cz: "التشيك",
    mk: "مقدونيا الشمالية",
    sz: "إسواتيني",
    tl: "تيمور الشرقية",
    fm: "ميكرونيزيا",
    cn: "الصين",
    sa: "السعودية",
    ae: "الإمارات",
};

// --- people and landmarks: [English Wikipedia title, Arabic answer, group, Commons file override?] ---
const FACES: [string, string, string, string?][] = [
    ["Lionel Messi", "ليونيل ميسي", "sport"],
    ["Cristiano Ronaldo", "كريستيانو رونالدو", "sport"],
    ["Mohamed Salah", "محمد صلاح", "sport"],
    ["Riyad Mahrez", "رياض محرز", "sport"],
    ["Zinedine Zidane", "زين الدين زيدان", "sport"],
    ["Karim Benzema", "كريم بنزيمة", "sport"],
    ["Achraf Hakimi", "أشرف حكيمي", "sport"],
    ["Neymar", "نيمار", "sport"],
    ["Kylian Mbappé", "كيليان مبابي", "sport"],
    ["Erling Haaland", "إرلينغ هالاند", "sport"],
    ["Luka Modrić", "لوكا مودريتش", "sport"],
    ["Diego Maradona", "دييغو مارادونا", "sport"],
    ["Pelé", "بيليه", "sport"],
    ["Muhammad Ali", "محمد علي كلاي", "sport"],
    ["Usain Bolt", "يوسين بولت", "sport"],
    ["Roger Federer", "روجر فيدرر", "sport"],
    ["Rafael Nadal", "رافاييل نادال", "sport"],
    ["Michael Jordan", "مايكل جوردان", "sport"],
    ["Ons Jabeur", "أنس جابر", "sport"],
    ["Hicham El Guerrouj", "هشام الكروج", "sport"],
    ["Albert Einstein", "ألبرت أينشتاين", "sci"],
    ["Isaac Newton", "إسحاق نيوتن", "sci"],
    ["Marie Curie", "ماري كوري", "sci"],
    ["Nikola Tesla", "نيكولا تسلا", "sci"],
    ["Charles Darwin", "تشارلز داروين", "sci"],
    ["Stephen Hawking", "ستيفن هوكينغ", "sci"],
    ["Thomas Edison", "توماس إديسون", "sci"],
    ["Galileo Galilei", "غاليليو غاليلي", "sci"],
    ["Ahmed Zewail", "أحمد زويل", "sci"],
    ["Alexander Graham Bell", "ألكسندر غراهام بيل", "sci"],
    ["Louis Pasteur", "لويس باستور", "sci"],
    ["Sigmund Freud", "سيغموند فرويد", "sci"],
    ["Steve Jobs", "ستيف جوبز", "sci"],
    ["Bill Gates", "بيل غيتس", "sci"],
    ["Elon Musk", "إيلون ماسك", "sci"],
    ["Mark Zuckerberg", "مارك زوكربيرغ", "sci"],
    ["Mahatma Gandhi", "المهاتما غاندي", "leader"],
    ["Nelson Mandela", "نيلسون مانديلا", "leader"],
    ["Emir Abdelkader", "الأمير عبد القادر", "leader"],
    ["Omar Mukhtar", "عمر المختار", "leader"],
    ["Gamal Abdel Nasser", "جمال عبد الناصر", "leader"],
    ["Martin Luther King Jr.", "مارتن لوثر كينغ", "leader"],
    ["Winston Churchill", "ونستون تشرشل", "leader"],
    ["Napoleon", "نابليون بونابرت", "leader"],
    ["Abraham Lincoln", "أبراهام لينكولن", "leader"],
    ["Houari Boumédiène", "هواري بومدين", "leader"],
    ["Mustafa Kemal Atatürk", "مصطفى كمال أتاتورك", "leader"],
    ["Che Guevara", "تشي غيفارا", "leader"],
    ["Larbi Ben M'hidi", "العربي بن مهيدي", "leader"],
    ["Abdelhamid Ben Badis", "عبد الحميد بن باديس", "leader"],
    ["Umm Kulthum", "أم كلثوم", "art"],
    ["Fairuz", "فيروز", "art"],
    ["Abdel Halim Hafez", "عبد الحليم حافظ", "art"],
    ["Warda Al-Jazairia", "وردة الجزائرية", "art"],
    ["Khaled (musician)", "الشاب خالد", "art"],
    ["Mohammed Abdel Wahab", "محمد عبد الوهاب", "art"],
    ["Michael Jackson", "مايكل جاكسون", "art"],
    ["Bob Marley", "بوب مارلي", "art"],
    ["Charlie Chaplin", "تشارلي تشابلن", "art"],
    ["Omar Sharif", "عمر الشريف", "art"],
    ["Adel Emam", "عادل إمام", "art"],
    ["Pablo Picasso", "بابلو بيكاسو", "art"],
    ["Vincent van Gogh", "فينسنت فان غوخ", "art"],
    ["Naguib Mahfouz", "نجيب محفوظ", "lit"],
    ["Mahmoud Darwish", "محمود درويش", "lit"],
    ["Taha Hussein", "طه حسين", "lit"],
    ["Nizar Qabbani", "نزار قباني", "lit"],
    ["Kahlil Gibran", "جبران خليل جبران", "lit"],
    ["Ahmed Shawqi", "أحمد شوقي", "lit"],
    ["Kateb Yacine", "كاتب ياسين", "lit"],
    ["Malek Bennabi", "مالك بن نبي", "lit"],
    ["William Shakespeare", "ويليام شكسبير", "lit"],
    ["Victor Hugo", "فيكتور هوغو", "lit"],
    ["Leo Tolstoy", "ليو تولستوي", "lit"],
    ["Fyodor Dostoevsky", "فيودور دوستويفسكي", "lit"],
    ["Ernest Hemingway", "إرنست همنغواي", "lit"],
];

const PLACES: [string, string, string, string?][] = [
    ["Eiffel Tower", "برج إيفل", "tower"],
    ["Big Ben", "ساعة بيغ بن", "tower"],
    ["Burj Khalifa", "برج خليفة", "tower"],
    ["Leaning Tower of Pisa", "برج بيزا المائل", "tower"],
    ["Burj Al Arab", "برج العرب", "tower"],
    ["Petronas Towers", "برجا بتروناس", "tower"],
    ["Empire State Building", "مبنى إمباير ستيت", "tower"],
    ["Maqam Echahid", "مقام الشهيد", "tower"],
    ["Statue of Liberty", "تمثال الحرية", "tower"],
    ["Christ the Redeemer (statue)", "تمثال المسيح الفادي", "tower"],
    ["Hassan II Mosque", "مسجد الحسن الثاني", "mosque"],
    ["Dome of the Rock", "قبة الصخرة", "mosque"],
    ["Sultan Ahmed Mosque", "المسجد الأزرق", "mosque"],
    ["Hagia Sophia", "آيا صوفيا", "mosque"],
    ["Sheikh Zayed Grand Mosque", "جامع الشيخ زايد", "mosque"],
    ["Great Mosque of Kairouan", "جامع عقبة بن نافع", "mosque"],
    ["Koutoubia Mosque", "مسجد الكتبية", "mosque"],
    ["Umayyad Mosque", "الجامع الأموي", "mosque"],
    ["Taj Mahal", "تاج محل", "mosque"],
    ["Saint Basil's Cathedral", "كاتدرائية القديس باسيل", "palace"],
    ["Sagrada Família", "ساغرادا فاميليا", "palace"],
    ["Alhambra", "قصر الحمراء", "palace"],
    ["Neuschwanstein Castle", "قلعة نويشفانشتاين", "palace"],
    ["Forbidden City", "المدينة المحرمة", "palace"],
    ["Moscow Kremlin", "الكرملين", "palace"],
    ["Louvre", "متحف اللوفر", "palace"],
    ["Mont-Saint-Michel", "جبل سان ميشيل", "palace"],
    ["Giza pyramid complex", "أهرامات الجيزة", "ancient"],
    ["Great Sphinx of Giza", "أبو الهول", "ancient"],
    ["Colosseum", "الكولوسيوم", "ancient"],
    ["Petra", "البتراء", "ancient"],
    ["Parthenon", "البارثينون", "ancient"],
    ["Stonehenge", "ستونهنج", "ancient"],
    ["Angkor Wat", "أنغكور وات", "ancient"],
    ["Chichen Itza", "تشيتشن إيتزا", "ancient"],
    ["Machu Picchu", "ماتشو بيتشو", "ancient"],
    ["Timgad", "تيمقاد", "ancient"],
    ["Abu Simbel", "معبد أبو سمبل", "ancient"],
    ["Great Wall of China", "سور الصين العظيم", "ancient"],
    ["Sydney Opera House", "دار أوبرا سيدني", "modern"],
    ["Golden Gate Bridge", "جسر البوابة الذهبية", "modern"],
    ["Tower Bridge", "جسر البرج", "modern"],
    ["Arc de Triomphe", "قوس النصر", "modern"],
    ["Brandenburg Gate", "بوابة براندنبورغ", "modern"],
    ["Mount Rushmore", "جبل راشمور", "modern"],
    ["Mount Fuji", "جبل فوجي", "nature"],
    ["Niagara Falls", "شلالات نياغارا", "nature"],
    ["Grand Canyon", "الأخدود العظيم", "nature"],
    ["Mount Everest", "جبل إفرست", "nature"],
    ["Victoria Falls", "شلالات فيكتوريا", "nature"],
];

const slugify = (s: string) =>
    s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/\(.*?\)/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<any> {
    for (let attempt = 0; ; attempt++) {
        const res = await fetch(url, { headers: UA });
        if (res.ok) return res.json();
        if (attempt >= 3 || res.status < 429) throw new Error(`${res.status} ${url}`);
        await sleep(2000 * (attempt + 1));
    }
}

async function download(url: string, file: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
        const res = await fetch(url, { headers: UA });
        if (res.ok) {
            mkdirSync(path.dirname(file), { recursive: true });
            writeFileSync(file, Buffer.from(await res.arrayBuffer()));
            return;
        }
        if (attempt >= 3 || res.status < 429) throw new Error(`${res.status} ${url}`);
        await sleep(2000 * (attempt + 1));
    }
}

const stripHtml = (s: string) =>
    s
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

/** The article's lead image on Commons, with a 500px thumbnail and its attribution; null if it isn't freely licensed. */
async function commonsImage(title: string, override?: string) {
    let file = override;
    if (!file) {
        const q = await getJson(
            `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=name&titles=${encodeURIComponent(title)}`,
        );
        file = (Object.values(q.query.pages)[0] as { pageimage?: string }).pageimage;
        if (!file) return null;
    }
    const q = await getJson(
        `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=500` +
            `&iiextmetadatafilter=Artist|LicenseShortName|NonFree&titles=${encodeURIComponent(`File:${file}`)}`,
    );
    const page = Object.values(q.query.pages)[0] as { missing?: string; imageinfo?: any[] };
    const info = page.imageinfo?.[0];
    // Files missing from Commons are local non-free uploads on Wikipedia (fair use) — not ours to reuse.
    if (page.missing !== undefined || !info) return null;
    const meta = info.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value ?? "");
    if (!license || meta.NonFree?.value === "true") return null;
    if (!/^image\/(jpeg|png)$/.test(info.mime)) return null;
    const artist = stripHtml(meta.Artist?.value ?? "").slice(0, 60) || "Wikimedia Commons";
    return { thumb: info.thumburl as string, ext: info.mime === "image/png" ? "png" : "jpg", credit: `${artist} · ${license}`, page: info.descriptionurl as string };
}

const existing: Picture[] = existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, "utf8")) : [];
const have = new Map(existing.map((p) => [`${p.k}:${p.s}`, p]));
const out: Picture[] = [];
const skipped: string[] = [];
const keep = (p: Picture) => existsSync(path.join(root, "public/pics", p.img));

// Flags
const names = new Intl.DisplayNames("ar", { type: "region" });
for (const [region, codes] of Object.entries(REGIONS)) {
    for (const code of codes.split(" ")) {
        const prev = have.get(`flag:${code}`);
        const img = `flag/${code}.png`;
        if (!prev || !keep(prev)) await download(`https://flagcdn.com/w320/${code}.png`, path.join(root, "public/pics", img));
        out.push({ k: "flag", s: code, a: FLAG_NAMES[code] ?? names.of(code.toUpperCase())!, g: region, img, c: "", u: "" });
    }
}

// People and places
for (const [kind, list] of [
    ["face", FACES],
    ["place", PLACES],
] as const) {
    for (const [title, answer, group, override] of list) {
        const s = slugify(title);
        const prev = have.get(`${kind}:${s}`);
        if (prev && keep(prev) && !override) {
            out.push({ ...prev, a: answer, g: group });
            continue;
        }
        const found = await commonsImage(title, override);
        await sleep(300);
        if (!found) {
            skipped.push(`${kind}: ${title}`);
            continue;
        }
        const img = `${kind}/${s}.${found.ext}`;
        await download(found.thumb, path.join(root, "public/pics", img));
        // Shrink to what the card shows (macOS sips; elsewhere the 500px thumbnail is kept).
        spawnSync("sips", ["-Z", "420", "-s", "formatOptions", "72", path.join(root, "public/pics", img)], { stdio: "ignore" });
        out.push({ k: kind, s, a: answer, g: group, img, c: found.credit, u: found.page });
        console.log(`${kind}: ${title} → ${found.credit}`);
    }
}

// Two entries with the same answer would make a question with two right options.
const answers = new Set<string>();
for (const p of out) {
    const key = `${p.k}:${p.a}`;
    if (answers.has(key)) throw new Error(`duplicate answer ${key}`);
    answers.add(key);
}

writeFileSync(dataPath, `[\n${out.map((p) => JSON.stringify(p)).join(",\n")}\n]\n`);
const count = (k: string) => out.filter((p) => p.k === k).length;
console.log(`pictures: ${count("flag")} flags, ${count("face")} people, ${count("place")} places`);
if (skipped.length) console.log(`skipped (no free image):\n  ${skipped.join("\n  ")}`);

/**
 * Game-show quiz videos from the quiz bank.
 *
 * Single question (TikTok / Shorts / Reels + X):
 *   bun run video                       # a random question not used before → vertical + square (X) versions
 *   bun run video --cat flag            # from one category (geo, sci, hist, gen, lang, lit, quote, flag, face, place, tf, first, more)
 *   bun run video --id b5               # a specific question id (as in /q/<id>/ on the site)
 *   bun run video --count 3             # several in one go
 *   bun run video --formats vertical    # pick formats: vertical, square, landscape (comma-separated)
 *
 * Long YouTube video (16:9 marathon with intro, chapters, outro and a thumbnail):
 *   bun run video --long                # 20 questions
 *   bun run video --long 30 --timer 7   # 30 questions, 7-second countdowns
 *   bun run video --long 25 --cat geo   # all from one category
 *
 * Common: --no-voice (music and effects only), --out <folder> (default ~/Desktop/quiz-videos).
 *
 * Voice: ElevenLabs. Set ELEVENLABS_API_KEY (and optionally ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL)
 * in video/.env. Lines are cached in video/.tts-cache so re-renders don't spend credits.
 * Visuals: Remotion (video/src). Preview and tweak them live with `bun run video:studio`.
 */
import { $ } from "bun";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CATEGORY_ICONS, CATEGORY_LABELS, allQuestionIds, questionById, questionTitle, type Category, type Question } from "../src/game/engine";
import { SR, music, sfx, wav, type Stereo, type Timeline } from "./audio";
import type { Format, QuizProps } from "./src/Quiz";
import type { MarathonProps } from "./src/Marathon";

const HERE = import.meta.dir;
const HISTORY = join(HERE, "used.json");
const CACHE = join(HERE, ".tts-cache");
const SITE = "quiz.elhellal.com";

// ---------- options ----------

const argv = process.argv.slice(2);
const arg = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
};
const outDir = resolve((arg("out") ?? join(homedir(), "Desktop/quiz-videos")).replace(/^~/, homedir()));
const count = Math.max(1, Number(arg("count") ?? 1));
const onlyCat = arg("cat") as Category | undefined;
const onlyId = arg("id");
const longMode = argv.includes("--long");
const longN = Math.max(3, Number(/^\d+$/.test(arg("long") ?? "") ? arg("long") : 20));
const formats = (arg("formats") ?? "vertical,square").split(",") as Format[];
const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const voiceOn = !argv.includes("--no-voice");

if (onlyCat && !(onlyCat in CATEGORY_LABELS)) throw new Error(`Unknown category "${onlyCat}". Try: ${Object.keys(CATEGORY_LABELS).join(", ")}`);
for (const f of formats) if (!["vertical", "square", "landscape"].includes(f)) throw new Error(`Unknown format "${f}"`);
if ((await $`which ffmpeg`.nothrow().quiet()).exitCode !== 0) throw new Error("ffmpeg is missing: brew install ffmpeg");
if (voiceOn && !API_KEY) throw new Error("Set ELEVENLABS_API_KEY in video/.env (or pass --no-voice).");

// ---------- question choice ----------

interface History { videos: { n: number; id: string; date: string }[]; long?: { date: string; ids: string[] }[] }
const history: History = existsSync(HISTORY) ? JSON.parse(readFileSync(HISTORY, "utf8")) : { videos: [] };
history.long ??= [];
const saveHistory = () => writeFileSync(HISTORY, `${JSON.stringify(history, null, 2)}\n`);

/** Categories that read well on video (guess-the-year needs a slider, so it stays out). */
const VIDEO_CATS = (Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => c !== "year");
/** Long quotes and wordy options don't fit at a readable size. */
const fits = (q: Question) => q.text.length <= 140 && q.options.every((o) => o.length <= 34);

/** `n` unused questions, rotating through random categories so the same one never comes twice in a row. */
function choose(n: number, used: Set<string>): Question[] {
    if (onlyId) {
        const q = questionById(onlyId);
        if (!q) throw new Error(`No question with id "${onlyId}"`);
        return [q];
    }
    const pool = new Map<Category, string[]>();
    for (const [id, c] of allQuestionIds()) {
        if (used.has(id) || !VIDEO_CATS.includes(c) || (onlyCat && c !== onlyCat)) continue;
        pool.set(c, [...(pool.get(c) ?? []), id]);
    }
    const picked: Question[] = [];
    let last: Category | null = null;
    for (let tries = 0; picked.length < n && tries < n * 50; tries++) {
        const cats = [...pool.keys()].filter((c) => pool.get(c)!.length && (c !== last || pool.size === 1));
        if (!cats.length) break;
        const c = cats[Math.floor(Math.random() * cats.length)];
        const ids = pool.get(c)!;
        const id = ids.splice(Math.floor(Math.random() * ids.length), 1)[0];
        const q = questionById(id)!;
        if (!fits(q)) continue;
        picked.push(q);
        last = c;
    }
    if (picked.length < n) throw new Error(`Only ${picked.length} unused questions left for these filters.`);
    return picked;
}

// ---------- copy ----------

const TINTS: Partial<Record<Category, string>> = {
    geo: "#1fb5a8", sci: "#3d7eff", hist: "#d4a24c", gen: "#ffcc33", lang: "#e0568f", lit: "#a06cff",
    quote: "#a06cff", flag: "#e0453d", face: "#ff6a3d", place: "#1fb5a8", tf: "#3d7eff", first: "#d4a24c", more: "#1fb5a8",
};

/** On-screen hook (second half of the first line is highlighted) and what the narrator says. */
const HOOKS: { screen: [string, string]; say: string }[] = [
    { screen: ["سؤال سريع… هل تعرف الجواب؟", "عندك ٥ ثوانٍ فقط ⏱️"], say: "سؤال سريع! هل تعرف الجواب؟" },
    { screen: ["لا تبحث في جوجل! أجب من رأسك 🧠", "٥ ثوانٍ… ابدأ"], say: "لا تبحث في جوجل! أجب من رأسك." },
    { screen: ["اختبر ثقافتك في ٥ ثوانٍ", "هل تستطيع؟ 🤔"], say: "اختبر ثقافتك في خمس ثوانٍ!" },
    { screen: ["سؤال واحد… وخمس ثوانٍ فقط", "هل أنت مستعد؟ 🔥"], say: "سؤال واحد، وخمس ثوانٍ فقط. هل أنت مستعد؟" },
];

/** What the narrator reads for the question; the displayed text sits at `offset` inside it. */
function spokenQuestion(q: Question): { text: string; offset: number } {
    if (q.isQuote) return { text: `من قال: «${q.text}»؟`, offset: "من قال: «".length };
    if (q.claim) return { text: `${q.text} «${q.claim}». صح أم خطأ؟`, offset: 0 };
    if (q.options.length === 2) return { text: `${q.text.replace(/؟$/, "")}: ${q.options[0]}، أم ${q.options[1]}؟`, offset: 0 };
    return { text: q.text, offset: 0 };
}

function spokenAnswer(q: Question): string {
    const a = q.options[q.answer];
    if (q.claim) return a === "صح" ? "صح! إجابة صحيحة." : `خطأ! ${q.reveal ?? ""}`;
    return `الإجابة الصحيحة: ${a}!`;
}

function fact(q: Question, marathon: boolean): [string, string] {
    const a = q.options[q.answer];
    if (q.claim) return [`الإجابة: ${a === "صح" ? "صح ✓" : "خطأ ✗"}`, q.reveal ?? ""];
    if (q.reveal) return [`✓ ${a}`, q.reveal];
    return [`✓ ${a}`, marathon ? "أصبت؟ أضف نقطة إلى رصيدك ✍️" : "هل عرفتها؟ اكتب 🔥 في التعليقات إذا أصبت!"];
}

const HASHTAGS = ["#اختبار", "#معلومات_عامة", "#سؤال_وجواب", "#تحدي", "#ثقافة_عامة", "#quiz"];
const CAT_TAGS: Partial<Record<Category, string>> = {
    geo: "#جغرافيا", sci: "#علوم", hist: "#تاريخ", lang: "#اللغة_العربية", lit: "#كتب", quote: "#اقتباسات",
    flag: "#أعلام_الدول", face: "#مشاهير", place: "#معالم", tf: "#صح_أم_خطأ",
};
const credits = (qs: Question[]) => qs.filter((q) => q.credit).map((q) => `📷 ${q.credit}${q.creditUrl ? ` (${q.creditUrl})` : ""}`);

function post(q: Question, n: number): string {
    const title = questionTitle(q);
    const tags = [CAT_TAGS[q.category], ...HASHTAGS].filter(Boolean).join(" ");
    const ytTitle = `${title.length > 70 ? `${title.slice(0, 68)}…` : title} | سؤال #${n} #Shorts`;
    const credit = credits([q]).map((c) => `\n${c}`).join("");
    const link = `https://${SITE}/q/${q.id}/`;
    // X counts every link as 23 characters; keep the whole tweet within 280.
    const tweetTitle = title.length > 150 ? `${title.slice(0, 148)}…` : title;
    return `=== TikTok / Reels ===
${title} 🤔 عندك ٥ ثوانٍ! اكتب إجابتك 👇
العب أسئلة بلا نهاية: ${SITE}
${tags}${credit}

=== X / Twitter (square video) ===
${tweetTitle} 🤔
عندك ٥ ثوانٍ… اكتب إجابتك قبل أن تشاهد الحل 👇

العب المزيد: ${link}
#اختبار #معلومات_عامة

=== YouTube Shorts ===
Title:
${ytTitle}

Description:
${title}
عندك ٥ ثوانٍ… اكتب إجابتك في التعليقات 👇 الإجابة في آخر الفيديو.

🎮 العب السؤال على الموقع: ${link}
♾️ اختبار لا ينتهي + تحدٍّ يومي: https://${SITE}/${credit}

${tags} #Shorts

Tags:
${[CATEGORY_LABELS[q.category], "اختبار", "معلومات عامة", "سؤال وجواب", "ثقافة عامة", "تحدي", "quiz", "arabic quiz"].join(", ")}
`;
}

// ---------- voice (ElevenLabs) ----------

interface Line { file: string; dur: number; /** start time (s) of each character of the spoken text */ chars: number[] }

async function speak(text: string, work: string): Promise<Line> {
    mkdirSync(CACHE, { recursive: true });
    const key = createHash("sha1").update(`${VOICE_ID}|${MODEL}|${text}`).digest("hex").slice(0, 16);
    const mp3 = join(CACHE, `${key}.mp3`), meta = join(CACHE, `${key}.json`);
    if (!existsSync(mp3)) {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_192`, {
            method: "POST",
            headers: { "xi-api-key": API_KEY!, "content-type": "application/json" },
            body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.38, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true } }),
        });
        if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
        const body = (await res.json()) as { audio_base64: string; alignment?: { character_start_times_seconds: number[] } };
        writeFileSync(mp3, Buffer.from(body.audio_base64, "base64"));
        writeFileSync(meta, JSON.stringify(body.alignment?.character_start_times_seconds ?? []));
    }
    const out = join(work, `v-${key}.wav`);
    // No silence trimming: the timestamps are relative to the start of the file.
    await $`ffmpeg -loglevel error -y -i ${mp3} -af ${"aresample=48000,highpass=f=70,acompressor=threshold=-18dB:ratio=2.5:attack=5:release=90:makeup=1.5,loudnorm=I=-16:TP=-2"} -ac 1 ${out}`.quiet();
    const dur = Number((await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${out}`.text()).trim());
    return { file: out, dur, chars: JSON.parse(readFileSync(meta, "utf8")) };
}

/** Start time of each displayed word: from the voice's character timestamps, or evenly paced without voice. */
function wordTimes(q: Question, line: Line | null, at: number, offset: number): number[] {
    const starts: number[] = [];
    let pos = 0;
    for (const w of q.text.split(" ")) {
        const t = line?.chars[offset + pos];
        starts.push(t !== undefined ? at + t : NaN);
        pos += w.length + 1;
    }
    if (starts.every((x) => !Number.isNaN(x))) return starts;
    return starts.map((_, i) => at + i * 0.2);
}

// ---------- building blocks ----------

/** Voice lines placed on the timeline: [line, start seconds]. */
type Cue = [Line, number];

/** One question's timeline, props and voice cues. `qIn` is when the question appears (after the hook or counter). */
async function segment(q: Question, work: string, o: { qIn: number; cdLen: number; marathon: boolean }) {
    const spoken = spokenQuestion(q);
    const vq = voiceOn ? await speak(spoken.text, work) : null;
    const va = voiceOn ? await speak(spokenAnswer(q), work) : null;
    const { qIn, cdLen } = o;
    const qSay = qIn + 0.35;
    const words = wordTimes(q, vq, qSay, spoken.offset);
    const optsIn = q.options.map((_, i) => Math.max(qIn + 1.0, Math.min(words.at(-1)! + 0.3, qSay + 2.2)) + i * 0.2);
    const qEnd = vq ? qSay + vq.dur : words.at(-1)! + 0.6;
    const cdStart = Math.max(qEnd + 0.3, optsIn.at(-1)! + 0.6);
    const reveal = cdStart + cdLen;
    const aSay = reveal + 0.55;
    const [factH, factP] = fact(q, o.marathon);
    const settled = Math.max(aSay + (va?.dur ?? 1.5) + (o.marathon ? 0.9 : 1.2), reveal + 3.2 + Math.min(1.5, factP.length * 0.02));
    const T: Timeline = { qIn, optsIn, cdStart, cdLen, reveal, fact: reveal + 0.85, cta: settled, end: settled };
    const cues: Cue[] = [];
    if (vq) cues.push([vq, qSay]);
    if (va) cues.push([va, aSay]);
    const props: Omit<QuizProps, "format"> = {
        q: {
            text: q.text, words, isQuote: q.isQuote, options: q.options, answer: q.answer, claim: q.claim,
            label: CATEGORY_LABELS[q.category], icon: CATEGORY_ICONS[q.category], kind: q.category,
            image: q.image?.replace(/^\//, ""), credit: q.credit,
        },
        tint: TINTS[q.category] ?? "#ff8c00", fact: [factH, factP], T,
    };
    return { T, props, cues };
}

function concat(parts: Stereo[]): Stereo {
    const n = parts.reduce((a, p) => a + p[0].length, 0);
    const out: Stereo = [new Float32Array(n), new Float32Array(n)];
    let at = 0;
    for (const p of parts) {
        out[0].set(p[0], at);
        out[1].set(p[1], at);
        at += p[0].length;
    }
    return out;
}

/** Mixes music + sfx stems with voice cues (voice ducks the music) and masters to -14 LUFS. */
async function mixAudio(work: string, cues: Cue[], end: number): Promise<string> {
    const out = join(work, "mix.wav");
    const inputs = ["-i", join(work, "music.wav"), "-i", join(work, "sfx.wav"), ...cues.flatMap(([l]) => ["-i", l.file])];
    let graph = `[0:a]loudnorm=I=-22:TP=-3[m0];[1:a]loudnorm=I=-21:TP=-3[s0];`;
    if (cues.length) {
        graph += cues.map(([, at], i) => `[${i + 2}:a]adelay=${Math.round(at * 1000)}:all=1,aformat=channel_layouts=stereo[v${i}];`).join("");
        graph += `${cues.map((_, i) => `[v${i}]`).join("")}amix=inputs=${cues.length}:normalize=0,apad[vox];[vox]asplit[vx][key];`;
        graph += `[m0][key]sidechaincompress=threshold=0.015:ratio=10:attack=20:release=400[md];`;
        graph += `[md][s0][vx]amix=inputs=3:normalize=0:weights=0.9 0.8 1.3`;
    } else {
        graph += `[m0][s0]amix=inputs=2:normalize=0:weights=1 0.85`;
    }
    graph += `,atrim=0:${end},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`;
    await $`ffmpeg -loglevel error -y ${inputs} -filter_complex ${graph} -map [a] -c:a pcm_s16le ${out}`;
    return out;
}

async function render(comp: string, props: object, work: string, out: string, audio: string) {
    const propsFile = join(work, `${comp}-props.json`);
    writeFileSync(propsFile, JSON.stringify(props));
    const silent = join(work, `${comp}-silent.mp4`);
    await $`npx remotion render src/index.ts ${comp} ${silent} --props=${propsFile} --public-dir=../public --muted --concurrency=${cpus().length} --crf=17 --jpeg-quality=95 --log=error`.cwd(HERE);
    await $`ffmpeg -loglevel error -y -i ${silent} -i ${audio} -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -movflags +faststart -shortest ${out}`;
}

async function still(comp: string, props: object, work: string, out: string, frame = 0) {
    const propsFile = join(work, `${comp}-still.json`);
    writeFileSync(propsFile, JSON.stringify(props));
    await $`npx remotion still src/index.ts ${comp} ${out} --props=${propsFile} --public-dir=../public --frame=${frame} --image-format=jpeg --jpeg-quality=90 --log=error`.cwd(HERE);
}

// ---------- single question ----------

async function single() {
    const [q] = choose(1, new Set(history.videos.map((v) => v.id)));
    const n = (history.videos.at(-1)?.n ?? 0) + 1;
    const seed = Math.floor(Math.random() * 2 ** 31);
    const hook = HOOKS[Math.floor(Math.random() * HOOKS.length)];
    const dir = join(outDir, `${String(n).padStart(3, "0")}-${q.id}`);
    const work = mkdtempSync(join(tmpdir(), "quiz-video-"));
    mkdirSync(dir, { recursive: true });
    console.log(`\n▶ #${n}  [${q.category}] ${questionTitle(q)}  →  ${q.options[q.answer]}`);

    const vHook = voiceOn ? await speak(hook.say, work) : null;
    const vCta = voiceOn ? await speak("تابعنا… سؤال جديد كل يوم!", work) : null;
    const seg = await segment(q, work, { qIn: Math.max(2.0, (vHook?.dur ?? 1.5) + 0.45), cdLen: 5, marathon: false });
    const T = seg.T;
    T.cta = seg.T.end;
    const ctaSay = T.cta + 0.5;
    T.end = Math.ceil((Math.max(ctaSay + (vCta?.dur ?? 1.8), T.cta + 2.6) + 0.8) * 10) / 10;
    const cues: Cue[] = [...(vHook ? [[vHook, 0.2] as Cue] : []), ...seg.cues, ...(vCta ? [[vCta, ctaSay] as Cue] : [])];

    await Bun.write(join(work, "music.wav"), wav(music(T, seed)));
    await Bun.write(join(work, "sfx.wav"), wav(sfx(T, seed)));
    const audio = await mixAudio(work, cues, T.end);

    const files: Record<Format, string> = { vertical: "vertical.mp4", square: "square-x.mp4", landscape: "landscape.mp4" };
    for (const format of formats) {
        const props: QuizProps = { ...seg.props, format, episode: n, hook: hook.screen };
        await render("Quiz", props, work, join(dir, files[format]), audio);
        if (format === formats[0]) await still("Quiz", props, work, join(dir, "cover.jpg"), Math.round((T.cdStart + 0.8) * 60));
        console.log(`  ✓ ${format}`);
    }
    writeFileSync(join(dir, "post.txt"), post(q, n));
    rmSync(work, { recursive: true, force: true });
    history.videos.push({ n, id: q.id, date: new Date().toISOString().slice(0, 10) });
    saveHistory();
    console.log(`  ✓ ${T.end.toFixed(1)}s → ${dir}`);
    return join(dir, files[formats[0]]);
}

// ---------- long YouTube marathon ----------

/** Thumbnail card: a flag or landmark question with its own options (never a person's face), else a short text question. */
function thumbProps(qs: Question[], topic: string) {
    const q = qs.find((x) => x.category === "flag") ?? qs.find((x) => x.category === "place") ?? qs.find((x) => !x.image && x.options.length === 4 && x.text.length < 60) ?? qs[0];
    return { n: qs.length, topic, image: q.category === "face" ? undefined : q.image?.replace(/^\//, ""), sample: { text: q.text, options: q.options, answer: q.answer } };
}

const clock = (s: number) => {
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};

async function marathon() {
    const used = new Set(history.long!.flatMap((l) => l.ids));
    const qs = choose(longN, used);
    const timer = Math.max(3, Number(arg("timer") ?? 7));
    const topic = onlyCat ? `في ${CATEGORY_LABELS[onlyCat]}` : "في الثقافة العامة";
    const seed = Math.floor(Math.random() * 2 ** 31);
    const date = new Date().toISOString().slice(0, 10);
    const dir = join(outDir, `long-${date}-${longN}q${onlyCat ? `-${onlyCat}` : ""}`);
    const work = mkdtempSync(join(tmpdir(), "quiz-long-"));
    mkdirSync(dir, { recursive: true });
    console.log(`\n▶ Marathon: ${longN} questions ${topic}, ${timer}s each`);

    const cues: Cue[] = [];
    const musicParts: Stereo[] = [], sfxParts: Stereo[] = [];
    const add = (T: Timeline, at: number, segCues: Cue[]) => {
        musicParts.push(music(T, seed, { fade: false }));
        sfxParts.push(sfx(T, seed));
        for (const [l, t] of segCues) cues.push([l, at + t]);
    };
    // A plain groove section of `dur` seconds (intro/outro); `chimeAt` rings the end-card chime.
    const groove = (dur: number, chimeAt = dur + 60): Timeline => ({ qIn: 0, optsIn: [], cdStart: dur, cdLen: 0, reveal: dur + 60, fact: dur + 60, cta: chimeAt, end: dur });
    const snap = (s: number) => Math.round(s * 30) / 30; // keep segments on frame boundaries

    // Intro
    const vIntro = voiceOn ? await speak(`${longN} سؤالاً ${topic}! احسب نقاطك… ولنبدأ!`, work) : null;
    const intro = snap(Math.max(6, (vIntro?.dur ?? 0) + 3.2));
    add(groove(intro), 0, vIntro ? [[vIntro, 0.6]] : []);

    // Questions
    const segments: MarathonProps["segments"] = [];
    let at = intro;
    for (const [i, q] of qs.entries()) {
        process.stdout.write(`\r  voice ${i + 1}/${qs.length}`);
        const seg = await segment(q, work, { qIn: 1.0, cdLen: timer, marathon: true });
        seg.T.end = snap(seg.T.end);
        seg.T.cta = seg.T.end + 60;
        segments.push({ from: at, dur: seg.T.end, quiz: { ...seg.props, format: "landscape", counter: { i: i + 1, n: longN } } });
        add(seg.T, at, seg.cues);
        at += seg.T.end;
    }
    process.stdout.write("\n");

    // Outro
    const vOutro = voiceOn ? await speak("كم كانت نتيجتك؟ اكتبها في التعليقات، ولا تنسَ الاشتراك!", work) : null;
    const outroDur = snap(Math.max(11, (vOutro?.dur ?? 0) + 7));
    const outro = { from: at, dur: outroDur };
    add(groove(outroDur, Math.max(4.2, outroDur - 5.5)), at, vOutro ? [[vOutro, 0.5]] : []);
    const end = at + outroDur;

    const fadeOut = (x: Stereo) => {
        for (let ch = 0; ch < 2; ch++) for (let i = 0; i < x[ch].length; i++) x[ch][i] *= Math.min(1, i / (0.1 * SR), (x[ch].length - i) / (1.5 * SR));
        return x;
    };
    await Bun.write(join(work, "music.wav"), wav(fadeOut(concat(musicParts))));
    await Bun.write(join(work, "sfx.wav"), wav(concat(sfxParts)));
    const audio = await mixAudio(work, cues, end);

    const props: MarathonProps = { format: "landscape", n: longN, timer, topic, intro, segments, outro, end };
    console.log(`  rendering ${clock(end)} of video…`);
    await render("Marathon", props, work, join(dir, "video.mp4"), audio);
    await still("Thumb", thumbProps(qs, topic), work, join(dir, "thumbnail.jpg"));

    // YouTube copy with chapters (the first must be 0:00).
    const chapters = ["0:00 المقدمة", ...segments.map((s, i) => `${clock(s.from)} سؤال ${i + 1} — ${CATEGORY_LABELS[qs[i].category]}`), `${clock(outro.from)} النتيجة`];
    const tags = [...new Set(qs.map((q) => CAT_TAGS[q.category]).filter(Boolean))].slice(0, 4).join(" ");
    const cr = credits(qs);
    writeFileSync(
        join(dir, "post.txt"),
        `=== YouTube ===
Title:
${longN} سؤالاً ${topic} 🧠 هل تستطيع الإجابة عليها كلها؟ | اختبار الهلال

Description:
${longN} سؤالاً ${topic}، ولكل سؤال ${timer} ثوانٍ فقط ⏱️
احسب نقاطك واكتب نتيجتك في التعليقات 👇

🎮 العب بلا توقف: https://${SITE}/
📅 تحدٍّ جديد كل يوم: https://${SITE}/daily/

الفصول:
${chapters.join("\n")}
${cr.length ? `\nحقوق الصور:\n${cr.join("\n")}\n` : ""}
#اختبار #معلومات_عامة #سؤال_وجواب #ثقافة_عامة ${tags}

Tags:
${["اختبار", "اسئلة ثقافية", "معلومات عامة", "سؤال وجواب", "ثقافة عامة", "تحدي", "مسابقة", "quiz", "arabic quiz", ...new Set(qs.map((q) => CATEGORY_LABELS[q.category]))].join(", ")}

=== Answers (for pinning a comment, optional) ===
${qs.map((q, i) => `${i + 1}. ${q.options[q.answer]}`).join("\n")}
`,
    );
    rmSync(work, { recursive: true, force: true });
    history.long!.push({ date, ids: qs.map((q) => q.id) });
    saveHistory();
    console.log(`  ✓ ${clock(end)} → ${dir}`);
    return join(dir, "video.mp4");
}

let last = "";
if (longMode) last = await marathon();
else for (let i = 0; i < count; i++) last = await single();
if (process.platform === "darwin" && (longMode || count === 1)) await $`open ${last}`.nothrow();

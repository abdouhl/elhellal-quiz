import React from "react";
import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ACCENT, Background, EndCard, Quiz, ar, layout, type Format, type QuizProps } from "./Quiz";

export type MarathonProps = {
    format: Format;
    n: number;
    /** seconds per countdown */
    timer: number;
    topic: string;
    intro: number;
    /** question segments, back to back after the intro (seconds) */
    segments: { from: number; dur: number; quiz: QuizProps }[];
    outro: { from: number; dur: number };
    end: number;
};

const clamp = (x: number) => Math.min(1, Math.max(0, x));

function useSp() {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    return {
        t: frame / fps,
        sp: (at: number, config = { damping: 10, stiffness: 190 }) => spring({ frame: frame - Math.round(at * fps), fps, config }),
    };
}

const Intro: React.FC<{ p: MarathonProps }> = ({ p }) => {
    const L = layout(p.format);
    const { t, sp } = useSp();
    const big = sp(0.2, { damping: 8, stiffness: 150 });
    const topic = sp(0.7);
    const ask = sp(1.2, { damping: 9, stiffness: 160 });
    const rules = [`⏱️ ${ar(p.timer)} ثوانٍ لكل سؤال`, "✍️ احسب نقاطك بنفسك", "💬 اكتب نتيجتك في التعليقات"];
    const out = clamp((t - (p.intro - 0.35)) / 0.35);
    const k = L.s;
    return (
        <AbsoluteFill style={{ fontFamily: "ROM, sans-serif", color: "#fff" }}>
            <Background L={L} tint={ACCENT} spinBoost={t * 20} />
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", direction: "rtl", opacity: 1 - out, transform: `scale(${1 + out * 0.3})` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 30 * k }}>
                    <span style={{ fontSize: 300 * k, fontWeight: 700, lineHeight: 1, color: ACCENT, textShadow: `0 0 90px ${ACCENT}, 0 16px 0 #7a3a00`, transform: `scale(${interpolate(big, [0, 1], [3, 1])}) rotate(${interpolate(big, [0, 1], [-25, 0])}deg)`, display: "inline-block" }}>{ar(p.n)}</span>
                    <span style={{ fontSize: 130 * k, fontWeight: 700, opacity: clamp(big * 2) }}>سؤالاً</span>
                </div>
                <div style={{ fontSize: 80 * k, fontWeight: 700, marginTop: 10 * k, opacity: clamp(topic * 2), transform: `translateY(${interpolate(topic, [0, 1], [60, 0])}px)` }}>{p.topic}</div>
                <div style={{ marginTop: 40 * k, padding: `${16 * k}px ${50 * k}px`, borderRadius: 999, background: "#fff", color: "#000", fontSize: 64 * k, fontWeight: 700, transform: `scale(${ask}) rotate(-3deg)`, boxShadow: "0 12px 0 #000" }}>كم سؤالاً ستجيب عليه؟ 🤔</div>
                <div style={{ display: "flex", gap: 24 * k, marginTop: 70 * k }}>
                    {rules.map((r, i) => {
                        const s = sp(1.8 + i * 0.25);
                        return <span key={i} style={{ padding: `${14 * k}px ${34 * k}px`, borderRadius: 18 * k, background: "rgba(255,255,255,.1)", border: "2px solid rgba(255,255,255,.2)", fontSize: 44 * k, fontWeight: 700, opacity: clamp(s * 2), transform: `translateY(${interpolate(s, [0, 1], [80, 0])}px)` }}>{r}</span>;
                    })}
                </div>
            </AbsoluteFill>
            <div style={{ position: "absolute", top: 30 * k, right: 44 * k, display: "flex", alignItems: "center", gap: 14 * k, fontSize: 44 * k, fontWeight: 700, direction: "rtl" }}>
                <Img src={staticFile("favicon.svg")} style={{ width: 62 * k, height: 62 * k }} />
                اختبار الهلال
            </div>
        </AbsoluteFill>
    );
};

/** Score tiers split the range into thirds. */
function tiers(n: number): [string, string][] {
    const a = Math.floor(n / 3), b = Math.floor((2 * n) / 3);
    return [
        [`${ar(0)} – ${ar(a)}`, "😅 تحتاج إلى مراجعة"],
        [`${ar(a + 1)} – ${ar(b)}`, "👍 ثقافتك جيدة"],
        [`${ar(b + 1)} – ${ar(n)}`, "🧠 عبقري!"],
    ];
}

const Outro: React.FC<{ p: MarathonProps }> = ({ p }) => {
    const L = layout(p.format);
    const { t, sp } = useSp();
    const head = sp(0.15, { damping: 8, stiffness: 170 });
    const cta = Math.max(4.2, p.outro.dur - 5.5);
    const out = clamp((t - (cta - 0.3)) / 0.3);
    const k = L.s;
    const colors = ["#ff5e5e", ACCENT, "#22c55e"];
    return (
        <AbsoluteFill style={{ fontFamily: "ROM, sans-serif", color: "#fff" }}>
            <Background L={L} tint="#22c55e" won={0.5} />
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", direction: "rtl", opacity: 1 - out }}>
                <div style={{ fontSize: 150 * k, fontWeight: 700, color: ACCENT, textShadow: `0 0 70px ${ACCENT}, 0 12px 0 #7a3a00`, transform: `scale(${interpolate(head, [0, 1], [3, 1])})` }}>كم نتيجتك؟</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 22 * k, marginTop: 50 * k, width: 1100 * k }}>
                    {tiers(p.n).map(([range, label], i) => {
                        const s = sp(0.9 + i * 0.45, { damping: 12, stiffness: 170 });
                        return (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${20 * k}px ${44 * k}px`, borderRadius: 24 * k, background: "linear-gradient(180deg, #2a2a30, #17171b)", borderInlineStart: `${14 * k}px solid ${colors[i]}`, boxShadow: "0 10px 0 #000", fontSize: 64 * k, fontWeight: 700, opacity: clamp(s * 2), transform: `translateX(${interpolate(s, [0, 1], [i % 2 ? -1400 : 1400, 0])}px)` }}>
                                <span style={{ color: colors[i] }}>{range}</span>
                                <span>{label}</span>
                            </div>
                        );
                    })}
                </div>
                <div style={{ marginTop: 50 * k, fontSize: 56 * k, fontWeight: 700, opacity: clamp(sp(2.6) * 2) }}>اكتب نتيجتك في التعليقات 👇</div>
            </AbsoluteFill>
            <EndCard L={L} at={cta} headline="تحدٍّ جديد كل أسبوع… هل أنت مستعد؟" sub="اشترك وفعّل الجرس حتى لا يفوتك" follow="العب الآن بلا توقف على الموقع" />
        </AbsoluteFill>
    );
};

export const Marathon: React.FC<MarathonProps> = (p) => {
    const { fps } = useVideoConfig();
    const f = (s: number) => Math.round(s * fps);
    return (
        <AbsoluteFill style={{ background: "#07070a" }}>
            <Sequence durationInFrames={f(p.intro)}>
                <Intro p={p} />
            </Sequence>
            {p.segments.map((s, i) => (
                <Sequence key={i} from={f(s.from)} durationInFrames={f(s.from + s.dur) - f(s.from)}>
                    <Quiz {...s.quiz} />
                </Sequence>
            ))}
            <Sequence from={f(p.outro.from)} durationInFrames={f(p.end) - f(p.outro.from)}>
                <Outro p={p} />
            </Sequence>
        </AbsoluteFill>
    );
};

/** YouTube thumbnail (1920×1080 still). */
export const Thumb: React.FC<{ n: number; topic: string; image?: string; sample: { text: string; options: string[]; answer: number } }> = ({ n, topic, image, sample }) => {
    const L = layout("landscape");
    const k = 1;
    return (
        <AbsoluteFill style={{ fontFamily: "ROM, sans-serif", color: "#fff", direction: "rtl" }}>
            <Background L={L} tint="#ff3b30" tense={0.4} />
            <div style={{ position: "absolute", right: 90, top: 120, width: 900 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 30 }}>
                    <span style={{ fontSize: 420 * k, fontWeight: 700, lineHeight: 0.95, color: ACCENT, textShadow: `0 0 100px ${ACCENT}, 0 22px 0 #7a3a00` }}>{ar(n)}</span>
                    <span style={{ fontSize: 150, fontWeight: 700, textShadow: "0 10px 0 #000" }}>سؤالاً</span>
                </div>
                <div style={{ fontSize: 96, fontWeight: 700, marginTop: 10, textShadow: "0 8px 0 #000" }}>{topic}</div>
                <div style={{ display: "inline-block", marginTop: 40, padding: "18px 50px", borderRadius: 999, background: "#fff", color: "#000", fontSize: 76, fontWeight: 700, transform: "rotate(-3deg)", boxShadow: "0 14px 0 #000" }}>هل تجيب عليها كلها؟ 🤔</div>
            </div>
            <div style={{ position: "absolute", left: 90, top: 150, width: 760, transform: "rotate(4deg)", padding: 40, borderRadius: 40, background: "rgba(20,20,24,.92)", border: "4px solid rgba(255,255,255,.18)", boxShadow: "0 30px 80px rgba(0,0,0,.7)" }}>
                {image && <Img src={staticFile(image)} style={{ display: "block", margin: "0 auto 24px", height: 260, maxWidth: 600, objectFit: "contain", borderRadius: 14 }} />}
                <div style={{ fontSize: 50, fontWeight: 700, textAlign: "center", lineHeight: 1.4, marginBottom: 26 }}>{sample.text}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                    {sample.options.slice(0, 4).map((o, i) => (
                        <div key={i} style={{ padding: "22px 10px", borderRadius: 20, textAlign: "center", fontSize: 44, fontWeight: 700, background: i === sample.answer ? "#22c55e" : "#26262c", boxShadow: `0 8px 0 ${i === sample.answer ? "#0d5c2b" : "#000"}` }}>{i === sample.answer ? "؟" : o}</div>
                    ))}
                </div>
            </div>
            <div style={{ position: "absolute", left: 60, bottom: 50, display: "flex", alignItems: "center", gap: 16, fontSize: 52, fontWeight: 700 }}>
                <Img src={staticFile("favicon.svg")} style={{ width: 70, height: 70 }} /> اختبار الهلال
            </div>
        </AbsoluteFill>
    );
};

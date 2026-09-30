import React from "react";
import { Composition, Still } from "remotion";
import { Quiz, SIZES, type QuizProps } from "./Quiz";
import { Marathon, Thumb, type MarathonProps } from "./Marathon";

/** Studio preview data; real renders pass their own props from make.ts. */
const sample: QuizProps = {
    format: "vertical",
    q: { text: "ما أكبر دولة عربية من حيث المساحة؟", words: [], isQuote: false, options: ["السعودية", "الجزائر", "السودان", "ليبيا"], answer: 1, label: "جغرافيا", icon: "🌍", kind: "geo" },
    episode: 1,
    hook: ["سؤال سريع… هل تعرف الجواب؟", "عندك ٥ ثوانٍ فقط ⏱️"],
    tint: "#1fb5a8",
    fact: ["✓ الجزائر", "أكبر دولة في العالم العربي وفي أفريقيا، بمساحة ٢٫٣٨ مليون كم²."],
    T: { qIn: 2.2, optsIn: [3.1, 3.3, 3.5, 3.7], cdStart: 5.2, cdLen: 5, reveal: 10.2, fact: 11.1, cta: 14.2, end: 18 },
};

const marathonSample: MarathonProps = {
    format: "landscape", n: 1, timer: 5, topic: "في الثقافة العامة", intro: 5,
    segments: [{ from: 5, dur: 13.5, quiz: { ...sample, format: "landscape", hook: undefined, episode: undefined, counter: { i: 1, n: 1 }, T: { ...sample.T, qIn: 1, cta: 999, end: 13.5 } } }],
    outro: { from: 18.5, dur: 11 }, end: 29.5,
};

export const Root: React.FC = () => (
    <>
        <Composition
            id="Quiz"
            component={Quiz}
            width={1080}
            height={1920}
            fps={60}
            durationInFrames={Math.round(sample.T.end * 60)}
            defaultProps={sample}
            calculateMetadata={({ props }) => ({ durationInFrames: Math.round(props.T.end * 60), width: SIZES[props.format][0], height: SIZES[props.format][1] })}
        />
        <Composition
            id="Marathon"
            component={Marathon}
            width={1920}
            height={1080}
            fps={30}
            durationInFrames={Math.round(marathonSample.end * 30)}
            defaultProps={marathonSample}
            calculateMetadata={({ props }) => ({ durationInFrames: Math.round(props.end * 30) })}
        />
        <Still id="Thumb" component={Thumb} width={1920} height={1080} defaultProps={{ n: 20, topic: "في الثقافة العامة", sample: { text: sample.q.text, options: sample.q.options, answer: 1 } }} />
    </>
);

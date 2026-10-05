# PhotoSafe limiter regression — 2026-10-05

`node scripts/test/photosafe/run.js` (headless Chrome, clean profile). Each
case strobes the frame the limiter sees for 3 s and measures what reaches the
canvas with the real sRGB curve, counting WCAG 2.3.1 flashes (opposing 10%
swings between extremes, darker state under 0.80; red = 0.20 swings of linear
red with one end saturated red). **Judged** = the most flashes in any sliding
one-second window after the first second (pass: 3 or fewer). **First second**
is reported, not judged: a limiter that detects flicker cannot act before the
flicker starts.

Before = the v2 detector (frame-to-frame block deltas, rate ramp 5→9 per s).
After = v3 (each block's own swings between extremes, a reversal inside 0.18 s
counts, three-to-one same-direction majority, full by about the third flash).

| case | judged before → after | first second before → after |
|---|---|---|
| square 3 Hz (at the WCAG line, permitted) | 3 → 3 | 2.5 → 2.5 |
| square 6 Hz | 2.5 → **0** | 5.5 → 3.5 |
| square 10 Hz | 0 → 0 | 5.5 → 3 |
| square 20 Hz | 0 → 0 | 5 → 3 |
| square 6 Hz at 144 Hz | **3.5 (fail)** → 0 | 5.5 → 3.5 |
| square 6 Hz on 10% of the canvas | 2.5 → **0** | 5.5 → 3.5 |
| red/black 6 Hz (red flashes) | 2 → 0.5 | 5.5 → 1.5 |
| red/green 6 Hz, equal luminance (red flashes) | 2 → 0 | 5.5 → 0.5 |
| sine 4 Hz | **4 (fail)** → 0 | 3.5 → 3.5 |
| sine 6 Hz | 1 → 0.5 | 5.5 → 3 |
| sine 4 Hz at 144 Hz | **4 (fail)** → 0.5 | 4 → 3.5 |
| sine 6 Hz at 144 Hz | 1.5 → 0 | 5.5 → 3.5 |
| sine 4 Hz, mid-grey swing | **4 (fail)** → 0 | 4 → 3.5 |
| sine 4 Hz, mid-grey swing at 144 Hz | **4 (fail, never detected)** → 0 | 4 → 3.5 |
| sine 4 Hz, light-grey swing | **4 (fail, never detected)** → 0 | 3.5 → 3 |
| sine 2.5 Hz (permitted, must be left alone) | 3, untouched → 3, untouched | 2 → 2 |

Painting:

| | before | after |
|---|---|---|
| one stroke over a second | bit-identical, envelope 0 | bit-identical, envelope 0 |
| 4 s of hard scribbling, one colour per 1.3 s | envelope up to 0.26 (trails) | envelope 0 |

Found along the way: the global slew clamp was documented as a hard guarantee
("a ≥10% pair at ≥3 Hz is arithmetically impossible"). It is not — the
exposure ratio it works through is capped at 0.33–1.25x and cannot lift black;
a full black/white 3 Hz square passes it at full swing. The comments in 04a and
05b now say so. 3 Hz itself is within WCAG's limit, and v3 still eases it in
after about two seconds.

The table the suite prints on each run (REPORT=<path> writes it) is the
current "after" column.

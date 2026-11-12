import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type RingNote = { emoji: string; path: string; text: string; selector?: string };

// Made-up notes, but the kind real visitors leave. More than fit on the ring at
// once, so the ones coming out of the tunnel are new.
const NOTES: RingNote[] = [
  {
    emoji: "🐛",
    path: "/checkout",
    text: "Nothing happens when I tap Pay",
    selector: "button#pay",
  },
  { emoji: "❤️", path: "/", text: "Love the colors on the homepage!" },
  { emoji: "💡", path: "/blog", text: "An RSS feed would be lovely." },
  { emoji: "🐛", path: "/download", text: "This 404s on Safari", selector: "a.download" },
  { emoji: "🤔", path: "/pricing", text: "Is this per month or per year?" },
  { emoji: "❤️", path: "/projects", text: "The plant bot is genius" },
  { emoji: "🐛", path: "/contact", text: "Form won’t submit on my phone" },
  { emoji: "💡", path: "/docs", text: "Dark mode pls 🙏" },
  {
    emoji: "🐛",
    path: "/settings",
    text: "Says my email is invalid. It isn't.",
    selector: "input[type=email]",
  },
  { emoji: "❤️", path: "/now", text: "Bookmarked. Instant follow." },
  { emoji: "🤔", path: "/about", text: "Who made this? It's great" },
  { emoji: "💡", path: "/search", text: "Search could include tags too" },
  { emoji: "🐛", path: "/gallery", text: "Images overlap the caption", selector: "figure > img" },
  { emoji: "❤️", path: "/changelog", text: "Shipping fast, love it" },
  { emoji: "🤔", path: "/signup", text: "Do I need a card to try it?" },
  { emoji: "🐛", path: "/", text: "Menu won't close on iPad", selector: "nav .burger" },
  { emoji: "💡", path: "/recipes", text: "Metric units, please!" },
  { emoji: "❤️", path: "/uses", text: "Stole half your setup, thanks" },
  { emoji: "🐛", path: "/blog/rust", text: "Code block runs off the screen", selector: "pre" },
  { emoji: "🤔", path: "/faq", text: "Is there an API?" },
  { emoji: "💡", path: "/shop", text: "Wishlist button?" },
  { emoji: "❤️", path: "/talks", text: "Great talk, slides were gold" },
  { emoji: "🐛", path: "/login", text: "Password field eats my paste", selector: "#password" },
  { emoji: "💡", path: "/", text: "A newsletter would be nice" },
];

// Angles in degrees, clockwise from 12 o'clock. Like the logo, the ring has a
// gap at the top right: notes go in just before 12 and come out at about 2.
const TUNNEL_IN = 350;
const TUNNEL_OUT = 62;
/** The visible part of the ring, measured from where notes come out. */
const VISIBLE = (TUNNEL_IN - TUNNEL_OUT + 360) % 360;
/** How far either side of the tunnel notes take to shrink away or grow back. */
const FADE = 26;
/** One lap a minute. */
const DEGREES_PER_SECOND = 360 / 60;

type Layout = {
  compact: boolean;
  width: number;
  height: number;
  radius: number;
  slots: number;
  /** The cards' size, relative to full size. */
  cardScale: number;
};

/** The ring at its biggest, and the room its cards need above and below it. */
const FULL_RADIUS = 430;
const FULL_MARGIN = 130;
/** Never smaller than this: below it the notes crowd the headline. */
const MIN_RADIUS = 310;
/** The page header's height (the app's too), and how far the ring tucks up
    under it: its top is the tunnel, where notes fade out anyway. */
const HEADER_HEIGHT = 73;
const RING_TUCK = 40;
/** Then lifted further, size unchanged: the header's middle is empty, so the
    ring's top (the tunnel) can sit in it, between the logo and the button. */
const RING_LIFT = 32;
/** Card text never goes below 12px (it's 13px at full size). */
const MIN_CARD_SCALE = 12 / 13;

/**
 * The ring fits the window: as wide as the column allows, and short enough
 * that the whole loop shows on the first screen (headline in the middle),
 * down to a minimum. The cards shrink with it, so the picture stays the same.
 */
function layoutFor(rawWidth: number, viewportHeight: number): Layout {
  // A window with no size yet (a hidden tab, say) gets an empty ring, not a negative one.
  const width = Math.max(0, rawWidth);
  // Narrow screens: the text goes above, and the ring is emoji on a thick track.
  if (width < 900) {
    const radius = Math.max(0, Math.min(150, width / 2 - 32));
    return { compact: true, width, height: radius * 2 + 64, radius, slots: 12, cardScale: 1 };
  }
  const byWidth = width / 2 - 105;
  // The stage is 2r plus a margin that shrinks with the cards (r / FULL_RADIUS).
  // (A few pixels spare, so rounding never pushes the play button off the bottom.)
  const room = viewportHeight - HEADER_HEIGHT + RING_TUCK - 4;
  const byHeight = room / (2 + FULL_MARGIN / FULL_RADIUS);
  const radius = Math.floor(
    Math.max(Math.min(FULL_RADIUS, byWidth, byHeight), Math.min(MIN_RADIUS, byWidth)),
  );
  const scale = radius / FULL_RADIUS;
  return {
    compact: false,
    width,
    height: Math.ceil(radius * 2 + FULL_MARGIN * scale),
    radius,
    // Fewer, so smaller rings keep the same breathing room between cards.
    slots: radius >= 400 ? 14 : 12,
    cardScale: Math.max(scale, MIN_CARD_SCALE),
  };
}

/** Where a slot is, and how far into the tunnel (0 inside, 1 clear of it). */
function place(layout: Layout, angle: number) {
  const rad = (angle * Math.PI) / 180;
  const x = layout.width / 2 + layout.radius * Math.sin(rad);
  const y = layout.height / 2 - layout.radius * Math.cos(rad);
  const fromOut = (angle - TUNNEL_OUT + 360) % 360;
  let clear = 1;
  if (fromOut > VISIBLE) clear = 0;
  else if (fromOut < FADE) clear = fromOut / FADE;
  else if (fromOut > VISIBLE - FADE) clear = (VISIBLE - fromOut) / FADE;
  return { x, y, fromOut, clear };
}

/** Coming out: how many degrees past the dot a note takes to get solid. */
const SOLID_WITHIN = 4;
/** Coming out: how big a note is right at the dot, relative to full size. */
const START_SCALE = 0.35;

/**
 * How a note looks at a point on the ring. The two ends of the tunnel differ:
 * going in, a note shrinks and blurs away into it; coming out, it pops out of
 * the dot crisp and small, solid at once, and grows to full size as it moves on.
 */
function look(p: ReturnType<typeof place>) {
  if (p.clear < 1 && p.fromOut < FADE) {
    const t = p.fromOut / FADE;
    const eased = 1 - (1 - t) ** 2;
    return {
      scale: START_SCALE + (1 - START_SCALE) * eased,
      opacity: Math.min(1, p.fromOut / SOLID_WITHIN),
      blur: 0,
    };
  }
  return { scale: 0.55 + 0.45 * p.clear, opacity: p.clear, blur: (1 - p.clear) * 4 };
}

function arcPoint(layout: Layout, angle: number) {
  const { x, y } = place(layout, angle);
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

/**
 * The hero: notes on a slowly turning ring around the headline. Near the gap
 * at the top right they shrink into a "tunnel" and a new note comes out the
 * other side, so it looks like they never stop arriving. Hovering a note
 * pauses the ring, and a button stops or starts it; with reduced motion it
 * starts still.
 */
export function NoteRing({ hero }: { hero: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState(() =>
    layoutFor(Math.min(window.innerWidth, 1440) - 48, window.innerHeight),
  );
  const slotRefs = useRef<(HTMLLIElement | null)[]>([]);
  const turn = useRef(0);
  const paused = useRef(false);
  const nextNote = useRef(layout.slots);
  const [slotNotes, setSlotNotes] = useState(() => [...Array(layout.slots).keys()]);
  const [arrived, setArrived] = useState(12);
  const firstCount = useRef(arrived);
  // Turning by default; still for people who asked for less motion, who can
  // still press play. Either way there's a button to stop it (WCAG 2.2.2).
  const [playing, setPlaying] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  // While the ring turns, the count lets go of a "+1" each time it goes up
  // (wherever the counter is: by the tunnel's mouth, or mid-ring on phones).
  // The slot whose note just changed while the ring is still, so it fades in.
  const [fresh, setFresh] = useState(-1);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // The stage's width, and the window's height (which the stage doesn't see).
    const update = () => {
      const next = layoutFor(Math.round(stage.clientWidth), window.innerHeight);
      setLayout((prev) =>
        prev.width === next.width && prev.radius === next.radius && prev.compact === next.compact
          ? prev
          : next,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // Keep one note per slot when a resize changes how many slots there are.
  useEffect(() => {
    setSlotNotes((prev) =>
      prev.length === layout.slots
        ? prev
        : [...Array(layout.slots).keys()].map((i) => prev[i] ?? nextNote.current++ % NOTES.length),
    );
  }, [layout.slots]);

  useLayoutEffect(() => {
    const step = 360 / layout.slots;
    const draw = () => {
      slotRefs.current.forEach((el, i) => {
        if (!el) return;
        const p = place(layout, (i * step + turn.current) % 360);
        const { scale, opacity, blur } = look(p);
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${scale})`;
        el.style.opacity = String(opacity);
        el.style.filter = blur > 0 ? `blur(${blur}px)` : "";
        el.style.visibility = opacity === 0 ? "hidden" : "";
      });
    };
    draw();
    if (!playing) return;

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Clamp so a background tab doesn't jump the ring when it comes back,
      // and never backwards: a frame's timestamp can come from just before
      // this loop started, and a backward step would count every note as new.
      const dt = Math.max(0, Math.min(now - last, 100)) / 1000;
      last = now;
      if (!paused.current) {
        const before = turn.current;
        turn.current = (before + dt * DEGREES_PER_SECOND) % 360;
        const swaps: number[] = [];
        let emerged = 0;
        for (let i = 0; i < layout.slots; i++) {
          const was = place(layout, (i * step + before) % 360).fromOut;
          const after = place(layout, (i * step + turn.current) % 360).fromOut;
          // Halfway through the tunnel, out of sight: becomes a new note.
          const middle = VISIBLE + (360 - VISIBLE) / 2;
          if (was < middle && after >= middle) swaps.push(i);
          // Wrapped from the end of the circle back to 0: it just came out.
          if (was - after > 180) emerged++;
        }
        if (swaps.length) {
          setSlotNotes((prev) => {
            const next = [...prev];
            for (const i of swaps) next[i] = nextNote.current++ % NOTES.length;
            return next;
          });
        }
        if (emerged) setArrived((n) => n + emerged);
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [layout, playing]);

  // While the ring is still, notes keep arriving without anything moving:
  // every few seconds the note just past the tunnel's exit fades into a new one.
  useEffect(() => {
    if (playing) return;
    const step = 360 / layout.slots;
    const timer = setInterval(() => {
      if (paused.current) return;
      let newest = -1;
      let nearest = 360;
      for (let i = 0; i < layout.slots; i++) {
        const p = place(layout, (i * step + turn.current) % 360);
        if (p.clear === 1 && p.fromOut < nearest) {
          nearest = p.fromOut;
          newest = i;
        }
      }
      if (newest === -1) return;
      setSlotNotes((prev) => {
        const next = [...prev];
        next[newest] = nextNote.current++ % NOTES.length;
        return next;
      });
      setFresh(newest);
      setArrived((n) => n + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, [layout, playing]);

  const pill = (
    <span className="pill" key={arrived}>
      {arrived} new notes
    </span>
  );
  const plusOne = playing && arrived !== firstCount.current && (
    <span key={`plus-${arrived}`} className="ring-plus" aria-hidden="true">
      +1
    </span>
  );
  // Play/pause, in the showpiece itself: under the fine print on wide screens,
  // under the counter in the phone ring. Quiet while it turns, brighter while
  // still (the way in to the motion, and the only one with reduce-motion).
  const toggle = (
    <button
      type="button"
      className={playing ? "ring-toggle" : "ring-toggle still"}
      aria-label={playing ? "Pause the notes" : "Play the notes"}
      title={playing ? "Pause" : "Play"}
      onClick={() => setPlaying((p) => !p)}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {playing ? (
          <>
            <rect x="14" y="3" width="5" height="18" rx="1" />
            <rect x="5" y="3" width="5" height="18" rx="1" />
          </>
        ) : (
          <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
        )}
      </svg>
    </button>
  );
  const track = (
    <svg className="ring-track" width={layout.width} height={layout.height} aria-hidden="true">
      <path
        d={`M ${arcPoint(layout, TUNNEL_OUT)} A ${layout.radius} ${layout.radius} 0 1 1 ${arcPoint(layout, TUNNEL_IN)}`}
      />
      <circle
        className="ring-mouth"
        key={arrived}
        r="4"
        cx={place(layout, TUNNEL_OUT).x}
        cy={place(layout, TUNNEL_OUT).y}
      />
    </svg>
  );

  return (
    <section className={`ring${layout.compact ? " compact" : ""}${playing ? " playing" : ""}`}>
      {layout.compact && <div className="hero">{hero}</div>}
      <div
        ref={stageRef}
        className="ring-stage"
        style={
          {
            height: layout.height,
            marginTop: layout.compact ? undefined : -(RING_TUCK + RING_LIFT),
            "--card-scale": layout.cardScale,
          } as CSSProperties
        }
      >
        {track}
        <ul className="ring-notes" aria-label="Example notes">
          {slotNotes.map((noteIndex, i) => {
            const note = NOTES[noteIndex % NOTES.length] as RingNote;
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: slots are fixed positions on the ring.
                key={i}
                ref={(el) => {
                  slotRefs.current[i] = el;
                }}
                className="ring-slot"
                onPointerEnter={() => {
                  paused.current = true;
                }}
                onPointerLeave={() => {
                  paused.current = false;
                }}
              >
                {layout.compact ? (
                  <span
                    key={noteIndex}
                    className={i === fresh ? "ring-bubble ring-fresh" : "ring-bubble"}
                    title={note.text}
                  >
                    {note.emoji}
                  </span>
                ) : (
                  <div
                    key={noteIndex}
                    className={i === fresh ? "ring-card ring-fresh" : "ring-card"}
                  >
                    <span className="ring-card-meta">
                      {note.emoji} {note.path}
                    </span>
                    {note.text}
                    {note.selector && (
                      <span className="wall-note-chip">{`</> ${note.selector}`}</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {/* The counter sits just above the tunnel's mouth, where the notes it
            counts come out (and the dot pulses as each one does), leaving the
            middle to the headline. On phones it stays in the ring's middle. */}
        {!layout.compact && (
          <span
            className="ring-counter"
            style={{ left: place(layout, TUNNEL_OUT).x, top: place(layout, TUNNEL_OUT).y - 14 }}
          >
            {pill}
            {plusOne}
          </span>
        )}
        <div
          className="ring-center"
          // As wide as the space between the side cards (which shrink with the ring).
          style={
            layout.compact
              ? undefined
              : { width: Math.min(540, layout.radius * 2 - 200 * layout.cardScale) }
          }
        >
          {layout.compact ? (
            <>
              {pill}
              {plusOne}
            </>
          ) : (
            <div className="hero">
              {hero}
              {toggle}
            </div>
          )}
        </div>
        {layout.compact && toggle}
      </div>
    </section>
  );
}

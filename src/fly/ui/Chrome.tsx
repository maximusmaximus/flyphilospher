import { useEffect, useState } from "react";
import { designDrop, listDrops, placeDrop, submitDrop } from "../drops/fns";
import { acceptablePrompt, tokenMesh } from "../drops/prompt";
import { formatCountdown, nextDropAt } from "../drops/schedule";
import type { DropItem } from "../drops/types";
import { detectQuality } from "../quality";
import { sim } from "../sim";

function mergeDrops(local: DropItem[], remote: DropItem[]) {
  const map = new Map<string, DropItem>();
  for (const item of remote) map.set(item.id, item);
  for (const item of local) {
    const other = map.get(item.id);
    if (!other) {
      if (Date.now() - item.createdAt < 10 * 60_000) map.set(item.id, item);
      continue;
    }
    const localParts = item.mesh?.parts.length ?? 0;
    const remoteParts = other.mesh?.parts.length ?? 0;
    map.set(item.id, {
      ...other,
      mesh: remoteParts >= localParts ? other.mesh : item.mesh,
      image: other.image || item.image,
      stage: other.stage === "painted" || other.stage === "solid" ? other.stage : item.stage ?? other.stage,
      dropAt: Math.min(other.dropAt, item.dropAt),
    });
  }
  return [...map.values()];
}

const PHASES = ["Writing", "Shaping", "Painting"];

function PhaseRing({ prompt, step }: { prompt: string; step: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const gap = c * 0.045;
  const seg = (c - gap * 3) / 3;
  return (
    <div
      className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
      style={{ top: "calc(env(safe-area-inset-top) + 72px)" }}
    >
      <div className="relative grid h-[148px] w-[148px] place-items-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="46" fill="rgba(16,14,18,0.78)" />
          {[0, 1, 2].map((i) => {
            const done = i < step;
            const live = i === step;
            const fill = done ? 1 : live ? 0.62 : 0;
            return (
              <g key={i}>
                <circle
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke="rgba(246,241,234,0.18)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeDasharray={`${seg} ${c}`}
                  strokeDashoffset={-(i * (seg + gap))}
                />
                {fill > 0 ? (
                  <circle
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke="#f6f1ea"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeDasharray={`${seg * fill} ${c}`}
                    strokeDashoffset={-(i * (seg + gap))}
                  />
                ) : null}
              </g>
            );
          })}
        </svg>
        <div className="z-10 max-w-[92px] px-2 text-center">
          <div className="text-[10px] tracking-[0.16em] text-fog">{PHASES[step]}</div>
          <div className="mt-1 line-clamp-3 text-[12px] leading-snug text-ivory">{prompt}</div>
        </div>
      </div>
    </div>
  );
}
const STEPS = [
  "Drag to look around. Pinch or scroll to come closer. The view stays on the room.",
  "Lean in and the fly leaves the stone. Back away and it lands. It will not pass through the glass.",
  "Each leg, the hairs, the antennae, and the wings report into the brain at the lower right.",
  "Type something. A ring shows the writing, the shape, and the paint. It falls only when the object is whole.",
  "Tap an object to see what it is. The mirror grows as the stone fills. The fly remembers the shapes.",
];

export function Chrome() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<DropItem[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [notes, setNotes] = useState(sim.notes);
  const [selected, setSelected] = useState<string | null>(null);
  const [help, setHelp] = useState(0);
  const [openHelp, setOpenHelp] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [phase, setPhase] = useState("");
  const [phaseWhen, setPhaseWhen] = useState<number | null>(null);
  const [pending, setPending] = useState<{ prompt: string; step: number } | null>(null);

  useEffect(() => {
    const apply = () => setMobile(detectQuality().mobile || window.innerWidth < 820);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    let gone = false;
    const pull = async () => {
      try {
        const catalog = await listDrops();
        if (gone) return;
        sim.drops = mergeDrops(sim.drops, catalog.items);
        setItems(sim.drops);
      } catch {
        /* catalog will retry */
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 12000);
    return () => {
      gone = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const nextNow = Date.now();
      setNow((prev) => (Math.floor(prev / 1000) === Math.floor(nextNow / 1000) ? prev : nextNow));
      setNotes((prev) => {
        const next = sim.notes;
        if (prev.length === next.length && prev.every((note, i) => note === next[i])) return prev;
        return [...next];
      });
      setSelected((prev) => (prev === sim.selected ? prev : sim.selected));
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const free = items.length < 10;
  const upcoming = items.filter((item) => item.stage === "painted" && item.dropAt > now).sort((a, b) => a.dropAt - b.dropAt)[0];
  const nextAt = nextDropAt(
    items.map((item) => item.dropAt),
    now,
  );
  const picked = items.find((item) => item.id === selected) ?? null;

  const send = async () => {
    const text = prompt.trim();
    if (!acceptablePrompt(text) || busy) return;
    const now = Date.now();
    const optimistic: DropItem = {
      id: `m${now.toString(36)}`,
      cid: `m${now.toString(36)}`,
      prompt: text,
      enhanced: text,
      createdAt: now,
      dropAt: now - 200,
      scale: 1.4,
      image: "",
      github: null,
      ipfs: null,
      pinned: false,
      rest: null,
      mesh: tokenMesh(text),
      stage: "token",
    };
    setPrompt("");
    setBusy(true);
    setError("");
    setPending({ prompt: text, step: 0 });
    try {
      const quality = detectQuality().mobile ? "low" : "high";
      const placed = await placeDrop({ data: { prompt: text, id: optimistic.id, mesh: optimistic.mesh } });
      setPending({ prompt: text, step: 1 });
      try {
        const designed = await designDrop({ data: { prompt: text, id: placed.item.id } });
        setPending({ prompt: text, step: 2 });
        const result = await submitDrop({
          data: {
            prompt: text,
            quality,
            enhanced: designed.enhanced,
            mesh: designed.mesh,
            id: designed.item.id,
          },
        });
        const item = { ...result.item, dropAt: Math.min(result.item.dropAt, Date.now() - 200) };
        sim.drops = mergeDrops(sim.drops, [item]);
        setItems(sim.drops);
        sim.say(`${item.prompt} is falling.`);
        if (result.painted === false) setError("the paint failed, the solid is still falling");
      } catch (err) {
        setError(err instanceof Error ? err.message : "the maker is still catching up");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "it could not be saved");
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10">
        <button
          type="button"
          data-fly-ui
          aria-label="Guide"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setHelp(0);
            setOpenHelp(true);
          }}
          className="pointer-events-auto absolute grid h-12 w-12 place-items-center rounded-full border border-ivory/70 bg-void text-base text-ivory"
          style={{
            top: "max(12px, env(safe-area-inset-top))",
            left: "max(12px, env(safe-area-inset-left))",
            zIndex: 40,
          }}
        >
          i*
        </button>
        <div
          data-fly-ui
          className="pointer-events-auto absolute flex gap-2"
          style={{
            top: "max(10px, env(safe-area-inset-top))",
            left: mobile ? "max(64px, calc(env(safe-area-inset-left) + 60px))" : "max(72px, env(safe-area-inset-left))",
            right: "max(10px, env(safe-area-inset-right))",
            flexDirection: mobile ? "column" : "row",
            alignItems: "stretch",
          }}
        >
          <form
            method="dialog"
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              data-fly-ui
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Something for the fly"
              maxLength={240}
              className="h-11 min-w-0 flex-1 rounded-full border border-ivory/25 bg-void/80 px-4 text-base text-ivory outline-none select-text"
              style={{ touchAction: "auto" }}
            />
            <button
              type="button"
              data-fly-ui
              disabled={busy}
              onClick={() => void send()}
              className="h-11 shrink-0 rounded-full bg-ivory px-4 text-sm text-void disabled:opacity-50"
            >
              {busy ? "…" : "Drop"}
            </button>
          </form>
          <div className="rounded-2xl border border-ivory/20 bg-void/80 px-3 py-1.5 text-ivory">
            <div className="font-mono text-[13px] tabular-nums tracking-[0.14em]">
              {phaseWhen ? (phaseWhen <= now + 1500 ? "now" : formatCountdown(phaseWhen - now)) : free && !upcoming ? "now" : formatCountdown(nextAt - now)}
            </div>
            <div className="max-w-[200px] truncate text-[11px] text-fog">
              {phase || (upcoming ? upcoming.prompt : free ? "drops right away" : "next opening")}
            </div>
          </div>
        </div>
        {pending ? <PhaseRing prompt={pending.prompt} step={pending.step} /> : null}
        {error ? (
          <div
            className="pointer-events-auto absolute left-1/2 -translate-x-1/2 rounded-full bg-void/90 px-3 py-1 text-xs text-ivory"
            style={{ top: pending ? "calc(env(safe-area-inset-top) + 232px)" : mobile ? "calc(env(safe-area-inset-top) + 118px)" : "calc(env(safe-area-inset-top) + 62px)" }}
          >
            {error}
          </div>
        ) : null}

        <div
          className="pointer-events-none absolute flex flex-col justify-end gap-1"
          style={{
            left: "max(10px, env(safe-area-inset-left))",
            bottom: "max(12px, env(safe-area-inset-bottom))",
            width: mobile ? "min(70vw, 260px)" : "min(34vw, 340px)",
            maxHeight: mobile ? "28dvh" : "36dvh",
          }}
        >
          {notes.slice(-3).map((note) => (
            <p key={note.t + note.text} className="rounded-2xl bg-void/75 px-2.5 py-1 text-[10px] leading-snug text-ivory/90">
              {note.text}
            </p>
          ))}
        </div>
      </div>

      {picked ? (
        <div
          data-fly-ui
          className="pointer-events-auto absolute z-20 border border-ivory/25 bg-void/92 text-ivory"
          style={
            mobile
              ? {
                  left: 8,
                  right: 8,
                  bottom: "max(12px, env(safe-area-inset-bottom))",
                  borderRadius: 18,
                  padding: 14,
                  maxHeight: "42dvh",
                  overflow: "auto",
                }
              : {
                  top: "max(74px, calc(env(safe-area-inset-top) + 64px))",
                  left: "max(16px, env(safe-area-inset-left))",
                  width: "min(320px, calc(100vw - 32px))",
                  borderRadius: 18,
                  padding: 16,
                  maxHeight: "46dvh",
                  overflow: "auto",
                }
          }
        >
          <div className="text-sm leading-snug">{picked.prompt}</div>
          <div className="mt-2 text-[12px] text-fog">
            Fell {new Date(picked.dropAt).toLocaleString()}
          </div>
          <button
            type="button"
            className="mt-3 text-[12px] text-dusk"
            onClick={() => {
              sim.selected = null;
              setSelected(null);
            }}
          >
            Close
          </button>
        </div>
      ) : null}

      {openHelp ? (
        <div
          data-fly-ui
          className="pointer-events-auto absolute inset-0 z-30 grid place-items-center bg-void/55 p-3"
          style={{ paddingTop: "max(12px, env(safe-area-inset-top))", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <div
            className="w-full overflow-auto rounded-3xl border border-ivory/20 bg-void/95 p-5 text-ivory"
            style={{ maxWidth: mobile ? "100%" : 420, maxHeight: "85dvh" }}
          >
            <div className="text-[11px] tracking-[0.18em] text-fog">
              {help + 1} / {STEPS.length}
            </div>
            <p className="mt-3 text-[15px] leading-relaxed">{STEPS[help]}</p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <button type="button" className="text-sm text-fog" onClick={() => setOpenHelp(false)}>
                Close
              </button>
              <button
                type="button"
                className="h-11 rounded-full bg-ivory px-4 text-sm text-void"
                onClick={() => {
                  if (help >= STEPS.length - 1) setOpenHelp(false);
                  else setHelp((n) => n + 1);
                }}
              >
                {help >= STEPS.length - 1 ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

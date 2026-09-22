import { useEffect, useState } from "react";
import { listDrops, submitDrop } from "../drops/fns";
import { formatCountdown, nextDropAt } from "../drops/schedule";
import type { DropItem } from "../drops/types";
import { detectQuality } from "../quality";
import { sim } from "../sim";

const STEPS = [
  "Drag to look around the pedestal. Pinch or scroll to move closer. The view stays on the room, not glued to the fly.",
  "Lean in and it startles. Back away and it lands. The glass is solid — it will not pass through.",
  "The orb at the lower right is its brain. Gold is dopamine. It is learning this room, not a movie.",
  "Type something at the top. The prompt is rewritten, then turned into a small object. One or two fall each hour.",
  "They stay. Tap one — the box around it means it is selected — to see what it is and when it fell. The mirror grows as the stone fills.",
  "The strip at the lower left is what the fly is doing, as it happens.",
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
        sim.drops = catalog.items;
        setItems(catalog.items);
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
      setNow(Date.now());
      setNotes([...sim.notes]);
      setSelected(sim.selected);
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  const free = items.length < 10;
  const upcoming = items.filter((item) => item.dropAt > now).sort((a, b) => a.dropAt - b.dropAt)[0];
  const nextAt = nextDropAt(
    items.map((item) => item.dropAt),
    now,
  );
  const picked = items.find((item) => item.id === selected) ?? null;

  const send = async () => {
    const text = prompt.trim();
    if (text.length < 2 || busy) return;
    setBusy(true);
    setError("");
    try {
      const quality = detectQuality().mobile ? "low" : "high";
      const result = await submitDrop({ data: { prompt: text, quality } });
      sim.drops = [...sim.drops.filter((item) => item.id !== result.item.id), result.item];
      setItems(sim.drops);
      setPrompt("");
      sim.say(`${result.item.prompt} is waiting in the sky.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "it could not be made");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10" data-fly-ui>
        <div
          className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 gap-2"
          style={{
            top: "max(10px, env(safe-area-inset-top))",
            width: mobile ? "calc(100% - 16px)" : "min(760px, calc(100% - 32px))",
            flexDirection: mobile ? "column" : "row",
            alignItems: mobile ? "stretch" : "center",
          }}
        >
          <button
            type="button"
            aria-label="What this is"
            onClick={() => {
              setHelp(0);
              setOpenHelp(true);
            }}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-ivory/30 bg-void/80 text-[15px] tracking-wide text-ivory"
          >
            i*
          </button>
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Something for the fly"
              maxLength={240}
              className="h-11 min-w-0 flex-1 rounded-full border border-ivory/25 bg-void/80 px-4 text-base text-ivory outline-none select-text"
              style={{ touchAction: "auto" }}
            />
            <button
              type="submit"
              disabled={busy}
              className="h-11 shrink-0 rounded-full bg-ivory px-4 text-sm text-void disabled:opacity-50"
            >
              {busy ? "…" : "Drop"}
            </button>
          </form>
          <div className="rounded-2xl border border-ivory/20 bg-void/80 px-3 py-1.5 text-ivory">
            <div className="font-mono text-[13px] tabular-nums tracking-[0.14em]">{free && !upcoming ? "now" : formatCountdown(nextAt - now)}</div>
            <div className="max-w-[180px] truncate text-[11px] text-fog">
              {upcoming ? upcoming.prompt : free ? "drops right away" : "next opening"}
            </div>
          </div>
        </div>
        {error ? (
          <div
            className="pointer-events-auto absolute left-1/2 -translate-x-1/2 rounded-full bg-void/90 px-3 py-1 text-xs text-ivory"
            style={{ top: mobile ? "calc(env(safe-area-inset-top) + 118px)" : "calc(env(safe-area-inset-top) + 62px)" }}
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
          {notes.slice(-6).map((note) => (
            <p key={note.t + note.text} className="rounded-2xl bg-void/75 px-3 py-1.5 text-[12px] leading-snug text-ivory/90">
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

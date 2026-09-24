import { EMPTY_QUEUE, MAX_PENDING, STALE_MS, advance, clear, enqueue, readingTime, remove, replay, type QueueState } from "../../src/mascot/voice/queue";

const T0 = 1_000_000;
let n = 0;
const say = (s: QueueState, text: string, extra: object = {}, now = T0) => enqueue(s, { text, ...extra }, `m${++n}`, now);

describe("Floo voice queue", () => {
  it("shows the first message at once and queues the rest FIFO", () => {
    let s = say(EMPTY_QUEUE, "a");
    s = say(s, "b");
    s = say(s, "c");
    expect(s.current?.text).toBe("a");
    expect(s.pending.map((p) => p.text)).toEqual(["b", "c"]);
    s = advance(s, T0);
    expect(s.current?.text).toBe("b");
    expect(s.history[0].text).toBe("a");
  });

  it("orders waiting messages by priority, FIFO inside a priority", () => {
    let s = say(EMPTY_QUEUE, "showing");
    s = say(s, "low", { priority: "low" });
    s = say(s, "n1");
    s = say(s, "high", { priority: "high" });
    s = say(s, "n2");
    expect(s.pending.map((p) => p.text)).toEqual(["high", "n1", "n2", "low"]);
  });

  it("lets urgent preempt, and the interrupted line resumes next", () => {
    let s = say(EMPTY_QUEUE, "tip", { priority: "normal" });
    s = say(s, "later");
    s = say(s, "STOP", { priority: "urgent" });
    expect(s.current?.text).toBe("STOP");
    expect(s.pending.map((p) => p.text)).toEqual(["tip", "later"]);
  });

  it("high does not preempt, it only jumps the line", () => {
    let s = say(EMPTY_QUEUE, "tip");
    s = say(s, "warn", { priority: "high" });
    expect(s.current?.text).toBe("tip");
    expect(s.pending[0].text).toBe("warn");
  });

  it("dedupes by key: refreshes the one on screen in place, replaces a waiting one", () => {
    let s = say(EMPTY_QUEUE, "over by 100", { dedupeKey: "over" });
    const id = s.current!.id;
    s = say(s, "over by 250", { dedupeKey: "over" });
    expect(s.current?.id).toBe(id);
    expect(s.current?.text).toBe("over by 250");
    expect(s.pending).toHaveLength(0);

    s = say(s, "water", { dedupeKey: "w" });
    s = say(s, "water again", { dedupeKey: "w" });
    expect(s.pending.map((p) => p.text)).toEqual(["water again"]);
  });

  it("ignores empty text", () => {
    expect(say(EMPTY_QUEUE, "   ")).toBe(EMPTY_QUEUE);
  });

  it("derives mood and tone from priority unless given", () => {
    const warn = say(EMPTY_QUEUE, "x", { priority: "high" }).current!;
    expect(warn.mood).toBe("worried");
    expect(warn.tone).toBe("warning");
    const ok = say(EMPTY_QUEUE, "x", { tone: "success" }).current!;
    expect(ok.mood).toBe("cheer");
    expect(say(EMPTY_QUEUE, "x", { mood: "flex", priority: "high" }).current!.mood).toBe("flex");
    expect(say(EMPTY_QUEUE, "x").current!.mood).toBe("happy");
  });

  it("drops stale waiting messages but never stale urgent ones", () => {
    let s = say(EMPTY_QUEUE, "showing");
    s = say(s, "old", {}, T0);
    s = say(s, "old urgent-ish", { priority: "high" }, T0);
    s = advance(s, T0 + STALE_MS + 1);
    expect(s.current).toBeNull();
  });

  it("caps the waiting line, dropping the lowest priority first", () => {
    let s = say(EMPTY_QUEUE, "showing");
    s = say(s, "low", { priority: "low" });
    for (let i = 0; i < MAX_PENDING; i++) s = say(s, `n${i}`);
    expect(s.pending).toHaveLength(MAX_PENDING);
    expect(s.pending.some((p) => p.text === "low")).toBe(false);
  });

  it("remove() advances when it hits the message on screen", () => {
    let s = say(EMPTY_QUEUE, "a");
    s = say(s, "b");
    const b = s.pending[0].id;
    s = remove(s, b, T0);
    expect(s.pending).toHaveLength(0);
    s = remove(s, s.current!.id, T0);
    expect(s.current).toBeNull();
  });

  it("replay() brings back the last line within ten minutes, without its trigger", () => {
    let s = say(EMPTY_QUEUE, "hello", { trigger: "goalHit" });
    s = advance(s, T0);
    const r = replay(s, T0 + 60_000);
    expect(r.current?.text).toBe("hello");
    expect(r.current?.trigger).toBeUndefined();
    expect(replay(s, T0 + 11 * 60_000).current).toBeNull();
  });

  it("clear() empties everything but keeps history", () => {
    let s = say(EMPTY_QUEUE, "a");
    s = say(s, "b");
    s = clear(s);
    expect(s.current).toBeNull();
    expect(s.pending).toHaveLength(0);
    expect(s.history[0].text).toBe("a");
  });

  it("gives longer lines more time, within bounds, and extra for an action", () => {
    expect(readingTime("Tamam", false)).toBe(3500);
    const long = readingTime(Array(80).fill("kelime").join(" "), false);
    expect(long).toBe(9000);
    expect(readingTime("Bugün protein hedefinin gerisindesin", true)).toBeGreaterThan(readingTime("Bugün protein hedefinin gerisindesin", false));
  });

  it("ttl null means sticky", () => {
    expect(say(EMPTY_QUEUE, "x", { ttlMs: null }).current!.ttlMs).toBeNull();
  });
});

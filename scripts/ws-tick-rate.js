// Connects to API WS for 5s and reports how many price events arrived per symbol.
const WebSocket = require("ws");

const ws = new WebSocket("ws://127.0.0.1:4000/");
const counts = new Map();
const firstSeen = new Map();
const lastSeen = new Map();

ws.on("open", () => {
  console.log("connected; sampling for 5000ms...");
});

ws.on("message", (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (msg.event !== "price") return;
  const sym = msg.payload?.symbol;
  if (!sym) return;
  const now = Date.now();
  counts.set(sym, (counts.get(sym) ?? 0) + 1);
  if (!firstSeen.has(sym)) firstSeen.set(sym, now);
  lastSeen.set(sym, now);
});

setTimeout(() => {
  ws.close();
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sym, n]) => {
      const span = (lastSeen.get(sym) - firstSeen.get(sym)) || 1;
      const hz = (n / (span / 1000)).toFixed(1);
      return `${sym.padEnd(10)} ${String(n).padStart(4)} ticks  (~${hz} Hz)`;
    });
  console.log("\nTick counts over 5s:");
  console.log(rows.join("\n"));
  process.exit(0);
}, 5000);

ws.on("error", (e) => {
  console.error("ws error:", e.message);
  process.exit(1);
});

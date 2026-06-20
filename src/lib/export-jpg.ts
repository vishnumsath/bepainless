import { addDays, eachDayISO, parseISODate, toISODate } from "./painless-date";

type Entry = { entry_date: string; has_headache: boolean; severity: "mild" | "moderate" | "severe" | null };

const COLORS = {
  bg: "#FFFFFF",
  text: "#1A1A1A",
  muted: "#6B6B6B",
  rule: "#E5E5E5",
  crimson: "#A33327",
  blue: "#1F4E79",
  unlogged: "#D6D6D6",
  painfree: "#3FA864",
  mild: "#F1C40F",
  moderate: "#E67E22",
  severe: "#C0392B",
};

export interface ExportArgs {
  start: string;
  end: string;
  entries: Entry[];
  patient: { name?: string | null; age?: number | null; gender?: string | null };
}

export async function downloadSummaryJPG(args: ExportArgs) {
  const W = 1200, H = 1600;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H);

  const map = new Map(args.entries.map((e) => [e.entry_date, e]));
  const days = eachDayISO(parseISODate(args.start), parseISODate(args.end));
  const total = days.length;
  let painfreeCount = 0, mild = 0, moderate = 0, severe = 0, headache = 0, unlogged = 0;
  for (const d of days) {
    const e = map.get(d);
    if (!e) { unlogged++; continue; }
    if (!e.has_headache) painfreeCount++;
    else {
      headache++;
      if (e.severity === "mild") mild++;
      else if (e.severity === "moderate") moderate++;
      else if (e.severity === "severe") severe++;
    }
  }
  const logged = total - unlogged;

  // Margins
  const M = 80;
  let y = M;

  // Zone 1: Header
  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 22px ui-sans-serif, system-ui, -apple-system, Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("PainLess App Summary", M, y + 8);

  ctx.fillStyle = COLORS.text;
  ctx.font = "600 18px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "right";
  const patientLine = `Patient: ${args.patient.name?.trim() || "____________________"}`;
  const ageGender = `Age: ${args.patient.age ?? "____"}    Gender: ${args.patient.gender?.trim() || "____"}`;
  ctx.fillText(patientLine, W - M, y - 4);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 16px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(ageGender, W - M, y + 22);
  y += 60;

  // Date range
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 44px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`${fmtDate(args.start)} — ${fmtDate(args.end)}`, W / 2, y + 30);
  y += 70;

  ctx.strokeStyle = COLORS.rule;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
  y += 60;

  // Zone 2: Big metrics
  const colW = (W - M * 2) / 2;
  ctx.textAlign = "center";
  // Headache
  ctx.fillStyle = COLORS.crimson;
  ctx.font = "800 140px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(String(headache), M + colW / 2, y + 110);
  ctx.fillStyle = COLORS.text;
  ctx.font = "600 22px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Headache Days", M + colW / 2, y + 150);
  // Pain-free
  ctx.fillStyle = COLORS.blue;
  ctx.font = "800 140px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(String(painfreeCount), M + colW + colW / 2, y + 110);
  ctx.fillStyle = COLORS.text;
  ctx.font = "600 22px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Pain-Free Days", M + colW + colW / 2, y + 150);
  y += 200;

  if (unlogged > 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "500 16px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`${unlogged} day${unlogged === 1 ? "" : "s"} unlogged in this range`, W / 2, y);
    y += 30;
  }

  // Zone 3: Severity breakdown
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 26px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Severity Breakdown", M, y + 24);
  y += 50;

  const breakdown = [
    { label: "Mild", count: mild, color: COLORS.mild },
    { label: "Moderate", count: moderate, color: COLORS.moderate },
    { label: "Severe", count: severe, color: COLORS.severe },
  ];
  const denom = headache || 1;
  for (const b of breakdown) {
    const pct = headache ? Math.round((b.count / denom) * 100) : 0;
    const barW = (W - M * 2);
    // bg
    ctx.fillStyle = "#F2F2F2"; roundRect(ctx, M, y, barW, 38, 8); ctx.fill();
    ctx.fillStyle = b.color; roundRect(ctx, M, y, Math.max(2, barW * (pct / 100)), 38, 8); ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.font = "600 16px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`${b.label}: ${pct}% (${b.count} day${b.count === 1 ? "" : "s"})`, M + 12, y + 25);
    y += 52;
  }
  y += 20;

  // Zone 4: Pattern matrix
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 26px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Daily Pattern", M, y + 24);
  y += 44;

  const availW = W - M * 2;
  const availH = H - y - M - 60;
  // pick square size to fit
  const N = days.length;
  let cols = Math.min(N, 30);
  let cellSize = Math.floor(availW / cols) - 4;
  let rows = Math.ceil(N / cols);
  while (rows * (cellSize + 4) > availH && cellSize > 8) {
    cellSize -= 2;
    cols = Math.floor(availW / (cellSize + 4));
    rows = Math.ceil(N / cols);
  }
  const gridW = cols * (cellSize + 4) - 4;
  const startX = M + (availW - gridW) / 2;

  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = startX + c * (cellSize + 4);
    const cy = y + r * (cellSize + 4);
    const e = map.get(days[i]);
    const color = !e
      ? COLORS.unlogged
      : !e.has_headache
        ? COLORS.painfree
        : e.severity === "mild"
          ? COLORS.mild
          : e.severity === "moderate"
            ? COLORS.moderate
            : COLORS.severe;
    ctx.fillStyle = color;
    roundRect(ctx, x, cy, cellSize, cellSize, 3);
    ctx.fill();
  }

  // Footer legend
  const footY = H - M + 10;
  ctx.font = "500 14px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  const items = [
    ["Unlogged", COLORS.unlogged], ["Pain-free", COLORS.painfree],
    ["Mild", COLORS.mild], ["Moderate", COLORS.moderate], ["Severe", COLORS.severe],
  ] as const;
  let x = M;
  for (const [label, color] of items) {
    ctx.fillStyle = color; roundRect(ctx, x, footY - 12, 14, 14, 3); ctx.fill();
    ctx.fillStyle = COLORS.text;
    ctx.fillText(label, x + 22, footY);
    x += ctx.measureText(label).width + 56;
  }
  // logged-of-total bottom right
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`${logged}/${total} days logged`, W - M, footY);

  // Download
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/jpeg", 0.95);
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `painless-summary-${args.start}_to_${args.end}.jpg`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function fmtDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// silence unused
void addDays;
void toISODate;

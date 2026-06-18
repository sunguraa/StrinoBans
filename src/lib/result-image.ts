import { MAP_POOL } from "@/lib/maps";
import { getCachedIntroPath } from "@/lib/wiki/cache";
import type { Side, Team } from "@/types/veto";
import type { VetoState, ConfirmedAction } from "@/lib/state-machine";
import type { SessionSummary } from "@/lib/storage";

const FORMAT_LABELS: Record<string, string> = {
  bo1: "Bo1",
  bo3: "Bo3",
  bo5: "Bo5",
  bo7: "Bo7",
  custom: "Custom",
};

export function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format;
}

const sideLabel = (side: Side): string => (side === "attacker" ? "ATK" : "DEF");
const opposite = (side: Side): Side => (side === "attacker" ? "defender" : "attacker");

export interface ResultImageMap {
  mapId: string;
  /** Display name of the team that picked the map, or null for the decider. */
  pickedByName: string | null;
  isDecider: boolean;
  /** "ATK" | "DEF" | null */
  teamASideLabel: string | null;
  teamBSideLabel: string | null;
}

export interface ResultImageData {
  teamAName: string;
  teamBName: string;
  formatLabel: string;
  maps: ResultImageMap[];
  bannedNames: string[];
}

function mapName(id: string): string {
  return MAP_POOL.find((m) => m.id === id)?.name ?? id;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

const COLORS = {
  bg: "#1b1916",
  card: "#232019",
  border: "#33302a",
  text: "#f2efe9",
  muted: "#9c958a",
  accent: "#d99a4e",
  atk: "#e5616a",
  def: "#4aa3d6",
  decider: "#d9b24e",
};

const WIDTH = 760;
const PAD = 28;
const ROW_H = 84;
const ROW_GAP = 10;

export async function renderVetoResultImage(data: ResultImageData): Promise<Blob> {
  const headerH = 92;
  const bannedH = data.bannedNames.length > 0 ? 46 : 0;
  const footerH = 40;
  const bodyH = data.maps.length * ROW_H + Math.max(0, data.maps.length - 1) * ROW_GAP;
  const height = PAD + headerH + bodyH + bannedH + footerH + PAD;

  const dpr = 2;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, height);

  // Header
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.text;
  ctx.font = "600 13px Inter, system-ui, sans-serif";
  ctx.fillText("STRINOBANS · MAP VETO", PAD, PAD + 16);

  ctx.fillStyle = COLORS.text;
  ctx.font = "700 28px Georgia, 'Times New Roman', serif";
  const vs = `${data.teamAName}  vs  ${data.teamBName}`;
  ctx.fillText(vs, PAD, PAD + 52);

  ctx.fillStyle = COLORS.muted;
  ctx.font = "400 14px Inter, system-ui, sans-serif";
  ctx.fillText(`${data.formatLabel} · ${data.maps.length} map${data.maps.length === 1 ? "" : "s"} in play order`, PAD, PAD + 76);

  // Map rows
  const images = await Promise.all(data.maps.map((m) => loadImage(getCachedIntroPath(m.mapId))));
  let y = PAD + headerH;

  data.maps.forEach((m, i) => {
    const x = PAD;
    const w = WIDTH - PAD * 2;

    ctx.fillStyle = COLORS.card;
    roundRect(ctx, x, y, w, ROW_H, 12);
    ctx.fill();
    ctx.strokeStyle = m.isDecider ? COLORS.decider : COLORS.border;
    ctx.lineWidth = m.isDecider ? 2 : 1;
    roundRect(ctx, x, y, w, ROW_H, 12);
    ctx.stroke();

    // Index
    ctx.fillStyle = COLORS.muted;
    ctx.font = "700 22px 'SF Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(i + 1), x + 30, y + ROW_H / 2 + 8);
    ctx.textAlign = "left";

    // Thumbnail
    const thumbW = 120;
    const thumbH = 68;
    const thumbX = x + 56;
    const thumbY = y + (ROW_H - thumbH) / 2;
    const img = images[i];
    ctx.save();
    roundRect(ctx, thumbX, thumbY, thumbW, thumbH, 8);
    ctx.clip();
    if (img) {
      // cover-fit
      const ratio = Math.max(thumbW / img.width, thumbH / img.height);
      const dw = img.width * ratio;
      const dh = img.height * ratio;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(img, thumbX + (thumbW - dw) / 2, thumbY + (thumbH - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = COLORS.border;
      ctx.fillRect(thumbX, thumbY, thumbW, thumbH);
    }
    ctx.restore();

    const textX = thumbX + thumbW + 18;

    // Map name
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 18px Inter, system-ui, sans-serif";
    ctx.fillText(mapName(m.mapId), textX, y + 30);

    if (m.isDecider) {
      const nameW = ctx.measureText(mapName(m.mapId)).width;
      ctx.fillStyle = COLORS.decider;
      ctx.font = "700 10px 'SF Mono', ui-monospace, monospace";
      ctx.fillText("DECIDER", textX + nameW + 10, y + 28);
    }

    // Picked by
    ctx.fillStyle = COLORS.muted;
    ctx.font = "400 13px Inter, system-ui, sans-serif";
    ctx.fillText(m.isDecider ? "Last map standing" : m.pickedByName ? `Picked by ${m.pickedByName}` : "", textX, y + 50);

    // Side tags
    if (m.teamASideLabel && m.teamBSideLabel) {
      let tagX = textX;
      const tagY = y + 60;
      const drawTag = (team: string, side: string) => {
        ctx.font = "600 11px Inter, system-ui, sans-serif";
        const tw = ctx.measureText(`${team} ${side}`).width + 16;
        ctx.fillStyle = side === "ATK" ? "rgba(229,97,106,0.16)" : "rgba(74,163,214,0.16)";
        roundRect(ctx, tagX, tagY, tw, 18, 5);
        ctx.fill();
        ctx.fillStyle = side === "ATK" ? COLORS.atk : COLORS.def;
        ctx.fillText(`${team} ${side}`, tagX + 8, tagY + 13);
        tagX += tw + 8;
      };
      drawTag(data.teamAName, m.teamASideLabel);
      drawTag(data.teamBName, m.teamBSideLabel);
    }

    y += ROW_H + ROW_GAP;
  });

  // Banned
  if (data.bannedNames.length > 0) {
    y += 6;
    ctx.fillStyle = COLORS.muted;
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.fillText(`BANNED:  ${data.bannedNames.join("  ·  ")}`, PAD, y + 14);
    y += bannedH - 6;
  }

  // Footer
  ctx.fillStyle = COLORS.muted;
  ctx.font = "400 12px Inter, system-ui, sans-serif";
  ctx.fillText("Generated with StrinoBans", PAD, height - PAD + 4);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to encode image"));
    }, "image/png");
  });
}

/** Build image data from the live veto state (results screen). */
export function buildResultImageData(params: {
  vetoState: VetoState;
  actions: ConfirmedAction[];
  teamNames: Record<Team, string>;
  format: string;
}): ResultImageData {
  const { vetoState, actions, teamNames, format } = params;
  const teamName = (t: Team) => (t === "a" ? teamNames.a : teamNames.b);

  const maps: ResultImageMap[] = vetoState.pickedMaps.map((p) => {
    const teamASide = p.sidePickedBy === "a" ? p.side : opposite(p.side);
    const teamBSide = p.sidePickedBy === "b" ? p.side : opposite(p.side);
    return {
      mapId: p.mapId,
      pickedByName: teamName(p.pickedBy),
      isDecider: false,
      teamASideLabel: sideLabel(teamASide),
      teamBSideLabel: sideLabel(teamBSide),
    };
  });

  if (vetoState.deciderMap) {
    const ds = actions.find((a) => a.type === "side" && a.mapId === vetoState.deciderMap);
    const side = ds?.side ?? null;
    const sidePickedBy = ds?.team ?? null;
    const teamASide = side ? (sidePickedBy === "a" ? side : opposite(side)) : null;
    const teamBSide = side ? (sidePickedBy === "b" ? side : opposite(side)) : null;
    maps.push({
      mapId: vetoState.deciderMap,
      pickedByName: null,
      isDecider: true,
      teamASideLabel: teamASide ? sideLabel(teamASide) : null,
      teamBSideLabel: teamBSide ? sideLabel(teamBSide) : null,
    });
  }

  return {
    teamAName: teamNames.a,
    teamBName: teamNames.b,
    formatLabel: formatLabel(format),
    maps,
    bannedNames: vetoState.bannedMaps.map(mapName),
  };
}

/** Build image data from a stored, completed session summary (history). */
export function buildResultImageDataFromSummary(summary: SessionSummary): ResultImageData {
  const teamName = (t: string) => (t === "a" ? summary.teamAName : summary.teamBName);
  const usedMaps = new Set<string>();

  const maps: ResultImageMap[] = summary.finalResult.map((r) => {
    usedMaps.add(r.mapId);
    const isDecider = !r.pickedBy;
    const side = (r.side as Side) || null;
    const sidePickedBy = r.sidePickedBy || null;
    const teamASide = side ? (sidePickedBy === "a" ? side : opposite(side)) : null;
    const teamBSide = side ? (sidePickedBy === "b" ? side : opposite(side)) : null;
    return {
      mapId: r.mapId,
      pickedByName: isDecider ? null : teamName(r.pickedBy),
      isDecider,
      teamASideLabel: teamASide ? sideLabel(teamASide) : null,
      teamBSideLabel: teamBSide ? sideLabel(teamBSide) : null,
    };
  });

  const bannedNames = summary.mapPool.filter((id) => !usedMaps.has(id)).map(mapName);

  return {
    teamAName: summary.teamAName,
    teamBName: summary.teamBName,
    formatLabel: formatLabel(summary.format),
    maps,
    bannedNames,
  };
}

/** Copies the rendered result to the clipboard; falls back to a download. */
export async function copyVetoResultImage(data: ResultImageData): Promise<"copied" | "downloaded"> {
  const blob = await renderVetoResultImage(data);
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return "copied";
    }
    throw new Error("Clipboard image write unsupported");
  } catch {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.teamAName}-vs-${data.teamBName}-veto.png`.replace(/\s+/g, "-");
    a.click();
    URL.revokeObjectURL(url);
    return "downloaded";
  }
}

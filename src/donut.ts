// Donut SVG reutilizable: asigna porciones a cada valor y muestra leyenda con % y total.
// Sin dependencias; usa la misma estética que la app.

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutOptions {
  size?: number;        // px del SVG
  thickness?: number;   // grosor del anillo
  centerLabel?: string; // texto grande centrado (p.ej. total)
  centerSub?: string;   // texto pequeño bajo el total
  fmt?: (v: number) => string; // formateo de los importes de la leyenda
  showLegend?: boolean;
}

const NS = "http://www.w3.org/2000/svg";

export function donut(segments: DonutSegment[], opts: DonutOptions = {}): HTMLElement {
  const size = opts.size ?? 200;
  const thickness = opts.thickness ?? 22;
  const fmt = opts.fmt ?? ((v) => v.toFixed(2));
  const showLegend = opts.showLegend ?? true;

  const data = segments.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const total = data.reduce((s, d) => s + d.value, 0);

  const wrap = document.createElement("div");
  wrap.className = "donut-wrap";

  const chart = document.createElement("div");
  chart.className = "donut-chart";
  chart.style.width = `${size}px`;
  chart.style.height = `${size}px`;

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("role", "img");
  const insight = data[0]
    ? `${data[0].label} es la mayor porción, ${Math.round((data[0].value / total) * 100)}% del total.`
    : "Sin datos de gasto.";
  svg.setAttribute("aria-label", `Gráfico circular de gasto por categoría. ${insight}`);

  const cx = size / 2;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;

  // pista de fondo
  const track = document.createElementNS(NS, "circle");
  track.setAttribute("cx", String(cx));
  track.setAttribute("cy", String(cx));
  track.setAttribute("r", String(r));
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "rgba(255,255,255,0.07)");
  track.setAttribute("stroke-width", String(thickness));
  svg.append(track);

  // grupo rotado para empezar arriba
  const g = document.createElementNS(NS, "g");
  g.setAttribute("transform", `rotate(-90 ${cx} ${cx})`);
  const gap = data.length > 1 ? 2 : 0; // pequeño hueco entre segmentos
  let offset = 0;
  for (const d of data) {
    const frac = d.value / total;
    const len = Math.max(0, frac * C - gap);
    const arc = document.createElementNS(NS, "circle");
    arc.setAttribute("cx", String(cx));
    arc.setAttribute("cy", String(cx));
    arc.setAttribute("r", String(r));
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke", d.color);
    arc.setAttribute("stroke-width", String(thickness));
    arc.setAttribute("stroke-dasharray", `${len} ${C - len}`);
    arc.setAttribute("stroke-dashoffset", String(-offset));
    arc.setAttribute("stroke-linecap", "round");
    arc.style.transition = "stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1)";
    g.append(arc);
    offset += frac * C;
  }
  svg.append(g);
  chart.append(svg);

  if (opts.centerLabel || opts.centerSub) {
    const center = document.createElement("div");
    center.className = "donut-center";
    if (opts.centerLabel) {
      const big = document.createElement("div");
      big.className = "donut-total";
      big.textContent = opts.centerLabel;
      center.append(big);
    }
    if (opts.centerSub) {
      const sub = document.createElement("div");
      sub.className = "donut-sub";
      sub.textContent = opts.centerSub;
      center.append(sub);
    }
    chart.append(center);
  }

  wrap.append(chart);

  if (showLegend && data.length) {
    const legend = document.createElement("ul");
    legend.className = "donut-legend";
    for (const d of data) {
      const pct = Math.round((d.value / total) * 100);
      const li = document.createElement("li");
      li.className = "donut-leg-item";
      const dot = document.createElement("span");
      dot.className = "donut-leg-dot";
      dot.style.background = d.color;
      const name = document.createElement("span");
      name.className = "donut-leg-name";
      name.textContent = d.label;
      const pctEl = document.createElement("span");
      pctEl.className = "donut-leg-pct";
      pctEl.textContent = `${pct}%`;
      const amt = document.createElement("span");
      amt.className = "donut-leg-amt";
      amt.textContent = fmt(d.value);
      li.append(dot, name, pctEl, amt);
      legend.append(li);
    }
    wrap.append(legend);
  }

  return wrap;
}

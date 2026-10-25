/* Linha das últimas 24 h em SVG puro; pontos nulos (leitura que falhou) viram buracos. */
export default function Spark({ points, max, label, unit }) {
  const values = points.filter((v) => v != null);
  if (values.length < 2) return null;
  const top = max ?? Math.max(...values, 1);
  const x = (i) => (i / (points.length - 1)) * 100;
  const y = (v) => 29 - Math.min(1, Math.max(0, v / top)) * 27;
  const d = points.map((v, i) => (v == null ? '' : `${i && points[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join('');
  const lo = Math.round(Math.min(...values));
  const hi = Math.round(Math.max(...values));
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" width="100%" height="44" role="img"
        aria-label={`${label} nas últimas 24 horas: mínimo ${lo}${unit}, máximo ${hi}${unit}`}
        style={{ display: 'block', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--line)' }}>
        <path d={d} fill="none" stroke="var(--info)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <figcaption className="small muted" style={{ marginTop: 4 }}>
        {label} · <span className="mono num">{lo}–{hi}{unit}</span> em 24 h
      </figcaption>
    </figure>
  );
}

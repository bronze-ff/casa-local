import { Banner, Confidence } from '../../ui/kit.jsx';
import { fmtNum } from '../../core/format.js';

const money = (n) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

/** Gasto do ar. Sempre ESTIMADO: potência × tempo de uso pelos comandos do painel, não é medição elétrica. */
export function EnergyCard({ energy, preview }) {
  if (energy.error && !energy.data) return <Banner kind="warn" icon="off">Sem conexão para a estimativa de energia.</Banner>;
  if (!energy.data) return <p role="status" className="sub">Carregando a estimativa…</p>;
  const data = energy.data;
  return (
    <section className="sand col" aria-label="Gasto estimado do ar">
      <div className="row sp"><h2 className="h2">Gasto do ar</h2><Confidence kind={preview ? 'preview' : 'estimated'} /></div>
      {energy.stale && <p className="sub">Sem conexão: mostrando a última estimativa.</p>}
      <div className="grid two">
        {[['today', 'Hoje'], ['month', 'Este mês']].map(([period, label]) => (
          <div key={period} className="col tight">
            <span className="cap">{label}</span>
            <span className="num m">≈ {money(data[period]?.cost)}</span>
            <span className="sub">{fmtNum(data[period]?.hours, 1)} h · {fmtNum(data[period]?.kwh, 2)} kWh</span>
          </div>
        ))}
      </div>
      <p className="sub">Base: {fmtNum(data.config?.watts)} W · {money(data.config?.tariff)}/kWh. Conta pelos comandos enviados pelo painel; usar o controle original muda o real. Ajuste potência e tarifa na Central.</p>
    </section>
  );
}

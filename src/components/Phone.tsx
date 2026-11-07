import { useCallback, useEffect, useState } from 'react';
import { BellRing, Clapperboard, KeyRound, LoaderCircle, RefreshCw, Send } from 'lucide-react';
import type { useCasa } from '../useCasa';

type Casa = ReturnType<typeof useCasa>;
type Topics = 'cameras' | 'pessoas' | 'sistema' | 'casa';
type Notify = {enabled: Record<Topics, boolean>; cameraScope: 'watched' | 'all'; frigateKinds: 'pessoas' | 'tudo'; frigateCameras: string[]; topics: Record<Topics, string>; subscribe: string | null;
  external?: {topic: string; label: string; detail: string}[];
  sent: number; failed: number; lastError: string | null; frigate: boolean | null; home: boolean | null};
const TOPICS: [Topics, string, string][] = [
  ['pessoas', 'Pessoas e rostos', 'O Frigate viu alguém ou um carro, com o nome se reconheceu o rosto.'],
  ['cameras', 'Movimento nas câmeras', 'Qualquer movimento do DVR, com foto e link para a gravação.'],
  ['sistema', 'Sistema e home lab', 'Algo caiu ou voltou, disco quase cheio, GPU quente, atualização disponível.'],
  ['casa', 'Casa', 'Chegadas e saídas e as rotinas que rodaram.'],
];

async function get<T>(path: string): Promise<T | null> {
  try { const response = await fetch(path, {cache: 'no-store'}); return response.ok ? await response.json() as T : null; } catch { return null; }
}

function copy(text: string, done: (message: string) => void) {
  navigator.clipboard?.writeText(text).then(() => done('Copiado'), () => done('Selecione e copie'));
}

/** Avisos no celular (ntfy): o que chega, como assinar e um teste. */
export function PhoneAlerts({casa}: {casa: Casa}) {
  const [data, setData] = useState<Notify | null>(null);
  const [hint, setHint] = useState('');
  const load = useCallback(async () => { const value = await get<Notify>('/api/notifications'); if (value) setData(value); }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async (body: Record<string, unknown>) => { const value = await casa.post('notify', '/api/notifications', body); if (value) setData(value as unknown as Notify); };
  if (!data) return null;
  const where = data.home === true ? 'Você está em casa: câmeras chegam sem som.' : data.home === false ? 'Você está fora: câmeras chegam com som.' : 'Sem localização recente: câmeras chegam com som.';
  return <section className="central-block" aria-labelledby="phone-title">
    <div className="central-head"><h3 id="phone-title"><BellRing size={16} />Avisos no celular</h3>
      <button className="link" disabled={!!casa.busy} onClick={() => void casa.post('notify', '/api/notifications/test', {}, 'Teste enviado para os 4 tópicos').then(load)}><Send size={14} />Testar</button></div>
    <ul className="routine-list">{TOPICS.map(([id, label, detail]) => <li key={id} className={`routine ${data.enabled[id] ? '' : 'off'}`} style={{gridTemplateColumns: 'auto 1fr'}}>
      <button className={`switch ${data.enabled[id] ? 'on' : ''}`} role="switch" aria-checked={data.enabled[id]} aria-label={label} onClick={() => void save({enabled: {[id]: !data.enabled[id]}})}><i /></button>
      <div><strong>{label}</strong><span>{detail}</span></div>
    </li>)}
      {(data.external ?? []).map(item => <li key={item.topic} className="routine external" style={{gridTemplateColumns: 'auto 1fr'}}>
        <span className="topic-icon" aria-hidden="true"><Clapperboard size={16} /></span>
        <div><strong>{item.label}</strong><span>{item.detail} Assine <b>{item.topic}</b> no app ntfy para receber.</span></div>
      </li>)}</ul>
    <label className="mode-keep"><input type="checkbox" checked={data.cameraScope === 'all'} onChange={event => void save({cameraScope: event.target.checked ? 'all' : 'watched'})} />
      <span>Avisar de todas as câmeras<small>Desligado: só as câmeras com sino em Câmeras › Movimento (vale para movimento e pessoas).</small></span></label>
    <label className="mode-keep"><input type="checkbox" checked={data.frigateKinds === 'tudo'} onChange={event => void save({frigateKinds: event.target.checked ? 'tudo' : 'pessoas'})} />
      <span>Pessoas: avisar também carros e animais<small>Desligado: o Frigate só avisa quando é pessoa. Nas câmeras que ele vigia{data.frigateCameras.length ? ` (${data.frigateCameras.length})` : ''}, o movimento do DVR (bicho, bandeira, sombra) não avisa enquanto ele estiver ligado.</small></span></label>
    <p className="loc-hint">{where} {data.frigate === false ? 'O Frigate está parado (modo jogo ou subindo): pessoas voltam quando ele voltar; o movimento do DVR continua.' : ''}</p>
    <details className="routine-log"><summary>Como receber no iPhone</summary>
      <ol className="phone-steps">
        <li>Instale o app <b>ntfy</b> da App Store e, nas configurações dele, ponha o servidor padrão:
          <code className="copyable" onClick={() => data.subscribe && copy(data.subscribe, setHint)}>{data.subscribe ?? '—'}</code></li>
        <li>Toque em <b>+</b> e assine cada tópico (com o Tailscale ligado no celular):
          {[...Object.values(data.topics), ...(data.external ?? []).map(item => item.topic)].map(topic => <code key={topic} className="copyable" onClick={() => copy(topic, setHint)}>{topic}</code>)}</li>
        <li>Toque em <b>Testar</b> aqui em cima: chega um aviso em cada tópico.</li>
      </ol>
      {hint ? <p className="loc-hint">{hint}</p> : null}
    </details>
    <p className="loc-hint">{data.sent} enviados{data.failed ? ` · ${data.failed} falharam${data.lastError ? ` (${data.lastError})` : ''}` : ''}.</p>
  </section>;
}

/** Chave e endereços para os Atalhos da Siri. */
export function SiriShortcuts({casa}: {casa: Casa}) {
  const [key, setKey] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [hint, setHint] = useState('');
  const [base, setBase] = useState(window.location.origin);
  useEffect(() => {
    void get<{key: string}>('/api/shortcuts').then(value => value && setKey(value.key));
    // O atalho roda no iPhone: usa o endereço do Tailscale mesmo quando o painel foi aberto pela bandeja.
    void get<{subscribe: string | null}>('/api/notifications').then(value => value?.subscribe && setBase(value.subscribe.replace(/:10000$/, '')));
  }, []);
  const modes = casa.data?.scenes ?? [];
  return <section className="central-block" aria-labelledby="siri-title">
    <div className="central-head"><h3 id="siri-title"><KeyRound size={16} />Atalhos da Siri</h3>
      <button className="link" onClick={() => setShow(value => !value)}>{show ? 'Fechar' : 'Configurar'}</button></div>
    <p className="loc-hint">"E aí Siri, cheguei" roda o modo sem abrir o painel. Funciona com o Tailscale ligado no iPhone.</p>
    {show ? key ? <div className="routine-form">
      <ol className="phone-steps">
        <li>No app <b>Atalhos</b>, crie um atalho com a ação <b>Obter conteúdo de URL</b>, método <b>POST</b>.</li>
        <li>URL, conforme o modo:
          {modes.map(mode => <code key={mode.id} className="copyable" onClick={() => copy(`${base}/api/scenes/${mode.id}/run`, setHint)}>{mode.name}: {base}/api/scenes/{mode.id}/run</code>)}</li>
        <li>Cabeçalhos: <code>Content-Type: application/json</code> e <code>Authorization: Bearer</code> + a chave:
          <code className="copyable" onClick={() => copy(key, setHint)}>{key}</code></li>
        <li>Corpo da solicitação: JSON vazio. Dê ao atalho o nome que vai falar para a Siri ("Cheguei", "Filme"...).</li>
      </ol>
      {hint ? <p className="loc-hint">{hint}</p> : null}
      <div className="routine-actions"><button className="pill" disabled={!!casa.busy} onClick={() => void casa.post('shortcuts', '/api/shortcuts/rotate', {}, 'Chave trocada: atualize seus atalhos').then(value => value && setKey((value as unknown as {key: string}).key))}><RefreshCw size={15} />Trocar a chave</button></div>
    </div> : <div className="empty small"><LoaderCircle className="spin" size={18} /></div> : null}
  </section>;
}


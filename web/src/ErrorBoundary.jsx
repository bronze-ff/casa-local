import { Component } from 'react';
import { Icon } from './ui.jsx';

/**
 * Falha de UMA tela (import lazy que não carregou, erro de render) não derruba o painel: shell e navegação seguem.
 * Sem reload automático e sem reenviar nada; o usuário recarrega o painel quando quiser. Quem usa passa `key` da rota para zerar ao navegar.
 */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error) { console.error('Tela não abriu:', error); }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="aviso err" role="alert">
        <Icon name="alert" size={20} />
        <span><b>Esta tela não abriu.</b> O arquivo dela não carregou, em geral por falha de conexão com o PC de casa. Nenhum comando foi enviado de novo. Você pode usar o menu para outras telas.</span>
        <button type="button" className="act" onClick={() => window.location.reload()}>Recarregar painel</button>
      </div>
    );
  }
}

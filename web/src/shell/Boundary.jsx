import { Component } from 'react';
import { Icon } from '../ui/Icon.jsx';

/**
 * A falha de UMA tela (arquivo lazy que não carregou, erro de renderização) não derruba o shell nem a navegação.
 * Sem recarregar sozinho e sem reenviar nada. Quem usa passa `key` da rota para zerar ao navegar.
 */
export default class Boundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error) { console.error('Tela não abriu:', error); }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="ban err" role="alert">
        <Icon name="alert" size={22} />
        <div className="grow">
          <b>Esta tela não abriu.</b>
          O arquivo dela não carregou, em geral por falha de conexão com o PC de casa. Nenhum comando foi enviado de novo. Use o menu para outras telas.
        </div>
        <button type="button" className="btn s" onClick={() => window.location.reload()}>Recarregar painel</button>
      </div>
    );
  }
}

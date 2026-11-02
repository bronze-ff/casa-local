import Root from '../shell/Root.jsx';
import { registry } from '../routes/registry.js';

/** O app: o Root do shell com as oito rotas lazy. Nada mais mora aqui. */
export default function App() {
  return <Root registry={registry} />;
}

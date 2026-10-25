import Energy from './Central/Energy.jsx';
import Health from './Central/Health.jsx';
import Modes from './Central/Modes.jsx';
import Notifications from './Central/Notifications.jsx';
import Routines from './Central/Routines.jsx';
import Shortcuts from './Central/Shortcuts.jsx';

export default function Central() {
  // Colunas mais largas que o .grid padrão: os formulários de rotina e modo precisam de espaço.
  const columns = { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'start' };
  return (
    <>
      <div className="grid" style={columns}>
        <Health />
        <Notifications />
      </div>
      <div className="grid" style={columns}>
        <Modes />
        <Routines />
      </div>
      <div className="grid" style={columns}>
        <Energy />
        <Shortcuts />
      </div>
    </>
  );
}

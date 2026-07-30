import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { SessionUserDto } from '../../../api/contracts';
import { useEmuShiftReportsWorkspace } from '../../../hooks/useEmuShiftReportsWorkspace';
import { hasPermission } from '../../../security/permissions';
import type { EmuScreenId } from '../../../types';
import { ShiftReportEntryScreen } from './components/ShiftReportEntryScreen';
import { ShiftReportHistoryScreen } from './components/ShiftReportHistoryScreen';
import './shift-reports.css';

type ShiftReportScreen = Extract<EmuScreenId, 'emu-shift-report-entry' | 'emu-shift-report-history'>;

type BoundaryProps = { children: ReactNode };
type BoundaryState = { error: Error | null; resetToken: number };

class ShiftReportsErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, resetToken: 0 };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error, resetToken: 0 };
  }

  reset = () => {
    this.setState((current) => ({ error: null, resetToken: current.resetToken + 1 }));
  };

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The feature-local fallback is intentionally silent so one broken screen does not
    // flood the shell console or turn a recoverable render failure into a global error.
  }

  render() {
    if (this.state.error) {
      return (
        <main className='emu-shift-report-page'>
          <section className='emu-shift-card emu-shift-empty emu-shift-render-error' role='alert'>
            <h2>Не удалось открыть сменные отчёты</h2>
            <p>Экран столкнулся с неожиданной ошибкой. Повторное открытие сохранит остальные разделы приложения.</p>
            <button type='button' className='emu-refresh-button' onClick={this.reset}>Открыть повторно</button>
          </section>
        </main>
      );
    }
    return <div key={this.state.resetToken}>{this.props.children}</div>;
  }
}

function ShiftReportsFeature({ currentUser, onNotify, screen }: { currentUser: SessionUserDto | null; onNotify: (message: string) => void; screen: ShiftReportScreen }) {
  const isHistory = screen === 'emu-shift-report-history';
  const permission = isHistory ? 'emu.shift-reports.view' : 'emu.shift-reports.create';
  const workspace = useEmuShiftReportsWorkspace({ historyEnabled: isHistory, optionsEnabled: !isHistory });

  if (!currentUser || !hasPermission(currentUser, permission)) return <main className='emu-shift-report-page'><section className='emu-shift-card emu-shift-empty' role='alert'><h2>Недостаточно прав</h2><p>Для этого раздела требуется право <code>{permission}</code>.</p></section></main>;
  if (workspace.loading) return <main className='emu-shift-report-page'><section className='emu-shift-card emu-shift-empty emu-shift-loading' aria-live='polite'><span className='emu-loading-mark' aria-hidden='true' /><div className='emu-loading-stack' aria-hidden='true'><span /><span /><span /></div><h2>Загружаем данные ЭМУ</h2><p>Получаем сотрудников, участки и параметры смен.</p></section></main>;
  if (!isHistory && workspace.error) return <main className='emu-shift-report-page'><section className='emu-shift-card emu-shift-empty' role='alert'><h2>Не удалось открыть форму</h2><p>{workspace.error}</p><button type='button' className='emu-refresh-button' onClick={() => void workspace.loadOptions().catch(() => undefined)}>Повторить загрузку</button></section></main>;

  return isHistory ? <ShiftReportHistoryScreen workspace={workspace} /> : <ShiftReportEntryScreen workspace={workspace} onNotify={onNotify} canManageFavorites={hasPermission(currentUser, 'emu.favorite-employees.manage') || hasPermission(currentUser, 'emu.shift-reports.create')} />;
}

export function EmuShiftReportsScreen({ currentUser, onNotify, screen }: { currentUser: SessionUserDto | null; onNotify: (message: string) => void; screen: ShiftReportScreen }) {
  return (
    <ShiftReportsErrorBoundary key={screen}>
      <ShiftReportsFeature currentUser={currentUser} onNotify={onNotify} screen={screen} />
    </ShiftReportsErrorBoundary>
  );
}

import { AlertCircle, Plus, Send, Wrench, Zap } from 'lucide-react';
import type { FormEvent } from 'react';
import type {
  EmuShiftReportCategory,
  EmuShiftReportEmployeeOptionDto,
  EmuShiftReportSectionDto,
  EmuShiftType,
} from '../../../../api/emuShiftReportContracts';
import type { WorkRow } from '../shiftReportUi';
import { categoryLabels, shiftLabels } from '../shiftReportUi';
import { ShiftReportWorkRow } from './ShiftReportWorkRow';

export function ShiftReportForm({
  category,
  employeeId,
  reportDate,
  shiftType,
  rows,
  errors,
  employees,
  sections,
  nightWarning,
  successMessage,
  submitting,
  hasDraftData,
  onSubmit,
  onSwitchCategory,
  onEmployeeChange,
  onDateChange,
  onChooseShift,
  onUpdateRow,
  onRemoveRow,
  onAddRow,
  onRequestClear,
}: {
  category: EmuShiftReportCategory;
  employeeId: string;
  reportDate: string;
  shiftType: EmuShiftType;
  rows: WorkRow[];
  errors: Record<string, string>;
  employees: EmuShiftReportEmployeeOptionDto[];
  sections: EmuShiftReportSectionDto[];
  nightWarning: string;
  successMessage: string;
  submitting: boolean;
  hasDraftData: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchCategory: (value: EmuShiftReportCategory) => void;
  onEmployeeChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onChooseShift: (value: EmuShiftType) => void;
  onUpdateRow: (id: string, patch: Partial<WorkRow>) => void;
  onRemoveRow: (index: number) => void;
  onAddRow: () => void;
  onRequestClear: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className='emu-shift-card emu-shift-form' noValidate>
      <div className='emu-shift-tabs' role='tablist' aria-label='Категория сотрудников'>
        {(['mechanic', 'electrician'] as const).map((value) => (
          <button
            id={`shift-report-tab-${value}`}
            key={value}
            type='button'
            role='tab'
            aria-selected={category === value}
            aria-controls='shift-report-form-panel'
            tabIndex={category === value ? 0 : -1}
            className={category === value ? 'active' : ''}
            onClick={() => onSwitchCategory(value)}
          >
            {value === 'mechanic' ? <Wrench aria-hidden='true' size={17} /> : <Zap aria-hidden='true' size={17} />}
            {categoryLabels[value]}
          </button>
        ))}
      </div>

      <div id='shift-report-form-panel' className='emu-shift-panel' role='tabpanel' aria-labelledby={`shift-report-tab-${category}`}>
        <div className='emu-shift-fields'>
          <label>
            Сотрудник *
            <select id='employeeId' value={employeeId} onChange={(event) => onEmployeeChange(event.target.value)} aria-invalid={Boolean(errors.employeeId)} aria-describedby={errors.employeeId ? 'employee-error' : employees.length ? undefined : 'employee-empty-hint'}>
              <option value=''>Выберите сотрудника</option>
              {employees.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.position}</option>)}
            </select>
            {errors.employeeId ? <small id='employee-error'>{errors.employeeId}</small> : null}
            {!employees.length ? <small id='employee-empty-hint' className='warning'>Для этой профессии нет доступных сотрудников.</small> : null}
          </label>
          <label>
            Дата отчёта *
            <input id='reportDate' type='date' value={reportDate} onChange={(event) => onDateChange(event.target.value)} aria-invalid={Boolean(errors.reportDate)} aria-describedby={errors.reportDate ? 'report-date-error' : undefined} />
            {errors.reportDate ? <small id='report-date-error'>{errors.reportDate}</small> : null}
          </label>
          <fieldset>
            <legend>Смена *</legend>
            <div className='emu-shift-segment' aria-label='Смена'>
              {(['day', 'night'] as const).map((value) => (
                <button type='button' key={value} aria-pressed={shiftType === value} className={shiftType === value ? 'active' : ''} onClick={() => onChooseShift(value)}>{shiftLabels[value]}</button>
              ))}
            </div>
            {nightWarning ? <small className='warning'>{nightWarning}</small> : null}
          </fieldset>
        </div>

        {!sections.length ? <p className='emu-inline-notice'><AlertCircle aria-hidden='true' size={17} />Справочник участков пуст. Отчёт можно отправить без указания участка.</p> : null}

        <div className='emu-shift-table-wrap'>
          <table className='emu-shift-table'>
            <thead><tr><th>№</th><th>Выполненная работа *</th><th>Время *</th><th>Участок</th><th>Неисправность / примечание</th><th><span className='sr-only'>Действия</span></th></tr></thead>
            <tbody>{rows.map((item, index) => <ShiftReportWorkRow key={item.id} index={index} row={item} sections={sections} errors={errors} onChange={(patch) => onUpdateRow(item.id, patch)} onRemove={() => onRemoveRow(index)} />)}</tbody>
          </table>
        </div>

        <div className='emu-form-messages' aria-live='polite'>
          {errors.lines ? <p className='emu-form-error'>{errors.lines}</p> : null}
          {errors.form ? <p className='emu-form-error'>{errors.form}</p> : null}
          {successMessage ? <p className='emu-form-success'>{successMessage}</p> : null}
        </div>

        <footer className='emu-shift-actions'>
          <button type='button' className='secondary add-row' disabled={rows.length >= 50 || submitting} onClick={onAddRow}><Plus aria-hidden='true' size={18} />Добавить строку</button>
          <span className='emu-row-limit'>{rows.length} из 50 строк</span>
          <button type='button' className='secondary' disabled={submitting || !hasDraftData} onClick={onRequestClear}>Очистить</button>
          <button type='submit' className='primary' disabled={submitting || !employees.length}><Send aria-hidden='true' size={18} />{submitting ? 'Отправляем…' : 'Отправить отчёт'}</button>
        </footer>
      </div>
    </form>
  );
}

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useRecoverWaterOpening } from '../../../../shared/hooks/queries/useUtility';
import useEscapeClose from '../../../../shared/hooks/useEscapeClose';

const observationNow = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);

export default function RecordWaterOpeningModal({isOpen, onClose, roomId, roomName, onSuccess}) {
  const recovery = useRecoverWaterOpening();
  const firstInput = useRef(null);
  const dialog = useRef(null);
  const [form, setForm] = useState({reading:'', observedAt:'', source:'current-observation', reason:'', reference:''});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement;
    setForm({reading:'', observedAt:observationNow(), source:'current-observation', reason:'', reference:''});
    setError('');
    firstInput.current?.focus();
    return () => {
      const target = opener?.isConnected && opener !== document.body ? opener : document.querySelector('[data-utility-cycle-action]');
      target?.focus();
    };
  }, [isOpen, roomId]);
  const close = () => { if (!recovery.isPending) onClose(); };
  useEscapeClose(isOpen, close);
  if (!isOpen || typeof document === 'undefined') return null;
  const update = key => event => setForm(current => ({...current, [key]:event.target.value}));
  const submit = async event => {
    event.preventDefault();
    if (recovery.isPending) return;
    setError('');
    if (form.reading.trim() === '' || !Number.isFinite(Number(form.reading)) || Number(form.reading) < 0 || Number(form.reading) > 999999.99 || !form.observedAt || !form.reason.trim()) {
      setError('Enter the actual reading, observation time, and reason.'); return;
    }
    if (form.source === 'documented-history' && !form.reference.trim()) {
      setError('A historical observation requires an evidence reference.'); return;
    }
    try {
      const result = await recovery.mutateAsync({roomId, reading:Number(form.reading),
        observedAt:new Date(`${form.observedAt}+08:00`).toISOString(), source:form.source,
        reason:form.reason.trim(), evidenceReferences:form.reference.trim() ? [form.reference.trim()] : []});
      onSuccess?.(result);
      onClose();
    } catch (failure) { setError(failure.message || 'Unable to record the opening reading.'); }
  };
  const inputClass = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground';
  const trapFocus = event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter(control => !control.matches(':disabled'));
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); dialog.current.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4" onClick={close}>
      <form ref={dialog} tabIndex={-1} onKeyDown={trapFocus} role="dialog" aria-modal="true" aria-labelledby="water-opening-title" onSubmit={submit} onClick={event=>event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id="water-opening-title" className="text-base font-bold">Record Opening Reading</h2><p className="mt-1 text-xs text-muted-foreground">{roomName}</p></div>
          <button type="button" aria-label="Close" onClick={close} disabled={recovery.isPending}><X size={18}/></button>
        </div>
        <p className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-xs">Verified billing starts from this observation. Earlier consumption remains unknown. No charge is created. Use this recovery only for missing records; future move-ins must record their required readings during check-in.</p>
        <fieldset disabled={recovery.isPending} className="mt-4 space-y-3">
          <label className="block text-xs font-semibold">Actual Water Reading (m³)<input ref={firstInput} className={inputClass} type="number" min="0" max="999999.99" step="0.01" value={form.reading} onChange={update('reading')} required/></label>
          <label className="block text-xs font-semibold">Observation Date and Time (Philippine time)<input className={inputClass} type="datetime-local" value={form.observedAt} max={observationNow()} onChange={update('observedAt')} required/></label>
          <label className="block text-xs font-semibold">Reading Source<select className={inputClass} value={form.source} onChange={update('source')}><option value="current-observation">Current physical observation</option><option value="documented-history">Documented historical observation</option></select></label>
          <label className="block text-xs font-semibold">Reason<textarea className={inputClass} maxLength={1000} value={form.reason} onChange={update('reason')} required/></label>
          <label className="block text-xs font-semibold">Evidence Reference {form.source === 'documented-history' ? '(required)' : '(optional)'}<input className={inputClass} maxLength={500} value={form.reference} onChange={update('reference')} required={form.source === 'documented-history'}/></label>
        </fieldset>
        {error && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={close} disabled={recovery.isPending} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={recovery.isPending} className="rounded-lg bg-[#0A1628] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">{recovery.isPending ? 'Recording…' : 'Save Opening Reading'}</button></div>
      </form>
    </div>, document.body);
}

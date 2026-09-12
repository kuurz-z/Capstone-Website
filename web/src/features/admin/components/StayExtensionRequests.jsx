import { useCallback, useEffect, useState } from 'react';
import { authFetch } from '../../../shared/api/httpClient';
import { showNotification } from '../../../shared/utils/notification';

const date = (value) => new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
export default function StayExtensionRequests({ onReviewed }) {
  const [requests, setRequests] = useState([]), [error, setError] = useState('');
  const [notes, setNotes] = useState({}), [busy, setBusy] = useState(null);
  const load = useCallback(async () => {
    try { const result = await authFetch('/tenant/stay-extension-requests'); setRequests(result.requests || []); setError(''); }
    catch (err) { setError(err.message || 'Unable to load extension requests.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const review = async (request, decision) => {
    if (busy) return;
    setBusy(request._id);
    try {
      await authFetch(`/tenant/stay-extension-requests/${request._id}`, { method: 'PATCH', body: JSON.stringify({ decision, adminNote: notes[request._id] || '' }) });
      showNotification(`Stay extension ${decision}.`, 'success'); await load(); onReviewed?.();
    } catch (err) { showNotification(err.message || 'Unable to review request.', 'error'); }
    finally { setBusy(null); }
  };
  return <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900" aria-label="Stay extension requests">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Stay extension requests</h2><button type="button" onClick={load} className="text-sm text-blue-700 dark:text-blue-300">Refresh</button></div>
    {error ? <p role="alert" className="mt-3 text-red-700 dark:text-red-300">{error}</p> : null}
    {!requests.length && !error ? <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">No extension requests.</p> : null}
    <div className="space-y-4">{requests.map((request) => <article key={request._id} className="mt-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold text-gray-900 dark:text-white">{request.tenantId?.firstName} {request.tenantId?.lastName} · {request.roomId?.name || request.roomId?.roomNumber}</h3><span className="text-sm capitalize text-gray-700 dark:text-gray-200">{request.status}</span></div>
      <dl className="mt-2 grid gap-2 text-sm text-gray-700 dark:text-gray-200 sm:grid-cols-2">
        <div><dt className="font-medium">Current contract</dt><dd>{date(request.currentStartDate)} – {date(request.currentEndDate)}</dd></div>
        <div><dt className="font-medium">Requested extension</dt><dd>{request.months} months, through {date(request.requestedEndDate)}</dd></div>
        <div><dt className="font-medium">Monthly rent for extension</dt><dd>{Number(request.monthlyRent).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</dd></div>
        <div><dt className="font-medium">Reason / note</dt><dd className="whitespace-pre-wrap break-words">{request.reason || 'No reason supplied'}{request.note ? `\n${request.note}` : ''}</dd></div>
      </dl>
      {request.status === 'pending' ? <div className="mt-3 space-y-3">
        <label className="block text-sm text-gray-700 dark:text-gray-200">Admin note (optional)<textarea aria-label={`Admin note for ${request.tenantId?.firstName || 'tenant'}`} maxLength={1000} value={notes[request._id] || ''} onChange={(event) => setNotes({ ...notes, [request._id]: event.target.value })} className="mt-1 block w-full rounded border border-gray-400 bg-white p-2 text-gray-900 dark:bg-gray-800 dark:text-white" /></label>
        <p className="text-xs text-gray-600 dark:text-gray-300">Approval processes the existing renewal workflow. Contract preparation, signing, and rent activation rules apply.</p>
        <div className="flex gap-3"><button type="button" disabled={Boolean(busy)} onClick={() => review(request, 'approved')} className="rounded bg-blue-900 px-4 py-2 text-sm text-white disabled:opacity-50">Approve extension</button><button type="button" disabled={Boolean(busy)} onClick={() => review(request, 'rejected')} className="rounded border border-red-700 px-4 py-2 text-sm text-red-700 disabled:opacity-50 dark:text-red-300">Reject</button></div>
      </div> : request.adminNote ? <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">Admin note: {request.adminNote}</p> : null}
    </article>)}</div>
  </section>;
}

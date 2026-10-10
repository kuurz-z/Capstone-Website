import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import React from 'react';
import { createPortal } from 'react-dom';
import { JSDOM } from 'jsdom';
import * as support from '../../../../shared/utils/supportConcern.js';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/admin/chat' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(document, 'hidden', { value: false, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react');
async function load(file, name, dependencies = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/import[\s\S]*?from\s+["'][^"']+["'];/g, '')
    .replace(/import\s+["'][^"']+["'];/g, '')
    .replace('export default function', 'function').replace('export function', 'function');
  const { code } = await transform(source, { loader: 'jsx', format: 'cjs' });
  const deps = { React, ...React, ...support, ...dependencies };
  return new Function(...Object.keys(deps), `${code}; return ${name};`)(...Object.values(deps));
}

const quickReplies = new Function('return ' + readFileSync(new URL('./chatConstants.js', import.meta.url), 'utf8').match(/export const QUICK_REPLIES = (\[[\s\S]*?\]);/)[1])();
const text = 'Please confirm whether this resolved your concern.';
const Icon = () => null;
const icons = Object.fromEntries(['ChevronDown','ChevronUp','FileText','LoaderCircle','Paperclip','Send','Sparkles','X','XCircle','Zap','Tag','Check','MessageSquareText','RefreshCw'].map((name) => [name, Icon]));
const record = (id = 'A', status = 'open', revision = 7) => ({ id: 'thread-' + id, revision, request: { id, status, concern: 'Synthetic concern', tenantUserId: 'qa-tenant' } });
async function setup() {
  let state, records = [record(), record('B')];
  const sends = [], mutations = [], notices = [];
  const actor = { id: 'admin', role: 'branch_admin' }, location = { search: '' };
  const api = {
    getAdminConversations: async () => ({ conversations: records }),
    getAdminMessages: async (id) => ({ conversation: records.find((r) => r.id === id), messages: [] }),
    sendAdminMessage: async (...args) => { sends.push(args); return { conversation: records[0], message: { id: 'message', message: args[1] } }; },
    updateStatus: async (...args) => { mutations.push(args); const index = records.findIndex((r) => r.id === args[0]); records[index] = { ...records[index], revision: 8, request: { ...records[index].request, status: args[1], resolvedAt: '2026-10-10T00:00:00Z', resolvedBy: 'admin' } }; return { conversation: records[index] }; },
  };
  const hook = await load('./useAdminChat.js', 'useAdminChat', { chatApi: api, useNavigate: () => () => {}, useLocation: () => location, useAuth: () => ({ user: actor }), useChatSocket: () => ({ isConnected: false }), showNotification: (m) => notices.push(m), getErrorMessage: (e) => e.message, getStatusLabel: (s) => s });
  const Composer = await load('./AdminChatComposer.jsx', 'AdminChatComposer', { ...icons, chatApi: api, QUICK_REPLIES: quickReplies, MAX_SUPPORT_ATTACHMENTS: 5, fmtFileSize: () => '1 KB' });
  const Modal = await load('./AdminChatStatusModal.jsx', 'AdminChatStatusModal', { ...icons, createPortal, STATUS_OPTIONS: ['open','in_review','waiting_tenant','resolved','closed'].map((value) => ({ value, label: value })), STATUS_DESCRIPTIONS: {} });
  const Page = await load('../../pages/AdminChatPage.jsx', 'AdminChatPage', { ...icons,
    useAdminChat: () => { state = hook(); return state; }, AdminChatComposer: Composer, AdminChatStatusModal: Modal,
    ...Object.fromEntries(['AdminPageHeader','AdminChatSkeleton','AdminChatConversationList','AdminChatMessageFeed','AdminChatMetricsOverview','AdminChatClosedBanner','AdminChatCloseModal','AdminChatPriorityModal','AdminChatLightboxModal'].map((name) => [name, Icon])),
    AdminChatTicketSidebar: ({ onOpenStatusModal }) => React.createElement('button', { onClick: onOpenStatusModal }, 'Status menu'),
  });
  const view = render(React.createElement(Page));
  await waitFor(() => assert.equal(state.conversations.length, 2));
  await act(async () => state.handleSelectConversation(state.conversations[0]));
  const open = () => { fireEvent.click(view.getByText('Quick Replies')); fireEvent.click(view.getByRole('button', { name: text })); };
  return { view, open, api, sends, mutations, notices, get state() { return state; }, setRecords: (next) => { records = next; } };
}
const submit = (view) => view.getAllByRole('button', { name: 'Mark as Resolved' }).at(-1);

test('existing page shortcut preselects resolved, preserves draft/attachments, requires note; cancel writes nothing', async () => {
  const h = await setup();
  try {
    const attachments = [{ file: {}, name: 'draft.pdf', size: 10 }];
    await act(async () => { h.state.setReplyText('Keep this draft'); h.state.setStagedAttachments(attachments); });
    h.open();
    assert.ok(h.view.getByRole('dialog'));
    assert.ok(h.view.getByLabelText('Resolution note'));
    assert.equal(submit(h.view).disabled, true);
    assert.equal(h.state.replyText, 'Keep this draft'); assert.equal(h.state.stagedAttachments, attachments);
    fireEvent.click(h.view.getByRole('button', { name: 'Cancel' }));
    assert.equal(h.view.queryByRole('dialog'), null); assert.equal(h.mutations.length, 0); assert.equal(h.sends.length, 0);
    fireEvent.click(h.view.getByText('Status menu'));
    assert.equal(h.view.queryByLabelText('Resolution note'), null, 'normal status menu does not retain shortcut preset');
  } finally { cleanup(); }
});

test('shortcut confirms exactly once with request identity/revision through existing endpoint', async () => {
  const h = await setup();
  try {
    h.open(); fireEvent.change(h.view.getByLabelText('Resolution note'), { target: { value: ' Fixed fixture ' } });
    await act(async () => { fireEvent.click(submit(h.view)); fireEvent.click(submit(h.view)); });
    assert.deepEqual(h.mutations, [['thread-A','resolved','Fixed fixture',{ status:'resolved',note:'Fixed fixture',requestId:'A',revision:7 }]]);
    assert.equal(h.sends.length, 0); assert.equal(h.state.selectedConversation.status, 'resolved');
    assert.equal(h.view.queryByRole('dialog'), null);
    await act(async () => h.state.handleOpenStatusModal('resolved'));
    assert.equal(h.view.queryByRole('dialog'), null);
  } finally { cleanup(); }
});

test('ordinary quick replies and manually entered confirmation wording remain ordinary messages', async () => {
  const h = await setup();
  try {
    fireEvent.click(h.view.getByText('Quick Replies'));
    fireEvent.click(h.view.getByRole('button', { name: 'We have received your concern.' }));
    assert.equal(h.state.replyText, 'We have received your concern.');
    await act(async () => h.state.setReplyText(text));
    await act(async () => fireEvent.click(h.view.getByRole('button', { name: 'Send Reply' })));
    assert.deepEqual(h.sends, [['thread-A',text,[]]]); assert.equal(h.mutations.length, 0);
  } finally { cleanup(); }
});

test('stale revision refreshes the concern and surfaces an error without ordinary send fallback', async () => {
  const h = await setup();
  try {
    h.api.updateStatus = async () => { h.setRecords([record('A','waiting_tenant',9), record('B')]); throw Object.assign(new Error('Refresh this concern'), { response: { status:409 } }); };
    h.open(); fireEvent.change(h.view.getByLabelText('Resolution note'), { target: { value:'Fixed' } });
    await act(async () => fireEvent.click(submit(h.view)));
    assert.equal(h.state.selectedConversation.revision, 9); assert.ok(h.notices.some((m) => /latest status/.test(m))); assert.equal(h.sends.length, 0);
  } finally { cleanup(); }
});

test('switching concerns closes the shortcut and old response cannot alter the selected concern', async () => {
  const h = await setup();
  try {
    let finish; h.api.updateStatus = () => new Promise((resolve) => { finish = resolve; });
    h.open(); fireEvent.change(h.view.getByLabelText('Resolution note'), { target: { value:'Fix A' } });
    await act(async () => fireEvent.click(submit(h.view)));
    await act(async () => h.state.handleSelectConversation(h.state.conversations[1]));
    assert.equal(h.view.queryByRole('dialog'), null);
    await act(async () => finish({ conversation: record('A','resolved',8) }));
    assert.equal(h.state.selectedConversation.id,'thread-B'); assert.equal(h.state.selectedConversation.status,'open');
  } finally { cleanup(); }
});

test('permission rejection stays an error; no ordinary-message fallback or local resolved state', async () => {
  const h = await setup();
  try {
    h.api.updateStatus = async () => { throw Object.assign(new Error('Access denied'), { response: {status:403} }); };
    h.open(); fireEvent.change(h.view.getByLabelText('Resolution note'), { target: {value:'Fixed'} });
    await act(async () => fireEvent.click(submit(h.view)));
    assert.ok(h.view.getByRole('alert')); assert.equal(h.state.selectedConversation.status,'open'); assert.equal(h.sends.length,0);
  } finally { cleanup(); }
});

for (const status of ['resolved','closed']) test(`${status} concerns cannot open the resolution shortcut`, async () => {
  const h = await setup();
  try {
    h.setRecords([record('A',status,9),record('B')]);
    await act(async () => h.state.handleRefresh());
    await act(async () => h.state.handleOpenStatusModal('resolved'));
    assert.equal(h.view.queryByRole('dialog'),null); assert.equal(h.mutations.length,0);
  } finally { cleanup(); }
});

test('shortcut is disabled while an ordinary reply is pending', async () => {
  const h = await setup();
  try {
    let finish; h.api.sendAdminMessage = () => new Promise((resolve) => { finish = resolve; });
    await act(async () => h.state.setReplyText('ordinary reply'));
    await act(async () => fireEvent.click(h.view.getByRole('button',{name:'Send Reply'})));
    fireEvent.click(h.view.getByText('Quick Replies'));
    const shortcut = h.view.getByRole('button',{name:text});
    assert.equal(shortcut.disabled,true); fireEvent.click(shortcut);
    assert.equal(h.view.queryByRole('dialog'),null);
    await act(async () => finish({conversation:record(),message:{id:'m',message:'ordinary reply'}}));
  } finally { cleanup(); }
});

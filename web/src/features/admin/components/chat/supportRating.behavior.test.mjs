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
    .replace('export default function', 'function').replace('export function', 'function');
  const { code } = await transform(source, { loader: 'jsx', format: 'cjs' });
  const deps = { React, ...React, ...support, ...dependencies };
  return new Function(...Object.keys(deps), `${code}; return ${name};`)(...Object.values(deps));
}
const request = (revision = 1, rated = false) => ({ id: 'thread-A', revision, request: {
  id: 'A', status: 'resolved', concern: 'Billing concern', satisfaction: rated ? {
    requestId: 'A', rating: 5, feedback: 'Thank you, resolved na po.', submittedAt: '2026-09-27T01:00:00Z',
  } : null,
} });
test('queue keeps same-tenant concerns separate and rated sidebar disables lifecycle actions', async () => {
  const Empty = () => null;
  const identity = (value) => typeof value === 'string' ? value : '';
  const deps = Object.fromEntries(['Inbox', 'Search', 'SlidersHorizontal', 'X', 'XCircle', 'ProfileAvatar', 'ChatConversationListSkeleton',
    'AlertTriangle', 'ChevronDown', 'FileDown', 'FileText', 'LoaderCircle', 'Lock', 'UserCheck', 'AdminIssueClusterBanner', 'AdminSupportRequestDetails'].map((name) => [name, Empty]));
  for (const name of ['getStatusLabel', 'getCategoryLabel', 'getPriorityLabel', 'getBranchLabel', 'getRoomLabel', 'getInitials', 'fmtRelativeTime']) deps[name] = identity;
  Object.assign(deps, { STATUS_OPTIONS: [], CATEGORY_OPTIONS: [], PRIORITY_OPTIONS: [], BRANCH_OPTIONS: [], STATUS_SECTION_ORDER: ['open', 'resolved'], useNavigate: () => () => {} });
  const List = await load('./AdminChatConversationList.jsx', 'AdminChatConversationList', deps);
  const Sidebar = await load('./AdminChatTicketSidebar.jsx', 'AdminChatTicketSidebar', deps);
  const a = support.normalizeSupportConcern({ ...request(2, true), tenantId: 'tenant', tenantName: 'Tenant' });
  const b = support.normalizeSupportConcern({ id: 'thread-B', tenantId: 'tenant', tenantName: 'Tenant', request: { id: 'B', status: 'open', concern: 'Concern B' } });
  const c = support.normalizeSupportConcern({ ...b, id: 'thread-C', request: { ...b.request, id: 'C', concern: 'Concern C' } });
  try {
    const list = render(React.createElement(List, { conversations: [a, b, c] }));
    assert.ok(list.getByText('Concern B')); assert.ok(list.getByText('Concern C')); assert.ok(list.getByText('★ 5/5'));
    cleanup();
    const sidebar = render(React.createElement(Sidebar, { selectedConversation: a }));
    assert.equal(sidebar.getByTitle('Click to update status with confirmation').disabled, true);
    assert.equal(sidebar.getByTitle('Click to update priority').disabled, true);
    assert.equal(sidebar.queryByText('Close thread'), null); assert.equal(sidebar.queryByText('Assign to me'), null);
  } finally { cleanup(); }
});
test('details render saved stars, feedback and submission date as read-only; active B stays separate', async () => {
  const Details = await load('./AdminSupportRequestDetails.jsx', 'AdminSupportRequestDetails');
  try {
    const view = render(React.createElement(Details, { concern: support.normalizeSupportConcern(request(2, true)) }));
    assert.ok(view.getByLabelText('5 out of 5 stars'));
    assert.ok(view.getByText(/Feedback: Thank you/)); assert.ok(view.getByText(/Submitted:/));
    assert.equal(view.queryByRole('textbox'), null); assert.equal(view.queryByRole('button'), null);
    view.rerender(React.createElement(Details, { concern: support.normalizeSupportConcern({ id: 'thread-B', request: { id: 'B', status: 'open' } }) }));
    assert.equal(view.queryByLabelText('Tenant Satisfaction'), null);
    view.rerender(React.createElement(Details, { concern: support.normalizeSupportConcern(request()) }));
    assert.ok(view.getByText('Not yet rated'));
  } finally { cleanup(); }
});
test('resolve modal requires a note and disables duplicate submissions', async () => {
  const Icon = () => null;
  const Modal = await load('./AdminChatStatusModal.jsx', 'AdminChatStatusModal', { createPortal, Tag: Icon, X: Icon, Check: Icon, LoaderCircle: Icon,
    STATUS_OPTIONS: ['open', 'in_review', 'waiting_tenant', 'resolved', 'closed'].map((value) => ({ value, label: value })), STATUS_DESCRIPTIONS: {} });
  const props = { isOpen: true, currentStatus: 'waiting_tenant', concern: support.normalizeSupportConcern({ id: 't', request: { id: 'A', status: 'waiting_tenant' } }), onConfirm: () => {}, onClose: () => {} };
  try {
    const view = render(React.createElement(Modal, props));
    fireEvent.click(view.getByText('resolved'));
    assert.equal(view.getByText('Confirm Status Change').closest('button').disabled, true);
    fireEvent.change(view.getByLabelText('Resolution note'), { target: { value: 'Fixed the charge' } });
    assert.equal(view.getByText('Confirm Status Change').closest('button').disabled, false);
    view.rerender(React.createElement(Modal, { ...props, updating: true }));
    assert.equal(view.getByText('Confirm Status Change').closest('button').disabled, true);
  } finally { cleanup(); }
});
test('focus receives mobile rating in list and detail; stale revision cannot remove it; 409 refetches state', async () => {
  let state, serverValue = request(), resolveOld;
  const notices = [];
  const actor = { id: 'admin', role: 'branch_admin' };
  const location = { search: '' };
  const api = {
    getAdminConversations: async () => ({ conversations: [serverValue] }),
    getAdminMessages: async () => ({ conversation: serverValue, messages: [] }),
    updateStatus: async () => { serverValue = request(12, true); throw Object.assign(new Error('State changed'), { response: { status: 409 } }); },
  };
  const hook = await load('./useAdminChat.js', 'useAdminChat', { chatApi: api, useNavigate: () => () => {}, useLocation: () => location,
    useAuth: () => ({ user: actor }), useChatSocket: () => ({ isConnected: true }),
    showNotification: (message) => notices.push(message), getErrorMessage: (error) => error.message, getStatusLabel: (s) => s });
  function Harness() { state = hook(); return React.createElement('div', null, state.selectedConversation?.rating ?? 'unrated'); }
  try {
    const view = render(React.createElement(Harness));
    await waitFor(() => assert.equal(state.conversations.length, 1));
    await act(async () => state.handleSelectConversation(state.conversations[0]));
    await act(async () => state.handleConfirmStatusChange('in_review'));
    assert.equal(state.selectedConversation.rating, 5); assert.equal(state.conversations[0].rating, 5);
    assert.ok(notices.some((text) => /latest status/.test(text)));
    // An older snapshot from a later read must still lose to the saved revision.
    serverValue = request(11, false);
    await act(async () => window.dispatchEvent(new window.Event('focus')));
    assert.equal(state.selectedConversation.rating, 5); assert.equal(state.conversations[0].rating, 5);
    // Overlapping reads: a delayed older request is ignored altogether.
    api.getAdminConversations = () => new Promise((resolve) => { resolveOld = resolve; });
    await act(async () => window.dispatchEvent(new window.Event('focus')));
    api.getAdminConversations = async () => ({ conversations: [request(13, true)] });
    await act(async () => window.dispatchEvent(new window.Event('focus')));
    await act(async () => resolveOld({ conversations: [request(10, false)] }));
    assert.equal(state.selectedConversation.revision, 13); assert.equal(view.getByText('5').textContent, '5');
    // A stale failed list read must not replace a newer successful refresh.
    let rejectOld;
    api.getAdminConversations = () => new Promise((_resolve, reject) => { rejectOld = reject; });
    await act(async () => window.dispatchEvent(new window.Event('focus')));
    api.getAdminConversations = async () => ({ conversations: [request(14, true)] });
    await act(async () => window.dispatchEvent(new window.Event('focus')));
    await act(async () => rejectOld(new Error('Old offline response')));
    assert.equal(state.listError, '');
    assert.equal(state.selectedConversation.revision, 14);
  } finally { cleanup(); }
});

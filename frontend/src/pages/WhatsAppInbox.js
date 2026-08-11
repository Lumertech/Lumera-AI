import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare, Send, Search, RefreshCw, Inbox,
  CheckCheck, Check, Clock, AlertCircle, User, ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// ─── Delivery tick indicator ─────────────────────────────────────────────────
const DeliveryTick = ({ status }) => {
  if (!status || status === 'none') return null;
  if (status === 'read')
    return <CheckCheck className="h-4 w-4 text-blue-500 inline-block ml-1 flex-shrink-0" title="Read" />;
  if (status === 'delivered')
    return <CheckCheck className="h-4 w-4 text-slate-400 inline-block ml-1 flex-shrink-0" title="Delivered" />;
  if (status === 'sent')
    return <Check className="h-4 w-4 text-slate-400 inline-block ml-1 flex-shrink-0" title="Sent" />;
  if (status === 'failed')
    return <AlertCircle className="h-4 w-4 text-red-400 inline-block ml-1 flex-shrink-0" title="Failed" />;
  return null;
};

// ─── Format timestamp ─────────────────────────────────────────────────────────
const fmtTime = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return d.toLocaleDateString('en-IN', { weekday: 'short' });
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
};

// ─── Conversation list item ───────────────────────────────────────────────────
const ConversationRow = ({ thread, active, onClick }) => (
  <button
    onClick={onClick}
    data-testid={`conv-row-${thread.phone}`}
    className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors border-b border-slate-100
      ${active ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : ''}`}
  >
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-teal-400 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
      {(thread.patient_name || 'P')[0].toUpperCase()}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-900 text-sm truncate">{thread.patient_name}</span>
        <span className="text-xs text-slate-400 flex-shrink-0 ml-2">{fmtTime(thread.last_at)}</span>
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <p className="text-xs text-slate-500 truncate max-w-[160px]">
          {thread.last_direction === 'outbound' && <span className="text-slate-400">You: </span>}
          {thread.last_message}
        </p>
        {thread.unread_count > 0 && (
          <span className="ml-2 flex-shrink-0 bg-green-500 text-white rounded-full text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {thread.unread_count}
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-400 mt-0.5">{thread.phone}</p>
    </div>
  </button>
);

// ─── Single message bubble ────────────────────────────────────────────────────
const MessageBubble = ({ msg }) => {
  const isOut = msg.direction === 'outbound';
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-1`}>
      <div
        className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm shadow-sm
          ${isOut
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'}`}
      >
        {msg.text || (msg.button_reply?.title && (
          <span className="italic">Replied: {msg.button_reply.title}</span>
        )) || <span className="italic text-xs opacity-70">(media)</span>}
        <div className={`text-[10px] mt-0.5 flex items-center gap-0.5 justify-end
          ${isOut ? 'text-indigo-200' : 'text-slate-400'}`}>
          {fmtTime(msg.created_at)}
          {isOut && <DeliveryTick status="sent" />}
        </div>
      </div>
    </div>
  );
};

// ─── Main WhatsApp Inbox page ─────────────────────────────────────────────────
const WhatsAppInbox = () => {
  const [threads, setThreads] = useState([]);
  const [activePhone, setActivePhone] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingConv, setLoadingConv] = useState(false);
  const [search, setSearch] = useState('');
  const [showLeftOnMobile, setShowLeftOnMobile] = useState(true);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/meta-whatsapp/conversations`);
      setThreads(res.data || []);
    } catch (err) {
      // Meta not configured — show empty state without error
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const loadConversation = useCallback(async (phone) => {
    if (!phone) return;
    setLoadingConv(true);
    try {
      const res = await axios.get(`${API_URL}/meta-whatsapp/conversations/${encodeURIComponent(phone)}`);
      setConversation(res.data);
      // Also refresh threads to clear unread counts
      loadThreads();
    } catch (err) {
      toast.error('Failed to load conversation');
    } finally {
      setLoadingConv(false);
    }
  }, [loadThreads]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  // Initial load + poll every 10s
  useEffect(() => {
    loadThreads();
    pollRef.current = setInterval(loadThreads, 10_000);
    return () => clearInterval(pollRef.current);
  }, [loadThreads]);

  // Poll active conversation every 6s
  useEffect(() => {
    if (!activePhone) return;
    const t = setInterval(() => loadConversation(activePhone), 6_000);
    return () => clearInterval(t);
  }, [activePhone, loadConversation]);

  const openThread = (phone) => {
    setActivePhone(phone);
    loadConversation(phone);
    setShowLeftOnMobile(false);
  };

  const sendReply = async () => {
    if (!reply.trim() || !activePhone) return;
    setSending(true);
    try {
      await axios.post(`${API_URL}/meta-whatsapp/send`, {
        to: activePhone,
        body: reply.trim(),
      });
      setReply('');
      await loadConversation(activePhone);
      toast.success('Message sent');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const filteredThreads = threads.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.patient_name?.toLowerCase().includes(q) || t.phone?.includes(q);
  });

  const totalUnread = threads.reduce((sum, t) => sum + (t.unread_count || 0), 0);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-120px)]" data-testid="whatsapp-inbox">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-manrope font-bold text-xl text-slate-900">
                WhatsApp Inbox
                {totalUnread > 0 && (
                  <Badge className="ml-2 bg-green-500 text-white" data-testid="inbox-unread-badge">
                    {totalUnread} new
                  </Badge>
                )}
              </h1>
              <p className="text-xs text-slate-500">Real-time patient conversations</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadThreads} data-testid="inbox-refresh-btn">
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        {/* Main chat area */}
        <div className="flex flex-1 min-h-0 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          {/* ── Left: Thread list ── */}
          <div className={`w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col border-r border-slate-200
            ${!showLeftOnMobile ? 'hidden md:flex' : 'flex'}`}>
            {/* Search */}
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder="Search patients…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="inbox-search"
                />
              </div>
            </div>

            {/* Thread list */}
            <div className="flex-1 overflow-y-auto">
              {loadingThreads && (
                <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading…
                </div>
              )}
              {!loadingThreads && filteredThreads.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                    <Inbox className="h-8 w-8 text-slate-400" />
                  </div>
                  <p className="font-medium text-slate-700 mb-1">No conversations yet</p>
                  <p className="text-xs text-slate-500">
                    Conversations appear here once patients reply to your WhatsApp messages via Meta Cloud API.
                    Configure Meta WhatsApp in Settings to get started.
                  </p>
                </div>
              )}
              {filteredThreads.map((t) => (
                <ConversationRow
                  key={t.phone}
                  thread={t}
                  active={t.phone === activePhone}
                  onClick={() => openThread(t.phone)}
                />
              ))}
            </div>
          </div>

          {/* ── Right: Conversation thread ── */}
          <div className={`flex-1 flex flex-col min-w-0
            ${showLeftOnMobile ? 'hidden md:flex' : 'flex'}`}>
            {!activePhone ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-4">
                  <MessageSquare className="h-10 w-10 text-green-400" />
                </div>
                <p className="font-semibold text-slate-700 text-lg mb-2">Select a conversation</p>
                <p className="text-sm text-slate-500 max-w-xs">
                  Choose a patient thread from the left panel to view messages and reply.
                </p>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-7 w-7"
                    onClick={() => setShowLeftOnMobile(true)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-teal-400 flex items-center justify-center text-white font-bold text-sm">
                    {(conversation?.patient_name || 'P')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm" data-testid="conv-patient-name">
                      {conversation?.patient_name || activePhone}
                    </p>
                    <p className="text-xs text-slate-500">{activePhone}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-400"></span>
                    <span className="text-xs text-green-600">WhatsApp</span>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 bg-[#f0ece4]/30 space-y-1" data-testid="conv-messages">
                  {loadingConv && (
                    <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading messages…
                    </div>
                  )}
                  {!loadingConv && (conversation?.messages || []).length === 0 && (
                    <div className="text-center text-slate-400 text-sm py-8">No messages yet</div>
                  )}
                  {(conversation?.messages || []).map((msg, idx) => (
                    <MessageBubble key={idx} msg={msg} />
                  ))}
                  <div ref={bottomRef} />
                </div>

                {/* Reply bar */}
                <div className="px-4 py-3 border-t border-slate-100 bg-white flex items-center gap-2" data-testid="reply-bar">
                  <div className="flex items-center gap-1 mr-1">
                    <User className="h-4 w-4 text-slate-400" />
                    <span className="text-xs text-slate-500">Front desk</span>
                  </div>
                  <Input
                    className="flex-1 h-9 text-sm"
                    placeholder="Type a message…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    data-testid="reply-input"
                  />
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 h-9 px-3"
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    data-testid="reply-send-btn"
                  >
                    {sending
                      ? <RefreshCw className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default WhatsAppInbox;

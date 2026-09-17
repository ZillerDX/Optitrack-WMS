"use client";

/**
 * OptiTrack AI Warehouse Intelligence Core
 * High-tech glassmorphic command center widget with real-time stock velocity,
 * predictive reordering, custom API key configuration, and dark cybernetic aesthetics.
 * STRICTLY 100% ENGLISH.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  Send,
  Loader2,
  Sparkles,
  Trash2,
  X,
  Bot,
  ChevronRight,
  BarChart3,
  Package,
  TrendingDown,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PredictiveReorderAgentModal } from './PredictiveReorderAgentModal';

interface Message {
  id: string;
  content: string;
  isBot: boolean;
  timestamp: Date;
}

interface ChatUser {
  first_name: string;
  last_name: string;
  email: string;
  image_url?: string;
}

export function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isPredictiveOpen, setIsPredictiveOpen] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<ChatUser | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);

  const getStorageKey = useCallback((email?: string) => {
    const sanitized = email ? email.replace(/[^a-zA-Z0-9_]/g, '_') : 'guest';
    return `optitrack_ai_history_${sanitized}`;
  }, []);

  const getImageUrl = (path?: string) => {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
  };

  const userImageUrl = getImageUrl(user?.image_url);
  const userInitial = user?.first_name ? user.first_name.charAt(0).toUpperCase() : 'U';
  const userDisplayName = user ? `${user.first_name} ${user.last_name}`.trim() || user.email : 'User';

  useEffect(() => {
    const loadUser = () => {
      const userStr = localStorage.getItem('user');
      if (!userStr) {
        setUser(null);
        return;
      }

      try {
        setUser(JSON.parse(userStr) as ChatUser);
      } catch {
        setUser(null);
      }
    };

    loadUser();
    window.addEventListener('storage', loadUser);
    window.addEventListener('focus', loadUser);

    return () => {
      window.removeEventListener('storage', loadUser);
      window.removeEventListener('focus', loadUser);
    };
  }, []);

  // Load chat history from localStorage whenever active user is resolved
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = getStorageKey(user?.email);
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(
            parsed.map((m: any) => ({
              ...m,
              timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
            }))
          );
        } else {
          setMessages([]);
        }
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.warn('[AIChatWidget] Failed to load saved chat history:', err);
    } finally {
      setIsHistoryLoaded(true);
    }
  }, [user?.email, getStorageKey]);

  // Persist messages to localStorage whenever messages change
  useEffect(() => {
    if (!isHistoryLoaded || typeof window === 'undefined') return;
    const key = getStorageKey(user?.email);
    try {
      if (messages.length > 0) {
        localStorage.setItem(key, JSON.stringify(messages));
      } else {
        localStorage.removeItem(key);
      }
    } catch (err) {
      console.warn('[AIChatWidget] Failed to save chat history:', err);
    }
  }, [messages, isHistoryLoaded, user?.email, getStorageKey]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messages.length > 1 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 250);
  }, []);

  const sendMessage = async (text?: string) => {
    const messageToSend = text || inputMessage;
    if (!messageToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageToSend,
      isBot: false,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const historyPayload = messages.slice(-8).map((m) => ({
        role: m.isBot ? 'assistant' : 'user',
        content: m.content,
      }));
      const response = await api.sendChatMessage(messageToSend, historyPayload);
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response.response,
        isBot: true,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch {
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'I encountered an error connecting to the intelligence core. Please try again in a moment.',
        isBot: true,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    if (typeof window !== 'undefined') {
      const key = getStorageKey(user?.email);
      localStorage.removeItem(key);
    }
  };

  // Quick Bento Actions for Warehouse Operations (STRICTLY 100% ENGLISH)
  const quickQuestions = [
    {
      badge: 'AUTOMATION',
      label: 'Stock Velocity & Draft POs',
      desc: 'Analyze burn rate, Days of Inventory (DOI), and prepare draft POs',
      value: 'Analyze stock velocity and consumption rates across all warehouse items. Calculate Days of Inventory (DOI), identify critical low stock, and prepare a draft Purchase Order (PO) with suggested quantities.',
      icon: Sparkles,
      iconBg: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400',
      badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
      glow: 'from-indigo-600/15 to-transparent',
      hoverBorder: 'hover:border-indigo-500/60',
    },
    {
      badge: 'RISK ALERT',
      label: '7-Day Stockout Risk',
      desc: 'Forecast items at critical risk of stockout within the next 7 days',
      value: 'Forecast products at critical risk of stockout within the next 7 days based on recent outbound sales and burn rate.',
      icon: TrendingDown,
      iconBg: 'bg-rose-500/20 border-rose-500/40 text-rose-400',
      badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      glow: 'from-rose-600/15 to-transparent',
      hoverBorder: 'hover:border-rose-500/60',
    },
    {
      badge: 'INVENTORY',
      label: 'Urgent Low Stock Levels',
      desc: 'Identify items below safety threshold and calculate replenishment',
      value: 'What items are currently low in stock and need reordering? Show me the most urgent items with suggested replenishment quantities.',
      icon: Package,
      iconBg: 'bg-amber-500/20 border-amber-500/40 text-amber-400',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      glow: 'from-amber-600/15 to-transparent',
      hoverBorder: 'hover:border-amber-500/60',
    },
    {
      badge: 'FINANCIALS',
      label: 'Valuation & Category Margins',
      desc: 'Total cost basis, market valuation, and category margin analysis',
      value: 'What is the total inventory value? Show me a breakdown by category with profit margins.',
      icon: BarChart3,
      iconBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      glow: 'from-emerald-600/15 to-transparent',
      hoverBorder: 'hover:border-emerald-500/60',
    },
  ];

  return (
    <>
      <PredictiveReorderAgentModal 
        isOpen={isPredictiveOpen} 
        onClose={() => setIsPredictiveOpen(false)} 
      />

      {/* Floating Launch Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 group focus:outline-none"
          aria-label="Open AI Assistant"
        >
          {/* Animated gradient aura */}
          <div className="absolute -inset-1.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 rounded-3xl blur-md opacity-70 group-hover:opacity-100 transition-all duration-500 animate-pulse" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 border border-slate-700/80 text-white shadow-2xl shadow-blue-500/30 transition-all duration-300 group-hover:scale-105 group-hover:border-blue-500/60 active:scale-95">
            <Sparkles className="h-6 w-6 text-blue-400 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            <span className="absolute top-1 right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-slate-900" />
            </span>
          </div>
          {/* Floating Tooltip */}
          <div className="absolute bottom-full right-0 mb-3 px-3 py-1.5 bg-slate-900/95 border border-slate-800 text-slate-200 text-xs font-semibold rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:-translate-y-1 pointer-events-none whitespace-nowrap shadow-2xl backdrop-blur-md">
            OptiTrack AI Core
            <div className="absolute top-full right-5 -mt-1 w-2 h-2 bg-slate-900 border-r border-b border-slate-800 rotate-45" />
          </div>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden transition-all duration-300",
            "inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[calc(100vh-3rem)] sm:max-h-[700px] sm:w-[460px] sm:max-w-[calc(100vw-2.5rem)] lg:w-[540px] xl:w-[580px] sm:rounded-3xl",
            "bg-slate-950/95 backdrop-blur-2xl shadow-2xl shadow-black/90 border border-slate-800/90 ring-1 ring-white/10",
            isClosing
              ? "opacity-0 scale-95 translate-y-4"
              : "opacity-100 scale-100 translate-y-0 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300"
          )}
        >
          {/* Header */}
          <div className="relative flex items-center justify-between px-5 py-3.5 flex-shrink-0 border-b border-slate-800/80 bg-slate-900/90">
            {/* Ambient header glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-indigo-600/5 to-purple-600/10 pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

            {/* Left Brand Identity */}
            <div className="relative flex items-center gap-3">
              <div className="relative">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/20">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-slate-950 shadow-md shadow-emerald-500/50" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-white tracking-tight leading-none">
                    OptiTrack AI
                  </h3>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-400 font-bold uppercase tracking-wider">
                    v2.4
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                    Live Warehouse Core
                  </span>
                </div>
              </div>
            </div>

            {/* Right Action Controls */}
            <div className="relative flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsPredictiveOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 border border-indigo-400/30 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm hover:scale-105 active:scale-95"
                title="Launch Predictive Reorder Agent"
              >
                <Sparkles className="size-3.5 text-indigo-300" />
                <span className="text-[11px]">Reorder Agent</span>
              </button>

              <button
                onClick={clearChat}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all"
                title="Clear Chat History"
              >
                <Trash2 size={15} />
              </button>
              <button
                onClick={handleClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                title="Minimize Chat"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gradient-to-b from-slate-950 via-slate-900/90 to-slate-950 scrollbar-thin scrollbar-thumb-slate-800">
            {messages.length === 0 ? (
              <div className="min-h-full flex flex-col items-center justify-start text-center px-1 pt-4 pb-2">
                {/* Glowing Core Visual */}
                <div className="relative mb-4 animate-in fade-in zoom-in-75 duration-500">
                  <div className="absolute -inset-4 bg-gradient-to-r from-blue-600/30 via-indigo-600/30 to-purple-600/30 rounded-full blur-2xl animate-pulse" />
                  <div className="relative p-4 rounded-2xl bg-slate-900/90 border border-slate-800 ring-1 ring-blue-500/30 shadow-2xl">
                    <Bot size={32} className="text-blue-400" />
                  </div>
                </div>

                <h4 className="text-base font-extrabold bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent mb-1 animate-in fade-in duration-500">
                  Autonomous Warehouse Core
                </h4>
                <p className="text-xs text-slate-400 max-w-[320px] mb-5 leading-relaxed animate-in fade-in duration-500">
                  Real-time stock velocity, burn-rate forecasting, and instant draft purchase orders powered by OptiTrack AI.
                </p>

                {/* Quick Action Bento Grid */}
                <div className="w-full space-y-2.5 text-left">
                  <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Quick Operations
                    </span>
                    <span className="text-[10px] text-blue-400 font-mono">
                      1-Click Analysis
                    </span>
                  </div>

                  {quickQuestions.map((q, index) => (
                    <button
                      key={index}
                      onClick={() => sendMessage(q.value)}
                      className={cn(
                        "group relative flex items-start gap-3.5 w-full p-3.5 rounded-2xl text-left transition-all duration-300",
                        "bg-slate-900/90 border border-slate-800/90 shadow-md shadow-black/40",
                        "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/5",
                        q.hoverBorder,
                        "overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-400"
                      )}
                      style={{ animationDelay: `${250 + index * 60}ms` }}
                    >
                      {/* Ambient hover glow */}
                      <div className={cn("absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none", q.glow)} />

                      {/* Icon Container */}
                      <div className={cn(
                        "flex-shrink-0 h-10 w-10 rounded-xl border flex items-center justify-center transition-all duration-300 shadow-inner",
                        q.iconBg,
                        "group-hover:scale-105"
                      )}>
                        <q.icon size={18} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-slate-100 group-hover:text-white transition-colors truncate">
                            {q.label}
                          </span>
                          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider", q.badgeClass)}>
                            {q.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 group-hover:text-slate-300 leading-snug line-clamp-1 transition-colors">
                          {q.desc}
                        </p>
                      </div>

                      {/* Chevron */}
                      <div className="flex-shrink-0 self-center pl-1">
                        <ChevronRight
                          size={16}
                          className="text-slate-600 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all duration-300"
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center pt-0.5 pb-1">
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-900/80 border border-slate-800 px-3 py-0.5 rounded-full shadow-sm select-none">
                    Real-time Intelligence Session
                  </span>
                </div>

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
                      message.isBot ? "justify-start" : "justify-end"
                    )}
                  >
                    <div
                      className={cn(
                        "flex min-w-0 gap-2.5",
                        message.isBot ? "max-w-[96%]" : "max-w-[85%] sm:max-w-[80%]",
                        !message.isBot && "flex-row-reverse"
                      )}
                    >
                      {/* Avatar */}
                      <div
                        className={cn(
                          "h-7 w-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-auto mb-1 overflow-hidden transition-all duration-300",
                          message.isBot
                            ? "bg-slate-900 border border-slate-800 text-blue-400 shadow-md ring-1 ring-blue-500/20"
                            : "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
                        )}
                      >
                        {message.isBot ? (
                          <Bot size={15} />
                        ) : userImageUrl ? (
                          <Image
                            src={userImageUrl}
                            alt={userDisplayName}
                            width={28}
                            height={28}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-bold">{userInitial}</span>
                        )}
                      </div>

                      {/* Bubble */}
                      <div
                        className={cn(
                          "min-w-0 rounded-2xl px-4 py-3 transition-all duration-200",
                          message.isBot
                            ? "bg-slate-900/95 text-slate-200 rounded-bl-sm border border-slate-800 shadow-xl shadow-black/40"
                            : "bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white rounded-br-sm shadow-lg shadow-blue-500/20 border border-blue-400/20"
                        )}
                      >
                        {message.isBot ? (
                          <div className="overflow-x-auto text-[13px] leading-relaxed">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                table: ({ children }) => (
                                  <div className="overflow-x-auto my-2.5 rounded-xl border border-slate-800 bg-slate-950/70 shadow-inner">
                                    <table className="w-full text-left text-xs border-collapse">{children}</table>
                                  </div>
                                ),
                                thead: ({ children }) => (
                                  <thead className="bg-slate-800/90 text-blue-300 font-bold border-b border-slate-700/80 text-[10px] uppercase tracking-wider">
                                    {children}
                                  </thead>
                                ),
                                th: ({ children }) => (
                                  <th className="p-2.5 font-bold text-blue-300">{children}</th>
                                ),
                                td: ({ children }) => (
                                  <td className="p-2 border-t border-slate-800 text-slate-300 font-mono text-[11px]">{children}</td>
                                ),
                                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-slate-200">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1 text-slate-300">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1 text-slate-300">{children}</ol>,
                                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                                strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
                                code: ({ inline, children, ...props }: any) =>
                                  inline ? (
                                    <code className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-[11px] border border-slate-700" {...props}>
                                      {children}
                                    </code>
                                  ) : (
                                    <pre className="p-2.5 my-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 overflow-x-auto font-mono text-xs">
                                      <code>{children}</code>
                                    </pre>
                                  ),
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-[13px] whitespace-pre-wrap leading-relaxed">{message.content}</p>
                        )}
                        <p
                          className={cn(
                            "text-[9px] mt-1.5 font-medium",
                            message.isBot ? "text-slate-400" : "text-blue-200"
                          )}
                        >
                          {new Intl.DateTimeFormat('default', {
                            hour: '2-digit',
                            minute: '2-digit',
                          }).format(message.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex gap-2.5 max-w-[85%] items-end">
                  <div className="h-7 w-7 rounded-lg bg-slate-900 border border-slate-800 text-blue-400 shadow-md flex items-center justify-center">
                    <Bot size={15} />
                  </div>
                  <div className="bg-slate-900/90 rounded-2xl rounded-bl-sm px-4 py-3 border border-slate-800 shadow-lg">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-duration:1s]" />
                        <div className="h-2 w-2 rounded-full bg-indigo-500 animate-bounce [animation-duration:1s] [animation-delay:0.15s]" />
                        <div className="h-2 w-2 rounded-full bg-purple-500 animate-bounce [animation-duration:1s] [animation-delay:0.3s]" />
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium pl-1">
                        Analyzing warehouse data...
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-1" />
          </div>

          {/* Input Area */}
          <div className="relative flex-shrink-0 bg-slate-950 px-4 pt-3 pb-4 border-t border-slate-800/80">
            <div
              className={cn(
                "relative flex items-end gap-2 rounded-2xl border p-1.5 transition-all duration-300",
                inputMessage.trim()
                  ? "bg-slate-900/95 border-blue-500/80 ring-2 ring-blue-500/20 shadow-lg shadow-blue-500/5"
                  : "bg-slate-900/80 border-slate-800"
              )}
            >
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask about inventory velocity, value, replenishment..."
                disabled={isLoading}
                rows={1}
                className="flex-1 max-h-28 bg-transparent border-none focus:ring-0 focus:outline-none text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 p-2.5 resize-none scrollbar-hide leading-relaxed"
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !inputMessage.trim()}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 flex-shrink-0",
                  inputMessage.trim()
                    ? "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105 active:scale-95"
                    : "bg-slate-800 text-slate-600 cursor-not-allowed"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 ml-0.5" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between px-1 mt-2.5">
              <div className="flex items-center gap-1.5">
                <Sparkles size={11} className="text-blue-400" />
                <p className="text-[10px] text-slate-400 font-medium">
                  OptiTrack AI Engine
                </p>
              </div>
              <p className="text-[9px] text-slate-400 font-mono">
                Real-time Sync Active
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

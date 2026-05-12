"use client";

/**
 * Enchanted AI Chat Widget
 * Premium glassmorphism design with animated gradients,
 * floating orbs, and refined micro-interactions.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Loader2,
  Sparkles,
  Trash2,
  Minus,
  Bot,
  ChevronRight,
  Zap,
  BarChart3,
  Package,
  TrendingUp,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<ChatUser | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const getImageUrl = (path?: string) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${API_BASE_URL}${path}`;
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

  // Auto-scroll to bottom
  useEffect(() => {
    if (messages.length > 1 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 300);
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
      const response = await api.sendChatMessage(messageToSend);
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
        content: 'I encountered an error connecting to the intelligence core. Please try again.',
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
  };

  // English prompts for AI regardless of UI language
  const quickQuestions = [
    {
      label: 'Inventory Levels',
      value: "What items are currently low in stock and need reordering? Show me the most urgent items.",
      icon: Package,
      gradient: "from-amber-500 to-orange-500",
      bg: "bg-amber-500/10",
      ring: "ring-amber-500/20",
    },
    {
      label: 'Total Value',
      value: "What is the total inventory value? Show me a breakdown by category with profit margins.",
      icon: BarChart3,
      gradient: "from-emerald-500 to-teal-500",
      bg: "bg-emerald-500/10",
      ring: "ring-emerald-500/20",
    },
    {
      label: 'Recent Activity',
      value: "Show me recent transactions and sales analytics. What are the top selling products?",
      icon: TrendingUp,
      gradient: "from-violet-500 to-purple-500",
      bg: "bg-violet-500/10",
      ring: "ring-violet-500/20",
    },
  ];

  return (
    <>
      {/* Floating Launch Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 group"
        >
          {/* Animated gradient ring */}
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl blur-md opacity-60 group-hover:opacity-100 transition-opacity duration-500 animate-pulse" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white shadow-2xl shadow-blue-500/25 transition-all duration-300 hover:scale-110 hover:shadow-blue-500/40 active:scale-95">
            <Sparkles className="h-6 w-6 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
          </div>
          {/* Tooltip */}
          <div className="absolute bottom-full right-0 mb-3 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:-translate-y-1 pointer-events-none whitespace-nowrap shadow-xl">
            AI Assistant
            <div className="absolute top-full right-5 -mt-1 w-2 h-2 bg-slate-900 rotate-45" />
          </div>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden transition-all duration-300",
            "inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[calc(100vh-3rem)] sm:max-h-[680px] sm:w-[440px] sm:max-w-[calc(100vw-3rem)] lg:w-[520px] xl:w-[560px] sm:rounded-3xl",
            "bg-white/95 backdrop-blur-xl shadow-2xl shadow-slate-900/20 border border-white/80",
            isClosing
              ? "opacity-0 scale-95 translate-y-4"
              : "opacity-100 scale-100 translate-y-0 animate-in slide-in-from-bottom-4 zoom-in-95 duration-400"
          )}
        >
          {/* Header */}
          <div className="relative flex items-center justify-between px-5 py-4 flex-shrink-0 overflow-hidden">
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900" />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/15 via-purple-600/10 to-indigo-600/15 animate-gradient-shift" />
            {/* Subtle bottom glow */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

            <div className="relative flex items-center gap-3">
              <div className="relative">
                {/* Avatar glow */}
                <div className="absolute -inset-1 bg-gradient-to-tr from-blue-500 to-indigo-500 rounded-xl blur opacity-40" />
                <div className="relative h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg ring-1 ring-white/10">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-slate-900 shadow-lg shadow-emerald-500/50" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white tracking-tight leading-none mb-1">
                  OptiTrack AI
                </h3>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
                    Online
                  </span>
                </div>
              </div>
            </div>

            <div className="relative flex items-center gap-0.5">
              <button
                onClick={clearChat}
                className="p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200 hover:scale-105"
                title="Clear chat"
              >
                <Trash2 size={15} />
              </button>
              <button
                onClick={handleClose}
                className="p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-200 hover:scale-105"
              >
                <Minus size={18} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 bg-gradient-to-b from-slate-50/80 to-white/50 scrollbar-hide">
            {messages.length === 0 ? (
              <div className="min-h-full flex flex-col items-center justify-start text-center px-2 pt-6 pb-6">
                {/* Animated orb */}
                <div className="relative mb-5 animate-in fade-in zoom-in-50 duration-700 delay-300">
                  <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-purple-500/20 rounded-full blur-xl animate-pulse" />
                  <div className="relative p-5 rounded-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 ring-1 ring-blue-200/50">
                    <Zap size={28} className="text-blue-600" />
                  </div>
                </div>

                <h4 className="text-base font-bold text-slate-900 mb-1.5 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-400">
                  Warehouse Intelligence
                </h4>
                <p className="text-xs text-slate-500 max-w-[250px] mb-7 leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-500 delay-500">
                  Analyze stock levels, track values, and discover trends across your warehouse in real-time.
                </p>

                {/* Quick question cards */}
                <div className="w-full space-y-2.5">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-3">
                    Quick actions
                  </p>
                  {quickQuestions.map((q, index) => (
                    <button
                      key={index}
                      onClick={() => sendMessage(q.value)}
                      className={cn(
                        "group flex items-center gap-3 w-full p-3.5 rounded-2xl text-left transition-all duration-300",
                        "bg-white border border-slate-100/80 shadow-sm",
                        "hover:shadow-lg hover:-translate-y-0.5 hover:border-slate-200",
                        "animate-in fade-in slide-in-from-bottom-2 duration-500",
                      )}
                      style={{ animationDelay: `${500 + index * 100}ms` }}
                    >
                      <div className={cn(
                        "flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center transition-all duration-300 ring-1",
                        q.bg, q.ring,
                        "group-hover:scale-110 group-hover:shadow-md"
                      )}>
                        <q.icon size={16} className={cn("bg-gradient-to-r bg-clip-text", q.gradient)} style={{ color: 'currentColor' }} />
                      </div>
                      <span className="flex-1 text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                        {q.label}
                      </span>
                      <ChevronRight
                        size={14}
                        className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all duration-300"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, i) => (
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
                          ? "bg-white border border-slate-200/80 text-blue-600 shadow-sm"
                          : "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
                      )}
                    >
                      {message.isBot ? (
                        <Bot size={14} />
                      ) : userImageUrl ? (
                        <img
                          src={userImageUrl}
                          alt={userDisplayName}
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
                          ? "bg-white text-slate-800 rounded-bl-sm border border-slate-100/80 shadow-sm"
                          : "bg-gradient-to-tr from-blue-600 via-blue-600 to-indigo-600 text-white rounded-br-sm shadow-lg shadow-blue-500/15"
                      )}
                    >
                      {message.isBot ? (
                        <div className="overflow-x-auto text-[13px] prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-slate-800 prose-pre:text-slate-100 prose-th:border-slate-200 prose-td:border-slate-200 prose-table:border-collapse prose-table:w-full prose-table:text-[11px] prose-th:text-left prose-th:p-1.5 prose-td:p-1.5 prose-th:align-top prose-td:align-top prose-a:text-blue-600">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-[13px] whitespace-pre-wrap leading-relaxed">{message.content}</p>
                      )}
                      <p
                        className={cn(
                          "text-[9px] mt-1.5 font-medium",
                          message.isBot ? "text-slate-300" : "text-blue-200"
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
              ))
            )}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex gap-2.5 max-w-[80%] items-end">
                  <div className="h-7 w-7 rounded-lg bg-white border border-slate-200/80 text-blue-600 shadow-sm flex items-center justify-center">
                    <Bot size={14} />
                  </div>
                  <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3.5 border border-slate-100/80 shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce [animation-duration:1.2s]" />
                      <div className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce [animation-duration:1.2s] [animation-delay:0.15s]" />
                      <div className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce [animation-duration:1.2s] [animation-delay:0.3s]" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-1" />
          </div>

          {/* Input Area */}
          <div className="relative flex-shrink-0">
            {/* Top shadow fade */}
            <div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-white/90 to-transparent pointer-events-none" />

            <div className="bg-white/90 backdrop-blur-sm px-4 pt-3 pb-4 pb-safe border-t border-slate-100/80">
              <div
                className={cn(
                  "relative flex items-end gap-2 rounded-2xl border p-1.5 transition-all duration-300",
                  inputMessage.trim()
                    ? "bg-white border-blue-200 ring-4 ring-blue-500/5 shadow-sm"
                    : "bg-slate-50/80 border-slate-200/80"
                )}
              >
                <textarea
                  ref={inputRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask about inventory, value, trends..."
                  disabled={isLoading}
                  rows={1}
                  className="flex-1 max-h-28 bg-transparent border-none focus:ring-0 focus:outline-none text-sm text-slate-800 placeholder:text-slate-400 p-2.5 resize-none scrollbar-hide leading-relaxed"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={isLoading || !inputMessage.trim()}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 flex-shrink-0",
                    inputMessage.trim()
                      ? "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105 active:scale-95"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 ml-0.5" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 mt-2.5">
                <Sparkles size={9} className="text-slate-300" />
                <p className="text-[9px] text-slate-400 font-medium tracking-wider">
                  Powered by OptiTrack AI
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global styles for gradient animation */}
      <style jsx global>{`
        @keyframes gradient-shift {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .animate-gradient-shift {
          animation: gradient-shift 4s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}

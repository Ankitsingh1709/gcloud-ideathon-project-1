import React, { useState, useRef } from 'react';
import { JournalEntry } from '../types';
import { 
  Calendar, Hash, Trash2, Share2, ChevronLeft, 
  ChevronRight, Mail, Twitter, MessageSquare, Copy, Check, X 
} from 'lucide-react';

interface SidebarEntryItemProps {
  key?: string;
  entry: JournalEntry;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  getMoodColor: (mood: string) => any;
}

export default function SidebarEntryItem({
  entry,
  isSelected,
  onSelect,
  onDelete,
  getMoodColor
}: SidebarEntryItemProps) {
  const [isSwiped, setIsSwiped] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Touch gestures state
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);

  const snippet = entry.messages[0]?.content || 'Empty Reflection';
  const displayTitle = entry.title || 'Untitled reflection';

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Touch handlers for fluid swiping
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    touchCurrentX.current = e.touches[0].clientX;
    
    const diff = touchCurrentX.current - touchStartX.current;
    // Prevent default scrolling behavior if swiping horizontally
    if (Math.abs(diff) > 10) {
      if (e.cancelable) e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchCurrentX.current === null) return;
    const diff = touchCurrentX.current - touchStartX.current;

    if (diff < -50) {
      // Swipe Left - Reveal
      setIsSwiped(true);
    } else if (diff > 50) {
      // Swipe Right - Reset
      setIsSwiped(false);
    }

    touchStartX.current = null;
    touchCurrentX.current = null;
  };

  // Sharing utilities
  const handleCopyLink = () => {
    const textToCopy = `--- REFLECT.AI JOURNAL ENTRY ---\nTitle: ${displayTitle}\nDate: ${formatDate(entry.createdAt)}\n\nReflection snippet: ${snippet}\n\nAI Summary: ${entry.summary || 'None synthesized yet'}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareEmailUrl = () => {
    const subject = encodeURIComponent(`Reflection Entry: ${displayTitle}`);
    const body = encodeURIComponent(`Here is a reflection entry from my Reflect.ai space:\n\nTitle: ${displayTitle}\nDate: ${formatDate(entry.createdAt)}\n\nReflection snippet:\n"${snippet}"\n\nAI Synthesized Summary:\n"${entry.summary || 'None yet.'}"`);
    return `mailto:?subject=${subject}&body=${body}`;
  };

  const shareTwitterUrl = () => {
    const text = encodeURIComponent(`Reflecting on my thoughts with Reflect.ai: "${displayTitle}" 🧘✨ #mindfulness`);
    return `https://twitter.com/intent/tweet?text=${text}`;
  };

  const shareWhatsAppUrl = () => {
    const text = encodeURIComponent(`*My Reflect.ai Reflection*\n*Title*: ${displayTitle}\n*Date*: ${formatDate(entry.createdAt)}\n\n_snippet_: "${snippet}"\n\n_AI Summary_: "${entry.summary || 'None yet.'}"`);
    return `https://api.whatsapp.com/send?text=${text}`;
  };

  return (
    <div 
      className="relative overflow-hidden w-full h-auto bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] mb-2 shadow-sm group select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      id={`entry-wrapper-${entry.id}`}
    >
      {/* Background action buttons revealed upon swiping */}
      <div className="absolute top-0 bottom-0 right-0 w-[130px] flex items-center justify-end px-2 gap-1 bg-[#121212] border-l border-[#2a2a2a]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsShareModalOpen(true);
            setIsSwiped(false);
          }}
          className="flex-1 h-10 bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] text-white rounded-xl flex items-center justify-center hover:opacity-95 transition cursor-pointer"
          title="Share Reflection"
          id={`share-btn-reveal-${entry.id}`}
        >
          <Share2 className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('Are you sure you want to permanently delete this journal reflection?')) {
              onDelete();
            }
            setIsSwiped(false);
          }}
          className="flex-1 h-10 bg-rose-600 text-white rounded-xl flex items-center justify-center hover:bg-rose-700 transition cursor-pointer"
          title="Delete Reflection"
          id={`delete-btn-reveal-${entry.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Foreground card container */}
      <div
        onClick={onSelect}
        style={{ transform: isSwiped ? 'translateX(-130px)' : 'translateX(0)' }}
        className={`w-full text-left p-3.5 rounded-2xl transition-transform duration-300 ease-out flex flex-col space-y-2 border cursor-pointer relative z-10 ${
          isSelected 
            ? 'bg-[#1e1e1e] border-[#333] shadow-md' 
            : 'bg-[#151515] border-transparent hover:bg-[#1c1c1c]'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-semibold ${isSelected ? 'text-[#8b5cf6]' : 'text-[#666]'} flex items-center`}>
            <Calendar className="w-3 h-3 mr-1" />
            {formatDate(entry.createdAt)}
          </span>
          
          {/* Desktop/Mouse Indicator / Interactive Swiper Trigger */}
          <div className="flex items-center space-x-1">
            {entry.isDraft && (
              <span className="text-[9px] bg-[#1a1a1a] text-[#888] px-1.5 py-0.5 rounded-full border border-[#2a2a2a]">
                Draft
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsSwiped(!isSwiped);
              }}
              className="text-[#555] hover:text-[#8b5cf6] p-1 rounded transition hidden group-hover:block"
              title="Toggle Actions"
            >
              {isSwiped ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        
        <h4 className="font-semibold text-white text-sm line-clamp-1 leading-snug">
          {displayTitle}
        </h4>

        <p className="text-xs text-[#888] line-clamp-2 leading-relaxed">
          {snippet}
        </p>

        <div className="flex items-center space-x-1.5 pt-0.5">
          {entry.category && (
            <span className="text-[9px] font-medium text-[#ccc] bg-[#1e1e1e] border border-[#333] px-1.5 py-0.5 rounded-md flex items-center">
              <Hash className="w-2.5 h-2.5 mr-0.5 text-[#666]" />
              {entry.category}
            </span>
          )}
          {entry.mood && (
            <span className={`text-[9px] font-semibold border px-1.5 py-0.5 rounded-md flex items-center ${getMoodColor(entry.mood)}`}>
              {entry.mood}
            </span>
          )}
        </div>
      </div>

      {/* Share Dialog Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 bg-[#000]/80 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm" id="share-modal-overlay">
          <div className="w-full max-w-sm bg-[#121212] border border-[#2a2a2a] rounded-3xl p-6 shadow-2xl relative space-y-6">
            <button 
              onClick={() => setIsShareModalOpen(false)}
              className="absolute top-4 right-4 text-[#666] hover:text-[#ccc] transition p-1.5 rounded-lg hover:bg-[#1a1a1a] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">Share Reflection</h3>
              <p className="text-xs text-[#666]">Choose how you would like to share your insights.</p>
            </div>

            {/* Platform Sharing Links */}
            <div className="grid grid-cols-2 gap-3">
              <a
                href={shareEmailUrl()}
                className="flex flex-col items-center justify-center p-4 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#8b5cf6]/50 rounded-2xl transition text-center space-y-2 group cursor-pointer"
              >
                <div className="p-3 bg-gradient-to-br from-[#8b5cf6]/10 to-[#8b5cf6]/30 rounded-xl text-[#8b5cf6]">
                  <Mail className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-white">Email</span>
              </a>

              <a
                href={shareTwitterUrl()}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center justify-center p-4 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-sky-500/50 rounded-2xl transition text-center space-y-2 group cursor-pointer"
              >
                <div className="p-3 bg-sky-500/10 rounded-xl text-sky-400">
                  <Twitter className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-white">Twitter / X</span>
              </a>

              <a
                href={shareWhatsAppUrl()}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center justify-center p-4 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-emerald-500/50 rounded-2xl transition text-center space-y-2 group cursor-pointer"
              >
                <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-white">WhatsApp</span>
              </a>

              <button
                onClick={handleCopyLink}
                className="flex flex-col items-center justify-center p-4 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-purple-500/50 rounded-2xl transition text-center space-y-2 group cursor-pointer"
              >
                <div className={`p-3 rounded-xl transition ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-purple-500/10 text-purple-400'}`}>
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </div>
                <span className="text-xs font-semibold text-white">
                  {copied ? 'Copied!' : 'Copy Text'}
                </span>
              </button>
            </div>

            <div className="p-3.5 bg-[#181818] border border-[#222] rounded-2xl text-[11px] text-[#888] leading-relaxed">
              <span className="font-semibold text-white block mb-0.5">Note on privacy:</span>
              Sharing publishes chosen content outward. Your internal Reflect.ai workspace stays fully private and protected.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

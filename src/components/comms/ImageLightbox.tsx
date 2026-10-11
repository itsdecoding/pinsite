"use client";

import React, { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from "lucide-react";

export interface LightboxImage {
  url: string;
  name?: string;
}

interface ImageLightboxProps {
  isOpen: boolean;
  images: LightboxImage[];
  initialIndex?: number;
  onClose: () => void;
  senderName?: string;
}

export function ImageLightbox({
  isOpen,
  images,
  initialIndex = 0,
  onClose,
  senderName,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);

  // Sync index when initialIndex changes or modal opens
  useEffect(() => {
    setCurrentIndex(initialIndex);
    setScale(1);
  }, [initialIndex, isOpen]);

  const handlePrev = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setScale(1);
      setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    },
    [images.length]
  );

  const handleNext = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setScale(1);
      setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    },
    [images.length]
  );

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const current = images[currentIndex];
      if (!current?.url) return;
      const a = document.createElement("a");
      a.href = current.url;
      a.download = current.name || `attachment-${currentIndex + 1}.png`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [images, currentIndex]
  );

  // Keyboard navigation: Escape to close, arrows to navigate
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex] || images[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div
        className="w-full flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition active:scale-95"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            {senderName && (
              <h4 className="text-xs font-semibold text-white truncate">
                {senderName}
              </h4>
            )}
            <p className="text-[11px] text-zinc-400 font-mono truncate">
              {images.length > 1
                ? `${currentIndex + 1} of ${images.length}`
                : currentImage.name || "Photo"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-zinc-400">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setScale((s) => Math.min(s + 0.25, 2.5));
            }}
            className="p-2 rounded-full hover:text-white hover:bg-white/10 transition"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setScale((s) => Math.max(s - 0.25, 0.75));
            }}
            className="p-2 rounded-full hover:text-white hover:bg-white/10 transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="p-2 rounded-full hover:text-white hover:bg-white/10 transition"
            title="Download image"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Center Image Stage */}
      <div
        className="flex-1 relative flex items-center justify-center p-2 sm:p-6 overflow-hidden"
        onClick={onClose}
      >
        {/* Navigation Arrow Left */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-3 sm:left-6 z-20 p-2 sm:p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition active:scale-95 border border-white/10"
            title="Previous (Left Arrow)"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* The Image */}
        <div
          className="relative max-w-full max-h-full flex items-center justify-center overflow-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentImage.url}
            alt={currentImage.name || "Preview"}
            style={{ transform: `scale(${scale})` }}
            className="max-w-[94vw] max-h-[80vh] object-contain rounded-xl shadow-2xl transition-transform duration-150"
          />
        </div>

        {/* Navigation Arrow Right */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-3 sm:right-6 z-20 p-2 sm:p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white transition active:scale-95 border border-white/10"
            title="Next (Right Arrow)"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip for Multi-Image Messages */}
      {images.length > 1 && (
        <div
          className="w-full py-3 px-4 bg-black/40 border-t border-white/10 flex items-center justify-center gap-2 overflow-x-auto z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setScale(1);
                setCurrentIndex(idx);
              }}
              className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition shrink-0 ${
                idx === currentIndex
                  ? "border-[#F95721] scale-105"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.name || ""}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

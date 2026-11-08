'use client';

import { useState, useCallback, useMemo } from 'react';
import Image from 'next/image';

interface GalleryItem {
  id: string;
  name: string;
  description?: string;
  url: string;
  type: 'image' | 'video' | 'audio';
  width?: number;
  height?: number;
  size: number;
  tags: string[];
  collections: string[];
  viewCount: number;
}

interface HDGalleryProps {
  items: GalleryItem[];
  layout?: 'grid' | 'masonry' | 'list';
  onSelect?: (item: GalleryItem) => void;
  sortBy?: 'recent' | 'views' | 'size' | 'name';
}

export function HDGallery({
  items,
  layout = 'masonry',
  onSelect,
  sortBy = 'recent',
}: HDGalleryProps) {
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [viewerOpen, setViewerOpen] = useState(false);

  const filteredItems = useMemo(() => {
    let result = items;

    if (filterType !== 'all') {
      result = result.filter((i) => i.type === filterType);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return result.sort((a, b) => {
      switch (sortBy) {
        case 'views':
          return (b.viewCount ?? 0) - (a.viewCount ?? 0);
        case 'size':
          return (b.size ?? 0) - (a.size ?? 0);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'recent':
        default:
          return 0;
      }
    });
  }, [items, filterType, searchQuery, sortBy]);

  const handleSelectItem = useCallback(
    (item: GalleryItem) => {
      setSelectedItem(item);
      setViewerOpen(true);
      onSelect?.(item);
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!viewerOpen) return;
      if (e.key === 'Escape') setViewerOpen(false);
      if (e.key === 'ArrowLeft') {
        const idx = filteredItems.findIndex((i) => i.id === selectedItem?.id);
        if (idx > 0) handleSelectItem(filteredItems[idx - 1]);
      }
      if (e.key === 'ArrowRight') {
        const idx = filteredItems.findIndex((i) => i.id === selectedItem?.id);
        if (idx < filteredItems.length - 1) handleSelectItem(filteredItems[idx + 1]);
      }
    },
    [viewerOpen, selectedItem, filteredItems, handleSelectItem]
  );

  return (
    <div className="w-full">
      {/* Search and Filter Bar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <input
          type="text"
          placeholder="Zoeken..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="all">Alle types</option>
          <option value="image">Afbeeldingen</option>
          <option value="video">Video's</option>
          <option value="audio">Audio</option>
        </select>
      </div>

      {/* Gallery Grid */}
      <div
        className={`grid gap-4 ${
          layout === 'masonry'
            ? 'auto-rows-max columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4'
            : layout === 'grid'
              ? 'grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'flex flex-col gap-2'
        }`}
      >
        {filteredItems.map((item) => (
          <GalleryItemCard
            key={item.id}
            item={item}
            onClick={() => handleSelectItem(item)}
            layout={layout}
          />
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="flex h-64 items-center justify-center text-gray-500">
          Geen items gevonden
        </div>
      )}

      {/* Lightbox Viewer */}
      {viewerOpen && selectedItem && (
        <HDLightbox
          item={selectedItem}
          allItems={filteredItems}
          onClose={() => setViewerOpen(false)}
          onNext={() => {
            const idx = filteredItems.findIndex((i) => i.id === selectedItem.id);
            if (idx < filteredItems.length - 1) {
              handleSelectItem(filteredItems[idx + 1]);
            }
          }}
          onPrev={() => {
            const idx = filteredItems.findIndex((i) => i.id === selectedItem.id);
            if (idx > 0) {
              handleSelectItem(filteredItems[idx - 1]);
            }
          }}
        />
      )}
    </div>
  );
}

function GalleryItemCard({
  item,
  onClick,
  layout,
}: {
  item: GalleryItem;
  onClick: () => void;
  layout: string;
}) {
  const typeIcon = {
    image: '🖼️',
    video: '🎬',
    audio: '🎵',
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer overflow-hidden rounded-lg bg-gray-100 transition-transform hover:scale-105 ${
        layout === 'masonry' ? 'break-inside-avoid' : ''
      }`}
    >
      {item.type === 'image' && item.width && item.height ? (
        <div style={{ aspectRatio: `${item.width}/${item.height}`, position: 'relative' }}>
          <Image
            src={item.url}
            alt={item.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            quality={90}
          />
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center bg-gray-200">
          <span className="text-4xl">{typeIcon[item.type]}</span>
        </div>
      )}

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col justify-between bg-black/0 p-3 transition-all group-hover:bg-black/50">
        <div />
        <div className="translate-y-2 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
          <h3 className="text-sm font-semibold text-white line-clamp-2">{item.name}</h3>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-200">
            <span>{typeIcon[item.type]}</span>
            <span>{formatBytes(item.size)}</span>
            <span>👁 {item.viewCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HDLightbox({
  item,
  allItems,
  onClose,
  onNext,
  onPrev,
}: {
  item: GalleryItem;
  allItems: GalleryItem[];
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const currentIdx = allItems.findIndex((i) => i.id === item.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={onClose}
    >
      <div className="relative flex h-full w-full flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-2xl text-white hover:text-gray-300"
          aria-label="Sluiten"
        >
          ✕
        </button>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          {item.type === 'image' ? (
            <Image
              src={item.url}
              alt={item.name}
              width={item.width || 1920}
              height={item.height || 1080}
              className="max-h-full max-w-full object-contain"
              quality={95}
              priority
            />
          ) : item.type === 'video' ? (
            <video
              src={item.url}
              controls
              className="max-h-full max-w-full"
              style={{ maxHeight: 'calc(100vh - 200px)' }}
            />
          ) : (
            <audio src={item.url} controls className="w-full" />
          )}
        </div>

        {/* Info */}
        <div className="w-full border-t border-gray-700 bg-black/80 px-4 py-4 text-white">
          <h3 className="text-lg font-semibold">{item.name}</h3>
          {item.description && <p className="mt-1 text-sm text-gray-400">{item.description}</p>}
          {item.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <span key={tag} className="inline-block rounded-full bg-gray-700 px-2 py-1 text-xs">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        {allItems.length > 1 && (
          <div className="flex w-full justify-between bg-black px-4 py-2">
            <button
              onClick={onPrev}
              disabled={currentIdx === 0}
              className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600 disabled:opacity-50"
            >
              ← Vorig
            </button>
            <span className="flex items-center text-white">
              {currentIdx + 1} / {allItems.length}
            </span>
            <button
              onClick={onNext}
              disabled={currentIdx === allItems.length - 1}
              className="rounded bg-gray-700 px-4 py-2 text-white hover:bg-gray-600 disabled:opacity-50"
            >
              Volgende →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

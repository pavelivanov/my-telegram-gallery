import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
} from 'react';

import type { Photo } from '@/api/types';

/**
 * Fullscreen photo viewer with native-feeling horizontal swipe between
 * photos (CSS scroll snap). Telegram Mini Apps expose no API to open the
 * phone's built-in photo preview, so this is the closest equivalent.
 */
export const PhotoViewer: FC<{
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
}> = ({ photos, initialIndex, onClose }) => {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);

  // Jump to the tapped photo before first paint.
  useLayoutEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = initialIndex * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push a history entry so going back (including the Telegram back
  // button, which the Page component wires to navigate(-1)) dismisses
  // the viewer instead of leaving the album.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    window.history.pushState({ photoViewer: true }, '');
    const onPop = () => closeRef.current();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth > 0) {
      setIndex(
        Math.max(
          0,
          Math.min(photos.length - 1, Math.round(el.scrollLeft / el.clientWidth)),
        ),
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 animate-fade bg-black">
      <div
        ref={track}
        onScroll={onScroll}
        className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-contain"
      >
        {photos.map((photo, i) => (
          <div
            key={photo.id}
            className="flex h-full w-full shrink-0 snap-center items-center justify-center"
          >
            <img
              className="max-h-full max-w-full object-contain"
              src={photo.url}
              alt=""
              draggable={false}
              loading={Math.abs(i - initialIndex) <= 1 ? 'eager' : 'lazy'}
            />
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-5 pb-10 pt-4">
        <span className="text-[13px] tracking-[0.25em] text-ink/80">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          className="pointer-events-auto -m-3 p-3 text-[12px] font-medium uppercase tracking-[0.25em] text-ink/80"
          onClick={() => window.history.back()}
        >
          Close
        </button>
      </div>
    </div>
  );
};

import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
} from 'react';

import type { Photo } from '@/api/types';

// Slides mounted around the current index. Everything further away is an
// empty placeholder: mounting hundreds of decoded full-size images at once
// exhausts mobile memory and makes swiping freeze.
const RENDER_WINDOW = 2;

/** One viewer slide: tiny centered loader until the full image decodes. */
const Slide: FC<{ photo: Photo; cover: boolean }> = memo(({
  photo,
  cover,
}) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative flex h-full w-full shrink-0 snap-center items-center justify-center overflow-hidden">
      {!loaded && (
        <span
          className="absolute inline-block animate-spin font-display text-xl text-brass [animation-duration:2.5s]"
          role="status"
          aria-label="Loading photo"
        >
          ✦
        </span>
      )}
      <img
        // Cached images can be complete before React attaches onLoad.
        ref={(el) => {
          if (el?.complete && el.naturalWidth > 0) setLoaded(true);
        }}
        className={`transition-opacity duration-300 ${
          cover
            ? 'h-full w-full object-cover'
            : 'max-h-full max-w-full object-contain'
        } ${loaded ? 'opacity-100' : 'opacity-0'}`}
        src={photo.url}
        alt=""
        draggable={false}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
});
Slide.displayName = 'Slide';

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
  // "cover": photos fill the whole screen (under the nav bar), cropped.
  // "normal": photos fit between the safe areas, letterboxed.
  const [cover, setCover] = useState(true);

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
      {/* Normal mode compensates fullscreen safe areas so the centered
          photo stays clear of Telegram's nav controls; cover mode goes
          edge to edge on purpose. */}
      <div
        ref={track}
        onScroll={onScroll}
        className={`no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-contain ${
          cover
            ? ''
            : 'pt-[calc(var(--tg-viewport-safe-area-inset-top,0px)+var(--tg-viewport-content-safe-area-inset-top,0px))] pb-[var(--tg-viewport-safe-area-inset-bottom,0px)]'
        }`}
      >
        {photos.map((photo, i) =>
          Math.abs(i - index) <= RENDER_WINDOW ? (
            <Slide key={photo.id} photo={photo} cover={cover} />
          ) : (
            // Placeholder keeps the scroll width without a mounted image.
            <div key={photo.id} className="h-full w-full shrink-0 snap-center" />
          ),
        )}
      </div>

      {/* Fixed overlay ignores the body's safe-area padding — pad here too.
          Closing is handled by the native Telegram back button. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent px-7 pt-10 pb-[calc(var(--tg-viewport-safe-area-inset-bottom,0px)+16px)]">
        <span className="text-[13px] tracking-[0.25em] text-ink/80">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          className="pointer-events-auto -m-3 p-3 text-[12px] font-medium uppercase tracking-[0.25em] text-ink/80"
          onClick={() => setCover((c) => !c)}
        >
          {cover ? 'fit' : 'cover'}
        </button>
      </div>
    </div>
  );
};

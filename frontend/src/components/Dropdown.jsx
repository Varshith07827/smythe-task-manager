import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function Dropdown({ buttonClassName = 'btn btn-secondary btn-sm', buttonContent, align = 'end', disabled, children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  const panelRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target) &&
          panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = rect.bottom + 6;
    let left;

    if (align === 'end') {
      left = rect.right;
    } else if (align === 'center') {
      left = rect.left + rect.width / 2;
    } else {
      left = rect.left;
    }

    setPos({ top, left, btnWidth: rect.width, btnRight: rect.right, btnLeft: rect.left });

    // After panel renders, adjust if overflowing
    requestAnimationFrame(() => {
      if (!panelRef.current) return;
      const panel = panelRef.current;
      const pRect = panel.getBoundingClientRect();

      let adjustedLeft = left;
      let adjustedTop = top;

      // Horizontal overflow
      if (align === 'end') {
        adjustedLeft = rect.right - pRect.width;
        if (adjustedLeft < 8) adjustedLeft = 8;
      } else if (align === 'center') {
        adjustedLeft = rect.left + rect.width / 2 - pRect.width / 2;
        if (adjustedLeft < 8) adjustedLeft = 8;
        if (adjustedLeft + pRect.width > vw - 8) adjustedLeft = vw - 8 - pRect.width;
      } else {
        if (adjustedLeft + pRect.width > vw - 8) adjustedLeft = vw - 8 - pRect.width;
      }

      // Vertical overflow — flip above if not enough room below
      if (top + pRect.height > vh - 8) {
        adjustedTop = rect.top - pRect.height - 6;
        if (adjustedTop < 8) adjustedTop = 8;
      }

      setPos(prev => ({ ...prev, top: adjustedTop, left: adjustedLeft }));
    });
  }, [align]);

  useEffect(() => {
    if (open) {
      updatePosition();
      const onScroll = () => updatePosition();
      const onResize = () => updatePosition();
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onResize);
      return () => {
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onResize);
      };
    }
  }, [open, updatePosition]);

  const close = () => setOpen(false);

  return (
    <div className="dropdown-wrap" ref={ref}>
      <button
        type="button"
        className={buttonClassName}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        ref={btnRef}
      >
        {buttonContent}
      </button>
      {open && createPortal(
        <div
          className="dropdown-panel dropdown-portal"
          role="menu"
          ref={panelRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
          }}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>,
        document.body
      )}
    </div>
  );
}

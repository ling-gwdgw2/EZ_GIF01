import React, { useEffect } from 'react';
import { X, ZoomIn } from 'lucide-react';

interface LightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export const Lightbox: React.FC<LightboxProps> = ({ src, alt, onClose }) => {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    // Prevent body scroll while lightbox is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} title="ปิด (Esc)">
        <X size={28} />
      </button>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt || 'Full Preview'} className="lightbox-img" />
      </div>
    </div>
  );
};

/** A clickable thumbnail wrapper that shows ZoomIn icon on hover */
export const PreviewTrigger: React.FC<{
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick: () => void;
}> = ({ src, alt, className, style, onClick }) => (
  <div className="preview-trigger" onClick={onClick} style={{ cursor: 'pointer', position: 'relative', display: 'inline-block' }}>
    <img src={src} alt={alt || 'Preview'} className={className} style={style} />
    <div className="preview-trigger-badge">
      <ZoomIn size={16} />
      <span>ดูเต็มจอ</span>
    </div>
  </div>
);

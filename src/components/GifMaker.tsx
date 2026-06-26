import React, { useState, useRef } from 'react';
import { Upload, X, Play, Download, Image as ImageIcon, Settings, RefreshCw } from 'lucide-react';
import gifshot from 'gifshot';
import { downloadFile } from '../utils/downloadHelper';
import { Lightbox, PreviewTrigger } from './Lightbox';

interface UploadedImage {
  id: string;
  name: string;
  url: string;
  file: File;
}

export const GifMaker: React.FC = () => {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [width, setWidth] = useState<number>(500);
  const [height, setHeight] = useState<number>(500);
  const [delay, setDelay] = useState<number>(20); // In hundredths of a second (1/100s), 20 = 200ms
  const [loop, setLoop] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [resultGif, setResultGif] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFiles = (files: FileList) => {
    const validImageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    if (validImageFiles.length === 0) {
      alert('กรุณาอัปโหลดไฟล์รูปภาพที่ถูกต้อง (.png, .jpg, .jpeg, .gif, .webp)');
      return;
    }

    const newImages: UploadedImage[] = [];
    let loadedCount = 0;

    validImageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          newImages.push({
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            url: e.target.result as string,
            file: file
          });
        }
        loadedCount++;
        if (loadedCount === validImageFiles.length) {
          // Sort numerically (so frame-2.png comes before frame-10.png)
          newImages.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
          setImages(prev => [...prev, ...newImages]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const sortAllImagesByName = () => {
    setImages(prev => {
      const sorted = [...prev];
      sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      return sorted;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFiles(e.target.files);
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const updated = prev.filter(img => img.id !== id);
      // Clean up URL object if it was created
      const removed = prev.find(img => img.id === id);
      if (removed && removed.url.startsWith('blob:')) {
        URL.revokeObjectURL(removed.url);
      }
      return updated;
    });
  };


  const handleDragStartItem = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverItem = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeaveItem = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropItem = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    setImages(prev => {
      const updated = [...prev];
      const draggedItem = updated[draggedIndex];
      updated.splice(draggedIndex, 1);
      updated.splice(targetIndex, 0, draggedItem);
      return updated;
    });
    setDraggedIndex(null);
  };

  const handleDragEndItem = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const generateGif = () => {
    if (images.length < 2) {
      alert('กรุณาอัปโหลดรูปภาพอย่างน้อย 2 รูปขึ้นไปเพื่อสร้าง GIF');
      return;
    }

    setLoading(true);
    setProgress(0);
    setResultGif(null);

    const imageUrls = images.map(img => img.url);
    const frameDurationInSeconds = delay / 100; // gifshot uses seconds

    gifshot.createGIF({
      images: imageUrls,
      gifWidth: width,
      gifHeight: height,
      frameDuration: frameDurationInSeconds,
      numWorkers: 2,
      imagesToGif: true,
      progressCallback: (captureProgress: number) => {
        setProgress(Math.round(captureProgress * 100));
      }
    }, (result) => {
      setLoading(false);
      if (result.error) {
        alert('เกิดข้อผิดพลาดในการสร้าง GIF: ' + result.errorMsg);
      } else {
        setResultGif(result.image);
      }
    });
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const clearAll = () => {
    setImages([]);
    setResultGif(null);
  };

  return (
    <div className="main-content">
      <div className="glass-panel" style={{ padding: '2rem' }}>
        {/* Upload Zone */}
        {images.length === 0 ? (
          <div 
            className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileInput}
          >
            <Upload className="upload-icon" />
            <div className="upload-text">ลากและวางรูปภาพของคุณที่นี่ หรือคลิกเพื่อค้นหาไฟล์</div>
            <div className="upload-subtext">รองรับ PNG, JPG, JPEG, WebP (อย่างน้อย 2 รูปขึ้นไป)</div>
            <input 
              ref={fileInputRef}
              type="file" 
              className="file-input" 
              multiple 
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div>
            {/* Header Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <span className="brand-badge">{images.length} รูปภาพ</span>
                <button 
                  onClick={triggerFileInput} 
                  className="btn btn-secondary" 
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  เพิ่มรูปภาพ
                </button>
                <button 
                  onClick={sortAllImagesByName} 
                  className="btn btn-secondary" 
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  จัดเรียงตามชื่อไฟล์
                </button>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  className="file-input" 
                  multiple 
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </div>
              <button onClick={clearAll} className="btn btn-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                ล้างทั้งหมด
              </button>
            </div>

            {/* Grid of uploaded images */}
            <div className="image-grid">
              {images.map((img, index) => (
                <div 
                  key={img.id} 
                  className={`image-card ${draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStartItem(e, index)}
                  onDragOver={(e) => handleDragOverItem(e, index)}
                  onDragLeave={handleDragLeaveItem}
                  onDrop={(e) => handleDropItem(e, index)}
                  onDragEnd={handleDragEndItem}
                  style={{
                    cursor: draggedIndex === index ? 'grabbing' : 'grab',
                    border: dragOverIndex === index ? '3px dashed var(--secondary)' : draggedIndex === index ? '2px dotted #fff' : '2px solid white',
                    opacity: draggedIndex === index ? 0.4 : 1,
                    transform: dragOverIndex === index ? 'scale(1.03)' : 'none',
                    transition: 'border 0.15s ease, transform 0.15s ease',
                  }}
                >
                  <span className="image-index">{index + 1}</span>
                  <img src={img.url} alt={img.name} draggable={false} />
                  <div className="image-card-overlay">
                    <button 
                      onClick={() => removeImage(img.id)} 
                      className="card-remove-btn"
                      title="ลบรูปภาพ"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Settings and Actions */}
            <div className="workspace-grid" style={{ marginTop: '2.5rem' }}>
              <div className="controls-panel glass-panel" style={{ background: 'rgba(0,0,0,0.1)' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                  <Settings size={18} />
                  ตั้งค่า GIF
                </h3>
                
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">ความกว้าง (Width)</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={width} 
                      onChange={(e) => setWidth(Math.max(10, parseInt(e.target.value) || 0))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">ความสูง (Height)</label>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={height} 
                      onChange={(e) => setHeight(Math.max(10, parseInt(e.target.value) || 0))}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label">ความหน่วงต่อเฟรม (Delay)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        type="number" 
                        min="2" 
                        max="200" 
                        className="form-control" 
                        style={{ width: '70px', padding: '0.2rem 0.5rem', textAlign: 'center', fontSize: '0.85rem', background: '#000', border: '2px solid #fff', color: 'white', borderRadius: '0px' }}
                        value={delay}
                        onChange={(e) => setDelay(Math.min(200, Math.max(2, parseInt(e.target.value) || 2)))}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/100 วินาที ({delay * 10} ms)</span>
                    </div>
                  </div>
                  <div className="range-slider">
                    <input 
                      type="range" 
                      min="2" 
                      max="200" 
                      className="range-input" 
                      value={delay}
                      onChange={(e) => setDelay(parseInt(e.target.value))}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    id="loop-check" 
                    checked={loop} 
                    onChange={(e) => setLoop(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <label htmlFor="loop-check" style={{ fontSize: '0.9rem', color: 'white', cursor: 'pointer' }}>
                    เล่นวนลูปไปเรื่อย ๆ (Infinite Loop)
                  </label>
                </div>

                <button 
                  onClick={generateGif} 
                  disabled={loading || images.length < 2}
                  className="btn btn-primary"
                  style={{ marginTop: '1rem', width: '100%' }}
                >
                  {loading ? (
                    <>
                      <RefreshCw className="loading-spinner" style={{ width: '16px', height: '16px', margin: 0, animation: 'spin 1s linear infinite' }} />
                      กำลังสร้าง GIF ({progress}%)
                    </>
                  ) : (
                    <>
                      <Play size={18} />
                      สร้างภาพ GIF
                    </>
                  )}
                </button>
              </div>

              {/* Output Preview */}
              <div className="preview-container">
                {resultGif ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', width: '100%' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>ผลลัพธ์ภาพ GIF</h4>
                    <PreviewTrigger src={resultGif} alt="Generated GIF" className="gif-preview-img" onClick={() => setLightboxSrc(resultGif)} />
                    <button 
                      onClick={() => downloadFile(resultGif, `ezgif-studio-${Date.now()}.gif`, 'image/gif', 'gif')}
                      className="btn btn-primary"
                      style={{ width: '100%', background: 'var(--secondary)', color: 'black' }}
                    >
                      <Download size={18} />
                      ดาวน์โหลดไฟล์ GIF
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <ImageIcon size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                    <p style={{ fontSize: '0.9rem' }}>เมื่อสร้าง GIF เสร็จแล้ว ผลลัพธ์จะปรากฏที่นี่</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
};

import React, { useState, useRef } from 'react';
import { Download, RefreshCw, Grid } from 'lucide-react';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { downloadFile, downloadZip } from '../utils/downloadHelper';
import { Lightbox, PreviewTrigger } from './Lightbox';

interface SplitFrame {
  dataUrl: string;
  delay: number;
  width: number;
  height: number;
}

export const GifSplitter: React.FC = () => {
  const [gifSrc, setGifSrc] = useState<string | null>(null);
  const [gifFile, setGifFile] = useState<File | null>(null);
  const [frames, setFrames] = useState<SplitFrame[]>([]);
  const [isDecoding, setIsDecoding] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'image/gif') {
        processGif(file);
      } else {
        alert('กรุณาเลือกไฟล์ภาพตระกูล GIF เท่านั้น');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processGif(e.target.files[0]);
    }
  };

  const processGif = async (file: File) => {
    // Revoke previous object URL to prevent memory leak
    if (gifSrc && gifSrc.startsWith('blob:')) {
      URL.revokeObjectURL(gifSrc);
    }
    
    setGifFile(file);
    setIsDecoding(true);
    
    try {
      const dataUrl = URL.createObjectURL(file);
      setGifSrc(dataUrl);
      
      const arrayBuffer = await file.arrayBuffer();
      const gif = parseGIF(arrayBuffer);
      const decompressed = decompressFrames(gif, true);
      
      const extracted: SplitFrame[] = [];
      
      decompressed.forEach((frame) => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = frame.dims.width;
        tempCanvas.height = frame.dims.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        if (tempCtx) {
          const tempImageData = tempCtx.createImageData(frame.dims.width, frame.dims.height);
          tempImageData.data.set(frame.patch);
          tempCtx.putImageData(tempImageData, 0, 0);
          
          extracted.push({
            dataUrl: tempCanvas.toDataURL('image/png'),
            delay: frame.delay,
            width: frame.dims.width,
            height: frame.dims.height
          });
        }
      });
      
      setFrames(extracted);
    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์ GIF: ' + err.message);
    } finally {
      setIsDecoding(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const downloadAllFrames = async () => {
    if (frames.length === 0) return;
    
    setIsDecoding(true);
    try {
      const filesToZip = frames.map((frame, idx) => ({
        dataUrl: frame.dataUrl,
        filename: `frame-${idx + 1}.png`
      }));
      await downloadZip(filesToZip, `ezgif-split-frames-${Date.now()}.zip`);
    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลดรูปภาพทั้งหมด: ' + err.message);
    } finally {
      setIsDecoding(false);
    }
  };

  const clearAll = () => {
    if (gifSrc && gifSrc.startsWith('blob:')) {
      URL.revokeObjectURL(gifSrc);
    }
    setGifSrc(null);
    setGifFile(null);
    setFrames([]);
  };

  return (
    <div className="main-content">
      <div className="glass-panel" style={{ padding: '2rem' }}>
        {/* Upload Zone */}
        {!gifSrc ? (
          <div 
            className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileInput}
          >
            <Grid className="upload-icon" />
            <div className="upload-text">ลากและวางไฟล์ GIF ของคุณที่นี่ หรือคลิกเพื่อค้นหาไฟล์</div>
            <div className="upload-subtext">แยกเฟรมดึงภาพเคลื่อนไหวออกมาเป็น PNG แยกชิ้น</div>
            <input 
              ref={fileInputRef}
              type="file" 
              className="file-input" 
              accept="image/gif"
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <span className="brand-badge" style={{ textTransform: 'none' }}>
                ไฟล์: {gifFile?.name} ({frames.length} เฟรมพร้อมดาวน์โหลด)
              </span>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {frames.length > 0 && (
                  <button onClick={downloadAllFrames} className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                    ดาวน์โหลดทุกเฟรม
                  </button>
                )}
                <button onClick={clearAll} className="btn btn-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                  ล้างทั้งหมด
                </button>
              </div>
            </div>

            {isDecoding ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 0' }}>
                 <RefreshCw className="loading-spinner" style={{ animation: 'spin 1s linear infinite' }} />
                 <p style={{ color: 'var(--text-muted)' }}>กำลังแยกองค์ประกอบเฟรมทั้งหมดเป็นภาพ PNG...</p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
                  {/* Left Side: Original Preview */}
                  <div className="preview-container" style={{ flex: '1 1 300px', minHeight: 'auto', padding: '1rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>ไฟล์ต้นฉบับ (Original GIF)</h3>
                    <PreviewTrigger src={gifSrc} alt="Source GIF" className="gif-preview-img" style={{ maxHeight: '250px' }} onClick={() => setLightboxSrc(gifSrc)} />
                  </div>
                  
                  {/* Info panel */}
                  <div style={{ flex: '2 2 400px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'white', marginBottom: '0.5rem' }}>การดึงเฟรมสำเร็จ!</h3>
                     <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                       เราได้ทำการวิเคราะห์และดึงพิกเซลของทุกเฟรมในภาพเคลื่อนไหวออกมาเป็นภาพนิ่งรูปแบบความละเอียดสูง (.png) พร้อมแสดงเวลาหน่วงเฟรม (Delay) ด้านล่าง คุณสามารถเลือกบันทึกเฉพาะบางรูป หรือกดปุ่มดาวน์โหลดทั้งหมดเพื่อเซฟลงเครื่องได้
                    </p>
                  </div>
                </div>

                {/* Frames Grid */}
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>เฟรมทั้งหมด ({frames.length} เฟรม)</h3>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: '1.25rem'
                }}>
                  {frames.map((frame, idx) => (
                    <div 
                      key={idx}
                      className="glass-panel"
                      style={{
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        background: 'rgba(0,0,0,0.15)'
                      }}
                    >
                       <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                         <strong>เฟรมที่ {idx + 1}</strong>
                         <span>{frame.delay}ms</span>
                      </div>
                      
                      <div style={{
                         aspectRatio: '1.3',
                         background: 'repeating-conic-gradient(#1f2937 0% 25%, #111827 0% 50%) 50% / 10px 10px',
                         borderRadius: '0px',
                         overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <img 
                          src={frame.dataUrl} 
                          alt={`Frame ${idx + 1}`}
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'pointer' }}
                          onClick={() => setLightboxSrc(frame.dataUrl)}
                        />
                      </div>

                      <button 
                        onClick={() => downloadFile(frame.dataUrl, `frame-${idx + 1}.png`, 'image/png', 'png')}
                        className="btn btn-secondary"
                        style={{
                          padding: '0.35rem 0.5rem',
                          fontSize: '0.75rem',
                          width: '100%',
                          marginTop: '0.25rem'
                        }}
                      >
                        <Download size={12} />
                        ดาวน์โหลด PNG
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
};

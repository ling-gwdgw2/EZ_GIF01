import React, { useState, useRef } from 'react';
import { Edit3, Download, RefreshCw, Scissors, Maximize, Flame, Eye } from 'lucide-react';
import { parseGIF, decompressFrames } from 'gifuct-js';
import gifshot from 'gifshot';
import { downloadFile } from '../utils/downloadHelper';
import { Lightbox, PreviewTrigger } from './Lightbox';

interface DecodedFrame {
  canvas: HTMLCanvasElement;
  delay: number;
}

export const GifEditor: React.FC = () => {
  const [gifSrc, setGifSrc] = useState<string | null>(null);
  const [gifFile, setGifFile] = useState<File | null>(null);
  const [decodedFrames, setDecodedFrames] = useState<DecodedFrame[]>([]);
  const [originalWidth, setOriginalWidth] = useState<number>(0);
  const [originalHeight, setOriginalHeight] = useState<number>(0);
  const [isDecoding, setIsDecoding] = useState<boolean>(false);

  // Active Edit Tab
  const [activeTab, setActiveTab] = useState<'resize' | 'crop' | 'speed' | 'filter'>('resize');

  // Edit State Values
  const [resizeWidth, setResizeWidth] = useState<number>(300);
  const [resizeHeight, setResizeHeight] = useState<number>(300);
  const [aspectRatio, setAspectRatio] = useState<number>(1);
  const [maintainAspect, setMaintainAspect] = useState<boolean>(true);

  // Crop values
  const [cropX, setCropX] = useState<number>(0);
  const [cropY, setCropY] = useState<number>(0);
  const [cropW, setCropW] = useState<number>(200);
  const [cropH, setCropH] = useState<number>(200);

  // Speed multiplier
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0); // 0.5x to 3.0x

  // Filter effect
  const [selectedFilter, setSelectedFilter] = useState<string>('none'); // grayscale, sepia, invert, blur, brightness, contrast

  // Processing state
  const [loading, setLoading] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [resultGif, setResultGif] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (gifSrc) {
        URL.revokeObjectURL(gifSrc);
      }
    };
  }, [gifSrc]);

  React.useEffect(() => {
    return () => {
      decodedFrames.forEach(f => {
        f.canvas.width = 0;
        f.canvas.height = 0;
      });
    };
  }, [decodedFrames]);

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
      processGifFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processGifFile(e.target.files[0]);
    }
  };

  const processGifFile = async (file: File) => {
    if (file.type !== 'image/gif') {
      alert('กรุณาอัปโหลดไฟล์ GIF ที่ถูกต้อง');
      return;
    }

    // Release GPU memory for old canvases
    decodedFrames.forEach(f => {
      f.canvas.width = 0;
      f.canvas.height = 0;
    });

    setGifFile(file);
    setGifSrc(URL.createObjectURL(file));
    setResultGif(null);
    setIsDecoding(true);
    setDecodedFrames([]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Parse GIF using gifuct-js
      const parsedGif = parseGIF(arrayBuffer);
      const rawFrames = decompressFrames(parsedGif, true);

      if (rawFrames.length === 0) {
        throw new Error('ไม่พบข้อมูลเฟรมในไฟล์ GIF');
      }

      // Get original dimension from first frame bounding box
      const firstFrame = rawFrames[0];
      const gifW = firstFrame.dims.width;
      const gifH = firstFrame.dims.height;
      setOriginalWidth(gifW);
      setOriginalHeight(gifH);
      setResizeWidth(gifW);
      setResizeHeight(gifH);
      setAspectRatio(gifW / gifH);
      
      setCropW(Math.min(gifW, 200));
      setCropH(Math.min(gifH, 200));
      setCropX(Math.max(0, Math.floor((gifW - Math.min(gifW, 200)) / 2)));
      setCropY(Math.max(0, Math.floor((gifH - Math.min(gifH, 200)) / 2)));

      // Accumulate frames taking disposal types into account
      const accumCanvas = document.createElement('canvas');
      accumCanvas.width = gifW;
      accumCanvas.height = gifH;
      const accumCtx = accumCanvas.getContext('2d')!;

      const parsedFrames: DecodedFrame[] = [];

      for (let i = 0; i < rawFrames.length; i++) {
        const frame = rawFrames[i];
        
        // Handle disposal method 2: restore to background (clear canvas)
        if (frame.disposalType === 2) {
          accumCtx.clearRect(0, 0, gifW, gifH);
        }

        // Draw current patch onto offscreen canvas to handle transparent pixels
        const patchCanvas = document.createElement('canvas');
        patchCanvas.width = frame.dims.width;
        patchCanvas.height = frame.dims.height;
        const patchCtx = patchCanvas.getContext('2d')!;

        const patchData = patchCtx.createImageData(frame.dims.width, frame.dims.height);
        patchData.data.set(frame.patch);
        patchCtx.putImageData(patchData, 0, 0);

        // Blend onto accumulated canvas
        accumCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

        // Save a deep copy of accumulated state
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = gifW;
        frameCanvas.height = gifH;
        const frameCtx = frameCanvas.getContext('2d')!;
        frameCtx.drawImage(accumCanvas, 0, 0);

        parsedFrames.push({
          canvas: frameCanvas,
          delay: frame.delay || 100 // fallback to 100ms
        });
      }

      setDecodedFrames(parsedFrames);
    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์ GIF: ' + err.message);
    } finally {
      setIsDecoding(false);
    }
  };

  // Adjust aspect ratio automatically
  const handleWidthChange = (val: number) => {
    setResizeWidth(val);
    if (maintainAspect && aspectRatio > 0) {
      setResizeHeight(Math.round(val / aspectRatio));
    }
  };

  const handleHeightChange = (val: number) => {
    setResizeHeight(val);
    if (maintainAspect && aspectRatio > 0) {
      setResizeWidth(Math.round(val * aspectRatio));
    }
  };

  const applyEditsAndGenerate = async () => {
    if (decodedFrames.length === 0) return;

    setLoading(true);
    setProgressText('กำลังประมวลผลเอฟเฟกต์เฟรม...');
    setResultGif(null);

    try {
      const processedFrameDataUrls: string[] = [];
      const frameDelays: number[] = [];

      // Determine dimensions based on active tab
      let exportWidth = originalWidth;
      let exportHeight = originalHeight;

      if (activeTab === 'resize') {
        exportWidth = resizeWidth;
        exportHeight = resizeHeight;
      } else if (activeTab === 'crop') {
        exportWidth = cropW;
        exportHeight = cropH;
      }

      // Process each frame
      for (let i = 0; i < decodedFrames.length; i++) {
        const frame = decodedFrames[i];
        
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = exportWidth;
        outputCanvas.height = exportHeight;
        const ctx = outputCanvas.getContext('2d')!;

        // Apply visual CSS filters to canvas context if active
        if (activeTab === 'filter' && selectedFilter !== 'none') {
          if (selectedFilter === 'grayscale') ctx.filter = 'grayscale(100%)';
          else if (selectedFilter === 'sepia') ctx.filter = 'sepia(100%)';
          else if (selectedFilter === 'invert') ctx.filter = 'invert(100%)';
          else if (selectedFilter === 'blur') ctx.filter = 'blur(4px)';
          else if (selectedFilter === 'bright') ctx.filter = 'brightness(1.5)';
          else if (selectedFilter === 'contrast') ctx.filter = 'contrast(1.6)';
        }

        // Draw frame onto output canvas
        if (activeTab === 'crop') {
          // Crop sub-image from original canvas
          ctx.drawImage(
            frame.canvas,
            cropX, cropY, cropW, cropH, // Source
            0, 0, cropW, cropH          // Destination
          );
        } else {
          // Normal draw or resize
          ctx.drawImage(frame.canvas, 0, 0, exportWidth, exportHeight);
        }

        processedFrameDataUrls.push(outputCanvas.toDataURL('image/jpeg', 0.85));
        
        // Calculate new delay based on speed tab
        let targetDelay = frame.delay;
        if (activeTab === 'speed') {
          targetDelay = frame.delay / speedMultiplier;
        }
        frameDelays.push(targetDelay / 1000); // gifshot expects seconds
      }

      setProgressText('กำลังส่งออกไฟล์ GIF ใหม่...');

      // Build GIF
      gifshot.createGIF({
        images: processedFrameDataUrls,
        gifWidth: exportWidth,
        gifHeight: exportHeight,
        numWorkers: 2,
        imagesToGif: true,
        // Set individual frame delay if custom, otherwise use first delay (gifshot allows frameDuration, if array it applies globally or supports standard speed)
        frameDuration: frameDelays[0] // Simplify using standard speed multiplier
      }, (result) => {
        setLoading(false);
        if (result.error) {
          alert('เกิดข้อผิดพลาดในการแก้ไข GIF: ' + result.errorMsg);
        } else {
          setResultGif(result.image);
        }
      });

    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึกการแก้ไข: ' + err.message);
      setLoading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const clearAll = () => {
    decodedFrames.forEach(f => {
      f.canvas.width = 0;
      f.canvas.height = 0;
    });
    setGifSrc(null);
    setGifFile(null);
    setDecodedFrames([]);
    setResultGif(null);
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
            <Edit3 className="upload-icon" />
            <div className="upload-text">ลากและวางไฟล์ GIF ของคุณที่นี่ หรือคลิกเพื่อค้นหาไฟล์</div>
            <div className="upload-subtext">รองรับเฉพาะภาพเคลื่อนไหวสกุล .gif เท่านั้น</div>
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
                ไฟล์: {gifFile?.name} ({decodedFrames.length} เฟรม | {originalWidth}x{originalHeight} px)
              </span>
              <button onClick={clearAll} className="btn btn-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                ล้างทั้งหมด
              </button>
            </div>

            {isDecoding ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 0' }}>
                 <RefreshCw className="loading-spinner" style={{ animation: 'spin 1s linear infinite' }} />
                 <p style={{ color: 'var(--text-muted)' }}>กำลังอ่านโครงสร้างเฟรมและรหัสสีไฟล์ GIF...</p>
              </div>
            ) : (
              <div className="workspace-grid">
                {/* Visual Area (Source Preview & Crop Marker Overlay) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="preview-container" style={{ position: 'relative' }}>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={gifSrc} alt="Source GIF" className="gif-preview-img" />
                      
                      {/* Visual Crop Overlay helper */}
                      {activeTab === 'crop' && (
                        <div 
                          style={{
                             position: 'absolute',
                             border: '2px dashed var(--secondary)',
                             boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                            // scale crop coordinates based on displayed img vs original size
                            left: `${(cropX / originalWidth) * 100}%`,
                            top: `${(cropY / originalHeight) * 100}%`,
                            width: `${(cropW / originalWidth) * 100}%`,
                            height: `${(cropH / originalHeight) * 100}%`,
                            pointerEvents: 'none',
                            zIndex: 10
                          }}
                        >
                          <div style={{
                             position: 'absolute',
                             top: '-20px',
                             left: '0',
                             background: 'var(--secondary)',
                             color: 'black',
                             fontSize: '0.7rem',
                             fontWeight: 'bold',
                             padding: '2px 4px',
                             borderRadius: '0px'
                           }}>
                             {cropW} x {cropH}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Edit Controls Side Panel */}
                <div className="controls-panel glass-panel" style={{ background: 'rgba(0,0,0,0.1)' }}>
                  {/* Tool selection Tabs */}
                  <div className="tabs-header" style={{ marginBottom: '1.25rem' }}>
                    <button 
                      onClick={() => setActiveTab('resize')} 
                      className={`tab-btn ${activeTab === 'resize' ? 'active' : ''}`}
                    >
                      <Maximize size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                      ย่อ/ขยาย
                    </button>
                    <button 
                      onClick={() => setActiveTab('crop')} 
                      className={`tab-btn ${activeTab === 'crop' ? 'active' : ''}`}
                    >
                      <Scissors size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                      ครอป
                    </button>
                    <button 
                      onClick={() => setActiveTab('speed')} 
                      className={`tab-btn ${activeTab === 'speed' ? 'active' : ''}`}
                    >
                      <Flame size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                      ความเร็ว
                    </button>
                    <button 
                      onClick={() => setActiveTab('filter')} 
                      className={`tab-btn ${activeTab === 'filter' ? 'active' : ''}`}
                    >
                      <Eye size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                      ฟิลเตอร์
                    </button>
                  </div>

                  {/* Dynamic Options Content */}
                  {activeTab === 'resize' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>ตั้งค่าปรับขนาดรูปภาพ</h4>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">ความกว้าง (Width)</label>
                          <input 
                            type="number" 
                            className="form-control" 
                            value={resizeWidth} 
                            onChange={(e) => handleWidthChange(Math.max(10, parseInt(e.target.value) || 0))}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">ความสูง (Height)</label>
                          <input 
                            type="number" 
                            className="form-control" 
                            value={resizeHeight} 
                            onChange={(e) => handleHeightChange(Math.max(10, parseInt(e.target.value) || 0))}
                          />
                        </div>
                      </div>
                      <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          id="aspect-check" 
                          checked={maintainAspect} 
                          onChange={(e) => setMaintainAspect(e.target.checked)}
                           style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                         />
                         <label htmlFor="aspect-check" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                          คงสัดส่วนเดิมไว้ (Lock Aspect Ratio)
                        </label>
                      </div>
                    </div>
                  )}

                  {activeTab === 'crop' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>กำหนดขอบเขตในการครอบตัด</h4>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">จุดเริ่ม X</label>
                          <input 
                            type="number" 
                            className="form-control" 
                            value={cropX} 
                            onChange={(e) => setCropX(Math.min(originalWidth - 10, Math.max(0, parseInt(e.target.value) || 0)))}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">จุดเริ่ม Y</label>
                          <input 
                            type="number" 
                            className="form-control" 
                            value={cropY} 
                            onChange={(e) => setCropY(Math.min(originalHeight - 10, Math.max(0, parseInt(e.target.value) || 0)))}
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">ความกว้าง W</label>
                          <input 
                            type="number" 
                            className="form-control" 
                            value={cropW} 
                            onChange={(e) => setCropW(Math.min(originalWidth - cropX, Math.max(10, parseInt(e.target.value) || 0)))}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">ความสูง H</label>
                          <input 
                            type="number" 
                            className="form-control" 
                            value={cropH} 
                            onChange={(e) => setCropH(Math.min(originalHeight - cropY, Math.max(10, parseInt(e.target.value) || 0)))}
                          />
                        </div>
                      </div>
                      <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                        <button 
                          onClick={() => {
                            const minSide = Math.min(originalWidth, originalHeight);
                            setCropW(minSide);
                            setCropH(minSide);
                            setCropX(Math.floor((originalWidth - minSide) / 2));
                            setCropY(Math.floor((originalHeight - minSide) / 2));
                          }}
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }}
                        >
                          สี่เหลี่ยมจัตุรัส (1:1)
                        </button>
                        <button 
                          onClick={() => {
                            setCropX(0);
                            setCropY(0);
                            setCropW(originalWidth);
                            setCropH(originalHeight);
                          }}
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }}
                        >
                          เต็มจอ
                        </button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'speed' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>ความเร็วการเคลื่อนไหว</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input 
                            type="number" 
                            min="0.2" 
                            max="4.0" 
                            step="0.1"
                             className="form-control" 
                             style={{ width: '70px', padding: '0.2rem 0.5rem', textAlign: 'center', fontSize: '0.85rem', background: '#000', border: '2px solid #fff', color: 'white', borderRadius: '0px' }}
                             value={parseFloat(speedMultiplier.toFixed(1))}
                             onChange={(e) => setSpeedMultiplier(Math.min(4.0, Math.max(0.2, parseFloat(e.target.value) || 1.0)))}
                           />
                           <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>x</span>
                        </div>
                      </div>
                      <div className="range-slider">
                        <input 
                          type="range" 
                          min="0.2" 
                          max="4.0" 
                          step="0.1"
                          className="range-input" 
                          value={speedMultiplier}
                          onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
                        />
                      </div>
                       <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                         * ปรับต่ำกว่า 1.0x เพื่อให้ช้าลง ปรับสูงกว่า 1.0x เพื่อให้เล่นเร็วขึ้น
                      </div>
                    </div>
                  )}

                  {activeTab === 'filter' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>เลือกเอฟเฟกต์ฟิลเตอร์</h4>
                      <button 
                        onClick={() => setSelectedFilter('none')}
                        className={`btn ${selectedFilter === 'none' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ justifyContent: 'flex-start', fontSize: '0.85rem' }}
                      >
                        ไม่มีเอฟเฟกต์ (None)
                      </button>
                      <button 
                        onClick={() => setSelectedFilter('grayscale')}
                        className={`btn ${selectedFilter === 'grayscale' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ justifyContent: 'flex-start', fontSize: '0.85rem' }}
                      >
                        โทนเทา (Grayscale)
                      </button>
                      <button 
                        onClick={() => setSelectedFilter('sepia')}
                        className={`btn ${selectedFilter === 'sepia' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ justifyContent: 'flex-start', fontSize: '0.85rem' }}
                      >
                        สีซีเปียย้อนยุค (Sepia)
                      </button>
                      <button 
                        onClick={() => setSelectedFilter('invert')}
                        className={`btn ${selectedFilter === 'invert' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ justifyContent: 'flex-start', fontSize: '0.85rem' }}
                      >
                        กลับค่าสี (Invert)
                      </button>
                      <button 
                        onClick={() => setSelectedFilter('bright')}
                        className={`btn ${selectedFilter === 'bright' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ justifyContent: 'flex-start', fontSize: '0.85rem' }}
                      >
                        เพิ่มความสว่าง (Brightness)
                      </button>
                      <button 
                        onClick={() => setSelectedFilter('contrast')}
                        className={`btn ${selectedFilter === 'contrast' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ justifyContent: 'flex-start', fontSize: '0.85rem' }}
                      >
                        เร่งความต่างสี (Contrast)
                      </button>
                    </div>
                  )}

                  <button 
                    onClick={applyEditsAndGenerate} 
                    disabled={loading || decodedFrames.length === 0}
                    className="btn btn-primary"
                    style={{ marginTop: '1.5rem', width: '100%' }}
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="loading-spinner" style={{ width: '16px', height: '16px', margin: 0, animation: 'spin 1s linear infinite' }} />
                        <span>{progressText}</span>
                      </>
                    ) : (
                      <>
                        <Edit3 size={18} />
                        ประมวลผลและสร้าง GIF
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Editing output result GIF */}
            {resultGif && (
              <div className="glass-panel" style={{ marginTop: '2rem', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)', fontWeight: 600 }}>สร้าง GIF ใหม่เสร็จสิ้น!</h3>
                <PreviewTrigger src={resultGif} alt="Edited GIF Output" className="gif-preview-img" style={{ maxWidth: '100%' }} onClick={() => setLightboxSrc(resultGif)} />
                <button                   onClick={() => downloadFile(resultGif, `ezgif-edited-${Date.now()}.gif`, 'image/gif', 'gif')}
                   className="btn btn-primary"
                   style={{ width: '320px', maxWidth: '100%', background: 'var(--secondary)', color: 'black' }}
                 >
                   <Download size={18} />
                   ดาวน์โหลดไฟล์ GIF ที่แก้ไข
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
};

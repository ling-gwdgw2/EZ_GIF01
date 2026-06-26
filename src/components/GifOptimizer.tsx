import React, { useState, useRef } from 'react';
import { Zap, Download, RefreshCw, Layers } from 'lucide-react';
import { parseGIF, decompressFrames } from 'gifuct-js';
import gifshot from 'gifshot';
import { downloadFile } from '../utils/downloadHelper';
import { Lightbox, PreviewTrigger } from './Lightbox';

interface DecodedFrame {
  canvas: HTMLCanvasElement;
  delay: number;
}

type OptimizeMethod = 
  | 'lossy'
  | 'transparency'
  | 'color128'
  | 'color64'
  | 'removeDuplicates'
  | 'every2nd'
  | 'every3rd'
  | 'every4th'
  | 'combined';

export const GifOptimizer: React.FC = () => {
  const [gifSrc, setGifSrc] = useState<string | null>(null);
  const [gifFile, setGifFile] = useState<File | null>(null);
  const [decodedFrames, setDecodedFrames] = useState<DecodedFrame[]>([]);
  const [isDecoding, setIsDecoding] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Settings
  const [optimizeMethod, setOptimizeMethod] = useState<OptimizeMethod>('lossy');
  const [scaleFactor, setScaleFactor] = useState<number>(1.0); // 0.3 to 1.0

  // Output
  const [loading, setLoading] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [resultGif, setResultGif] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (gifSrc) {
        URL.revokeObjectURL(gifSrc);
      }
    };
  }, [gifSrc]);

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

    setGifFile(file);
    setGifSrc(URL.createObjectURL(file));
    setResultGif(null);
    setDecodedFrames([]);
    setIsDecoding(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsedGif = parseGIF(arrayBuffer);
      const rawFrames = decompressFrames(parsedGif, true);

      if (rawFrames.length === 0) {
        throw new Error('ไม่พบข้อมูลเฟรมในไฟล์ GIF');
      }

      const firstFrame = rawFrames[0];
      const gifW = firstFrame.dims.width;
      const gifH = firstFrame.dims.height;

      const accumCanvas = document.createElement('canvas');
      accumCanvas.width = gifW;
      accumCanvas.height = gifH;
      const accumCtx = accumCanvas.getContext('2d')!;

      const parsed: DecodedFrame[] = [];

      for (let i = 0; i < rawFrames.length; i++) {
        const frame = rawFrames[i];

        if (frame.disposalType === 2) {
          accumCtx.clearRect(0, 0, gifW, gifH);
        }

        const patchCanvas = document.createElement('canvas');
        patchCanvas.width = frame.dims.width;
        patchCanvas.height = frame.dims.height;
        const patchCtx = patchCanvas.getContext('2d')!;

        const patchData = patchCtx.createImageData(frame.dims.width, frame.dims.height);
        patchData.data.set(frame.patch);
        patchCtx.putImageData(patchData, 0, 0);

        accumCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = gifW;
        frameCanvas.height = gifH;
        const frameCtx = frameCanvas.getContext('2d')!;
        frameCtx.drawImage(accumCanvas, 0, 0);

        parsed.push({
          canvas: frameCanvas,
          delay: frame.delay || 100
        });
      }

      setDecodedFrames(parsed);
    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการเปิดไฟล์ GIF: ' + err.message);
    } finally {
      setIsDecoding(false);
    }
  };

  const optimizeGif = async () => {
    if (decodedFrames.length === 0) return;

    setLoading(true);
    setProgressText('กำลังวิเคราะห์และเตรียมประมวลผลเฟรม...');
    setResultGif(null);

    const firstFrame = decodedFrames[0];
    const originalWidth = firstFrame.canvas.width;
    const originalHeight = firstFrame.canvas.height;

    // Apply scale factor
    const newWidth = Math.round(originalWidth * scaleFactor);
    const newHeight = Math.round(originalHeight * scaleFactor);

    // Default parameters for gifshot
    let sampleInt = 10; // color sampling rate (lower is higher quality, e.g. 10; higher is smaller size)
    let finalFrames: DecodedFrame[] = [];

    // Helper functions for pixel comparisons
    const isSimilarFrame = (canvasA: HTMLCanvasElement, canvasB: HTMLCanvasElement): boolean => {
      const ctxA = canvasA.getContext('2d')!;
      const ctxB = canvasB.getContext('2d')!;
      const dataA = ctxA.getImageData(0, 0, originalWidth, originalHeight).data;
      const dataB = ctxB.getImageData(0, 0, originalWidth, originalHeight).data;
      
      let diffCount = 0;
      const len = dataA.length;
      
      // Sample every 16th pixel for performance
      for (let j = 0; j < len; j += 64) {
        const rDiff = Math.abs(dataA[j] - dataB[j]);
        const gDiff = Math.abs(dataA[j+1] - dataB[j+1]);
        const bDiff = Math.abs(dataA[j+2] - dataB[j+2]);
        if (rDiff > 15 || gDiff > 15 || bDiff > 15) {
          diffCount++;
        }
      }
      
      const totalSampled = len / 64;
      const differenceRatio = diffCount / totalSampled;
      
      return differenceRatio < 0.03; // less than 3% difference is considered duplicate
    };

    const makeTransparentSimilarPixels = (canvasCurrent: HTMLCanvasElement, canvasPrev: HTMLCanvasElement): HTMLCanvasElement => {
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = originalWidth;
      outputCanvas.height = originalHeight;
      const ctx = outputCanvas.getContext('2d')!;
      ctx.drawImage(canvasCurrent, 0, 0);
      
      const prevCtx = canvasPrev.getContext('2d')!;
      const imgData = ctx.getImageData(0, 0, originalWidth, originalHeight);
      const data = imgData.data;
      const prevData = prevCtx.getImageData(0, 0, originalWidth, originalHeight).data;
      
      const len = data.length;
      for (let j = 0; j < len; j += 4) {
        // Compare color values
        const rMatch = Math.abs(data[j] - prevData[j]) < 5;
        const gMatch = Math.abs(data[j+1] - prevData[j+1]) < 5;
        const bMatch = Math.abs(data[j+2] - prevData[j+2]) < 5;
        
        if (rMatch && gMatch && bMatch) {
          data[j+3] = 0; // Turn alpha to 0 (make transparent)
        }
      }
      
      ctx.putImageData(imgData, 0, 0);
      return outputCanvas;
    };

    const applyColorReduction = (canvas: HTMLCanvasElement, levels: number): HTMLCanvasElement => {
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = originalWidth;
      outputCanvas.height = originalHeight;
      const ctx = outputCanvas.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      
      const imgData = ctx.getImageData(0, 0, originalWidth, originalHeight);
      const data = imgData.data;
      
      // Determine bit mask based on level
      const mask = levels === 128 ? 0xE0 : 0xC0; // 0xE0 keeps top 3 bits, 0xC0 keeps top 2 bits
      
      const len = data.length;
      for (let j = 0; j < len; j += 4) {
        data[j] = data[j] & mask;
        data[j+1] = data[j+1] & mask;
        data[j+2] = data[j+2] & mask;
      }
      
      ctx.putImageData(imgData, 0, 0);
      return outputCanvas;
    };

    try {
      // 1. PROCESS TECHNIQUES
      if (optimizeMethod === 'lossy') {
        sampleInt = 25; // higher sampleInterval = lower color table fidelity / smaller size
        finalFrames = [...decodedFrames];
      }
      
      else if (optimizeMethod === 'transparency') {
        setProgressText('กำลังคำนวณเปรียบเทียบพิกเซลซ้ำเพื่อทำโปร่งใส...');
        finalFrames.push(decodedFrames[0]);
        for (let i = 1; i < decodedFrames.length; i++) {
          const optCanvas = makeTransparentSimilarPixels(decodedFrames[i].canvas, decodedFrames[i-1].canvas);
          finalFrames.push({
            canvas: optCanvas,
            delay: decodedFrames[i].delay
          });
        }
      }
      
      else if (optimizeMethod === 'color128') {
        setProgressText('กำลังบีบอัดบิตสี (128 Colors)...');
        for (let i = 0; i < decodedFrames.length; i++) {
          const optCanvas = applyColorReduction(decodedFrames[i].canvas, 128);
          finalFrames.push({
            canvas: optCanvas,
            delay: decodedFrames[i].delay
          });
        }
      }
      
      else if (optimizeMethod === 'color64') {
        setProgressText('กำลังบีบอัดบิตสี (64 Colors)...');
        for (let i = 0; i < decodedFrames.length; i++) {
          const optCanvas = applyColorReduction(decodedFrames[i].canvas, 64);
          finalFrames.push({
            canvas: optCanvas,
            delay: decodedFrames[i].delay
          });
        }
      }
      
      else if (optimizeMethod === 'removeDuplicates') {
        setProgressText('กำลังสแกนหาเฟรมภาพเคลื่อนไหวซ้ำ...');
        finalFrames.push(decodedFrames[0]);
        for (let i = 1; i < decodedFrames.length; i++) {
          const current = decodedFrames[i];
          const previousKept = finalFrames[finalFrames.length - 1];
          
          if (isSimilarFrame(current.canvas, previousKept.canvas)) {
            // It's duplicate! Skip drawing this, add its delay to the previous frame
            previousKept.delay += current.delay;
          } else {
            finalFrames.push(current);
          }
        }
      }
      
      else if (optimizeMethod === 'every2nd') {
        // Keep 0, 2, 4, 6... and double their delays
        for (let i = 0; i < decodedFrames.length; i += 2) {
          finalFrames.push({
            canvas: decodedFrames[i].canvas,
            delay: decodedFrames[i].delay * 2
          });
        }
      }
      
      else if (optimizeMethod === 'every3rd') {
        // Drop index: 2, 5, 8...
        for (let i = 0; i < decodedFrames.length; i++) {
          if ((i + 1) % 3 === 0) {
            // Add its delay to previous kept frame
            if (finalFrames.length > 0) {
              finalFrames[finalFrames.length - 1].delay += decodedFrames[i].delay;
            }
          } else {
            finalFrames.push({ ...decodedFrames[i] });
          }
        }
      }
      
      else if (optimizeMethod === 'every4th') {
        // Drop index: 3, 7, 11...
        for (let i = 0; i < decodedFrames.length; i++) {
          if ((i + 1) % 4 === 0) {
            if (finalFrames.length > 0) {
              finalFrames[finalFrames.length - 1].delay += decodedFrames[i].delay;
            }
          } else {
            finalFrames.push({ ...decodedFrames[i] });
          }
        }
      }
      
      else if (optimizeMethod === 'combined') {
        setProgressText('กำลังคำนวณขั้นสูง: ลบเฟรมซ้ำ + ความโปร่งใส + ลดทอนสี...');
        // 1. Remove duplicates first
        const step1: DecodedFrame[] = [decodedFrames[0]];
        for (let i = 1; i < decodedFrames.length; i++) {
          const current = decodedFrames[i];
          const previous = step1[step1.length - 1];
          if (isSimilarFrame(current.canvas, previous.canvas)) {
            previous.delay += current.delay;
          } else {
            step1.push(current);
          }
        }
        
        // 2. Optimize transparency and reduce color bits
        sampleInt = 18; // slight lossy LZW
        finalFrames.push({
          canvas: applyColorReduction(step1[0].canvas, 128),
          delay: step1[0].delay
        });
        
        for (let i = 1; i < step1.length; i++) {
          const colRedCanvas = applyColorReduction(step1[i].canvas, 128);
          const transCanvas = makeTransparentSimilarPixels(colRedCanvas, step1[i-1].canvas);
          finalFrames.push({
            canvas: transCanvas,
            delay: step1[i].delay
          });
        }
      }

      // Convert final frames to canvas data URLs at export resolution
      setProgressText('กำลังย่ออัตราขนาดเฟรม...');
      const processedFrameUrls: string[] = [];
      for (let i = 0; i < finalFrames.length; i++) {
        const frame = finalFrames[i];
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = newWidth;
        outputCanvas.height = newHeight;
        const ctx = outputCanvas.getContext('2d')!;
        ctx.drawImage(frame.canvas, 0, 0, newWidth, newHeight);
        processedFrameUrls.push(outputCanvas.toDataURL('image/jpeg', 0.82)); // minor jpeg encoding compression
      }

      setProgressText('กำลังประกอบสร้างเป็นไฟล์ GIF ใหม่...');

      gifshot.createGIF({
        images: processedFrameUrls,
        gifWidth: newWidth,
        gifHeight: newHeight,
        numWorkers: 2,
        imagesToGif: true,
        frameDuration: finalFrames[0].delay / 1000,
        sampleInterval: sampleInt
      }, (result) => {
        setLoading(false);
        if (result.error) {
          alert('เกิดข้อผิดพลาดในการบีบอัด GIF: ' + result.errorMsg);
        } else {
          setResultGif(result.image);
        }
      });

    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาดระหว่างบีบอัดไฟล์: ' + err.message);
      setLoading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const clearAll = () => {
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
            <Zap className="upload-icon" />
            <div className="upload-text">ลากและวางไฟล์ GIF ของคุณที่นี่ หรือคลิกเพื่อค้นหาไฟล์</div>
            <div className="upload-subtext">ลดขนาดไฟล์ประหยัดเนื้อที่ด้วยเทคโนโลยีเดียวกันกับ ezgif.com</div>
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
                ไฟล์: {gifFile?.name} ({((gifFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB | {decodedFrames.length} เฟรม)
              </span>
              <button onClick={clearAll} className="btn btn-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                ล้างทั้งหมด
              </button>
            </div>

            {isDecoding ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 0' }}>
                <RefreshCw className="loading-spinner" style={{ animation: 'spin 1s linear infinite' }} />
                <p style={{ color: 'var(--text-muted)' }}>กำลังอ่านโครงสร้างสีและเฟรมไฟล์ GIF...</p>
              </div>
            ) : (
              <div className="workspace-grid">
                {/* Visual Area (Source Preview) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="preview-container">
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', alignSelf: 'flex-start' }}>ภาพก่อนบีบอัด (Original)</h3>
                    <PreviewTrigger src={gifSrc} alt="Original Preview" className="gif-preview-img" style={{ maxHeight: '350px' }} onClick={() => setLightboxSrc(gifSrc)} />
                  </div>
                </div>

                {/* Optimization Options Panel */}
                <div className="controls-panel glass-panel" style={{ background: 'rgba(0,0,0,0.1)', height: 'fit-content' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                    <Layers size={18} />
                    เครื่องมือบีบอัด
                  </h3>

                  {/* Optimization Selection matching ezgif style */}
                  <div className="form-group">
                    <label className="form-label">เทคโนโลยีบีบอัด (Compression Method)</label>
                    <select 
                      className="form-control" 
                      value={optimizeMethod} 
                      onChange={(e) => setOptimizeMethod(e.target.value as OptimizeMethod)}
                      style={{ fontSize: '0.85rem' }}
                    >
                      <optgroup label="Lossy GIF compression">
                        <option value="lossy">Lossy GIF (ลดทอนสี LZW)</option>
                      </optgroup>
                      <optgroup label="Combined">
                        <option value="combined">Combined (ลบเฟรมซ้ำ + ความโปร่งใส + ลดสี)</option>
                      </optgroup>
                      <optgroup label="Color Reduction">
                        <option value="color128">Color Reduction (128 สี)</option>
                        <option value="color64">Color Reduction (64 สี)</option>
                      </optgroup>
                      <optgroup label="Drop frames">
                        <option value="removeDuplicates">Remove duplicate frames (ลบเฟรมซ้ำ)</option>
                        <option value="every2nd">Remove every 2nd frame (ลบเฟรมเว้นเฟรม)</option>
                        <option value="every3rd">Remove every 3rd frame (ลบทุกเฟรมที่ 3)</option>
                        <option value="every4th">Remove every 4th frame (ลบทุกเฟรมที่ 4)</option>
                      </optgroup>
                      <optgroup label="Transparency">
                        <option value="transparency">Optimize Transparency (พิกเซลซ้ำโปร่งใส)</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Resize Factor Slider */}
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label">ปรับย่อขนาดรูปภาพ (Resize)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input 
                          type="number" 
                          min="30" 
                          max="100" 
                          className="form-control" 
                          style={{ width: '70px', padding: '0.2rem 0.5rem', textAlign: 'center', fontSize: '0.85rem', background: '#000', border: '2px solid #fff', color: 'white', borderRadius: '0px' }}
                          value={Math.round(scaleFactor * 100)}
                          onChange={(e) => setScaleFactor(Math.min(100, Math.max(30, parseInt(e.target.value) || 30)) / 100)}
                        />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>%</span>
                      </div>
                    </div>
                    <div className="range-slider">
                      <input 
                        type="range" 
                        min="0.3" 
                        max="1.0" 
                        step="0.05"
                        className="range-input" 
                        value={scaleFactor}
                        onChange={(e) => setScaleFactor(parseFloat(e.target.value))}
                      />
                    </div>
                  </div>

                  <button 
                    onClick={optimizeGif} 
                    disabled={loading || decodedFrames.length === 0}
                    className="btn btn-primary"
                    style={{ marginTop: '1rem', width: '100%' }}
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="loading-spinner" style={{ width: '16px', height: '16px', margin: 0, animation: 'spin 1s linear infinite' }} />
                        <span>{progressText}</span>
                      </>
                    ) : (
                      <>
                        <Zap size={18} />
                        บีบอัดภาพ GIF
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Optimized Result Display */}
            {resultGif && (
              <div className="glass-panel" style={{ marginTop: '2rem', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
                <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)', fontWeight: 600 }}>บีบอัดไฟล์ GIF สำเร็จ!</h3>
                <PreviewTrigger src={resultGif} alt="Optimized Result" className="gif-preview-img" style={{ maxWidth: '100%' }} onClick={() => setLightboxSrc(resultGif)} />
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span>มิติภาพ: {Math.round(decodedFrames[0]?.canvas.width * scaleFactor)}x{Math.round(decodedFrames[0]?.canvas.height * scaleFactor)} px</span>
                  <span>เทคโนโลยีที่ใช้งาน: 
                    {optimizeMethod === 'lossy' && ' Lossy GIF (ลดทอนสี LZW)'}
                    {optimizeMethod === 'transparency' && ' Optimize Transparency (พิกเซลซ้ำโปร่งใส)'}
                    {optimizeMethod === 'color128' && ' Color Reduction (128 สี)'}
                    {optimizeMethod === 'color64' && ' Color Reduction (64 สี)'}
                    {optimizeMethod === 'removeDuplicates' && ' Remove duplicate frames (ลบเฟรมซ้ำ)'}
                    {optimizeMethod === 'every2nd' && ' Remove every 2nd frame (ลบเฟรมเว้นเฟรม)'}
                    {optimizeMethod === 'every3rd' && ' Remove every 3rd frame (ลบทุกเฟรมที่ 3)'}
                    {optimizeMethod === 'every4th' && ' Remove every 4th frame (ลบทุกเฟรมที่ 4)'}
                    {optimizeMethod === 'combined' && ' Combined (ลบเฟรมซ้ำ + ความโปร่งใส + ลดสี)'}
                  </span>
                </div>

                <button 
                  onClick={() => downloadFile(resultGif, `ezgif-optimized-${Date.now()}.gif`, 'image/gif', 'gif')}
                  className="btn btn-primary"
                  style={{ width: '320px', maxWidth: '100%', background: 'var(--secondary)', color: 'black' }}
                >
                  <Download size={18} />
                  ดาวน์โหลดไฟล์ GIF ที่บีบอัด
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

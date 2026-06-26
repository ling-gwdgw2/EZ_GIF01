import React, { useState, useRef } from 'react';
import { Film, Download, RefreshCw, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { downloadFile, downloadZip } from '../utils/downloadHelper';
import { Lightbox } from './Lightbox';

interface ExtractedFrame {
  dataUrl: string;
  time: number;
}

export const VideoSplitter: React.FC = () => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  
  // Settings
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(5);
  const [fps, setFps] = useState<number>(2); // Default 2 frames per second
  
  // State
  const [loading, setLoading] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    return () => {
      if (videoSrc) {
        URL.revokeObjectURL(videoSrc);
      }
    };
  }, [videoSrc]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processVideoFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      alert('กรุณาอัปโหลดไฟล์วิดีโอที่ถูกต้อง (.mp4, .webm, .ogg)');
      return;
    }
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setFrames([]);
    setStartTime(0);
    setEndTime(5); // Default to 5 seconds
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processVideoFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processVideoFile(e.target.files[0]);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);
      setEndTime(Math.min(videoDuration, 5)); // Default to 5 seconds or duration
    }
  };

  const extractFrames = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setLoading(true);
    setFrames([]);
    setProgressText('กำลังเตรียมดึงภาพจากวิดีโอ...');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      alert('บราว์เซอร์ของคุณไม่รองรับ HTML Canvas 2D');
      setLoading(false);
      return;
    }

    // Set canvas dimension to full resolution of the video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const extracted: ExtractedFrame[] = [];
    const interval = 1 / fps;
    let currentTime = startTime;
    const limitTime = Math.min(endTime, duration);

    // Pause the video
    video.pause();

    try {
      while (currentTime <= limitTime) {
        // Seek to specific timestamp
        video.currentTime = currentTime;
        
        // Wait for seeked event
        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            resolve();
          };
          const onError = (err: any) => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            reject(err);
          };
          video.addEventListener('seeked', onSeeked);
          video.addEventListener('error', onError);
        });

        // Draw video frame to canvas at full resolution
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Save as PNG
        const dataUrl = canvas.toDataURL('image/png');
        extracted.push({
          dataUrl,
          time: currentTime
        });

        setProgressText(`กำลังประมวลผลดึงภาพ: ${Math.round(((currentTime - startTime) / (limitTime - startTime)) * 100)}%`);
        
        currentTime += interval;
      }

      setFrames(extracted);
      setProgressText('ดึงภาพสำเร็จ!');
    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการดึงภาพจากวิดีโอ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const downloadAllFrames = async () => {
    if (frames.length === 0) return;
    
    setLoading(true);
    setProgressText('กำลังเตรียมบีบอัดไฟล์ภาพทั้งหมดลง ZIP...');
    try {
      const filesToZip = frames.map((frame, idx) => ({
        dataUrl: frame.dataUrl,
        filename: `frame-${idx + 1}-${frame.time.toFixed(2)}s.png`
      }));
      await downloadZip(filesToZip, `ezgif-video-frames-${Date.now()}.zip`);
    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลดรูปภาพทั้งหมด: ' + err.message);
    } finally {
      setLoading(false);
      setProgressText('');
    }
  };

  const clearAll = () => {
    setVideoSrc(null);
    setVideoFile(null);
    setFrames([]);
  };

  return (
    <div className="main-content">
      <div className="glass-panel" style={{ padding: '2rem' }}>
        {/* Upload Zone */}
        {!videoSrc ? (
          <div 
            className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileInput}
          >
            <Film className="upload-icon" />
            <div className="upload-text">ลากและวางไฟล์วิดีโอของคุณที่นี่ หรือคลิกเพื่อค้นหาไฟล์</div>
            <div className="upload-subtext">แยกสกัดเฟรมภาพนิ่งออกมาทีละวินาทีในตระกูลไฟล์ PNG (แนะนำคลิปความยาวไม่เกิน 10-15 วินาที เพื่อป้องกันหน้าบราวเซอร์ค้าง)</div>
            <input 
              ref={fileInputRef}
              type="file" 
              className="file-input" 
              accept="video/*"
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div>
            <div className="tool-header-toolbar">
              <span className="brand-badge" style={{ textTransform: 'none' }}>
                ไฟล์: {videoFile?.name} ({((videoFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB)
              </span>
              <div className="tool-header-group">
                {frames.length > 0 && (
                  <button onClick={downloadAllFrames} className="btn btn-primary">
                    ดาวน์โหลดรูปภาพทั้งหมด
                  </button>
                )}
                <button onClick={clearAll} className="btn btn-danger">
                  ล้างทั้งหมด
                </button>
              </div>
            </div>

            <div className="workspace-grid">
              {/* Left Side: Video Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="preview-container" style={{ padding: 0, overflow: 'hidden', minHeight: 'auto' }}>
                  <video 
                    ref={videoRef}
                    src={videoSrc} 
                    controls 
                    onLoadedMetadata={handleLoadedMetadata}
                    style={{ width: '100%', maxHeight: '400px', display: 'block', background: 'black' }}
                  />
                </div>

                <div className="alert alert-info">
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>คำแนะนำ:</strong> วิดีโอจะถูกดึงภาพนิ่งตามความกว้างสูงต้นฉบับ หากใช้ความถี่ (FPS) สูงกับเวลาที่ยาวนาน จะได้ชุดไฟล์จำนวนมาก
                  </div>
                </div>

                {/* Hidden canvas for extracting frames */}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
              </div>

              {/* Right Side: Options & Actions */}
              <div className="controls-panel glass-panel" style={{ background: 'rgba(0,0,0,0.1)', height: 'fit-content' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                  เครื่องมือสกัดเฟรม
                </h3>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label">วินาทีเริ่มต้น (Start Time)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        type="number" 
                        min="0" 
                        max={duration || 10} 
                        step="0.1"
                        className="form-control" style={{ width: '70px', padding: '0.2rem 0.5rem', textAlign: 'center', fontSize: '0.85rem', background: '#000', border: '2px solid #fff', color: 'white', borderRadius: '0px' }}
                        value={parseFloat(startTime.toFixed(1))}
                        onChange={(e) => setStartTime(Math.min(parseFloat(e.target.value) || 0, endTime - 0.1))}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>วินาที</span>
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max={duration || 10} 
                    step="0.1"
                    className="range-input" 
                    value={startTime}
                    onChange={(e) => setStartTime(Math.min(parseFloat(e.target.value), endTime - 0.1))}
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label">วินาทีสิ้นสุด (End Time)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        type="number" 
                        min="0.1" 
                        max={duration || 10} 
                        step="0.1"
                        className="form-control" style={{ width: '70px', padding: '0.2rem 0.5rem', textAlign: 'center', fontSize: '0.85rem', background: '#000', border: '2px solid #fff', color: 'white', borderRadius: '0px' }}
                        value={parseFloat(endTime.toFixed(1))}
                        onChange={(e) => setEndTime(Math.max(parseFloat(e.target.value) || 0.1, startTime + 0.1))}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>วินาที</span>
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max={duration || 10} 
                    step="0.1"
                    className="range-input" 
                    value={endTime}
                    onChange={(e) => setEndTime(Math.max(parseFloat(e.target.value), startTime + 0.1))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">ความถี่ในการดึงรูปภาพ (Frequency)</label>
                  <select 
                    className="form-control" 
                    value={fps} 
                    onChange={(e) => setFps(parseFloat(e.target.value))}
                  >
                    <option value="0.5">ดึงรูปทุก 2 วินาที (0.5 FPS)</option>
                    <option value="1">ดึงรูปทุก 1 วินาที (1 FPS)</option>
                    <option value="2">ดึงรูปทุก 0.5 วินาที (2 FPS)</option>
                    <option value="5">ดึงรูปทุก 0.2 วินาที (5 FPS)</option>
                    <option value="10">ดึงรูปทุก 0.1 วินาที (10 FPS)</option>
                  </select>
                </div>

                {(endTime - startTime) > 15 && (
                  <div className="alert alert-warning" style={{ fontSize: '0.75rem', padding: '0.5rem', marginTop: '0.5rem', marginBottom: '0.5rem', margin: '0.5rem 0' }}>
                    ⚠️ ช่วงเวลาที่เลือกยาวเกิน 15 วินาที การแยกภาพจำนวนมากอาจส่งผลให้หน้าบราวเซอร์ค้างชั่วขณะขณะดึงเฟรม
                  </div>
                )}

                <button 
                  onClick={extractFrames} 
                  disabled={loading}
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
                      <ImageIcon size={18} />
                      แยกเฟรมรูปภาพ
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Extracted Images Display */}
            {frames.length > 0 && (
              <div style={{ marginTop: '3rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
                  รูปภาพที่แยกสกัดได้ ({frames.length} รูป)
                </h3>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
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
                        <strong>รูปที่ {idx + 1}</strong>
                        <span>เวลา {frame.time.toFixed(2)} วินาที</span>
                      </div>
                      
                      <div style={{
                        aspectRatio: '1.5',
                        background: 'black',
                        borderRadius: '0px',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <img 
                          src={frame.dataUrl} 
                          alt={`Extracted at ${frame.time.toFixed(2)}s`}
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'pointer' }}
                          onClick={() => setLightboxSrc(frame.dataUrl)}
                        />
                      </div>

                      <button 
                        onClick={() => downloadFile(frame.dataUrl, `video-frame-${frame.time.toFixed(2)}s.png`, 'image/png', 'png')}
                        className="btn btn-secondary"
                        style={{
                          padding: '0.35rem 0.5rem',
                          fontSize: '0.75rem',
                          width: '100%',
                          marginTop: '0.25rem'
                        }}
                      >
                        <Download size={12} />
                        ดาวน์โหลดภาพ PNG
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

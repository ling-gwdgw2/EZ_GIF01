import React, { useState, useRef } from 'react';
import { Film, Play, Download, Settings, RefreshCw, AlertCircle } from 'lucide-react';
import gifshot from 'gifshot';
import { downloadFile } from '../utils/downloadHelper';
import { Lightbox, PreviewTrigger } from './Lightbox';

export const VideoToGif: React.FC = () => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  
  // Settings
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(5);
  const [fps, setFps] = useState<number>(10);
  const [width, setWidth] = useState<number>(480);
  const [height, setHeight] = useState<number>(360);
  
  // State
  const [loading, setLoading] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [resultGif, setResultGif] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

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
    setResultGif(null);
    setStartTime(0);
    setEndTime(5); // Default to 5 seconds max or duration
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

  // Update endTime when video duration is loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);
      setEndTime(Math.min(videoDuration, 5)); // Default preview/convert to 5s
      
      // Guess dimensions
      const videoWidth = videoRef.current.videoWidth;
      const videoHeight = videoRef.current.videoHeight;
      if (videoWidth > 0 && videoHeight > 0) {
        // scale to fit within reasonable bounds (max width 480)
        const scale = Math.min(480 / videoWidth, 1);
        setWidth(Math.round(videoWidth * scale));
        setHeight(Math.round(videoHeight * scale));
      }
    }
  };

  const convertVideoToGif = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setLoading(true);
    setResultGif(null);
    setProgressText('กำลังเตรียมประมวลผลวิดีโอ...');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      alert('บราว์เซอร์ของคุณไม่รองรับ 2D Canvas');
      setLoading(false);
      return;
    }

    // Set canvas sizes
    canvas.width = width;
    canvas.height = height;

    const frames: string[] = [];
    const interval = 1 / fps;
    let currentTime = startTime;
    const limitTime = Math.min(endTime, duration);

    // Pause video to manually seek
    video.pause();

    try {
      while (currentTime <= limitTime) {
        // Seek to the time
        video.currentTime = currentTime;
        
        // Wait for seeking to complete
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

        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, width, height);
        
        // Save frame as data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        frames.push(dataUrl);

        setProgressText(`กำลังดึงเฟรมวิดีโอ: ${Math.round(((currentTime - startTime) / (limitTime - startTime)) * 100)}%`);
        
        // Move to next frame time
        currentTime += interval;
      }

      if (frames.length === 0) {
        throw new Error('ดึงข้อมูลเฟรมจากวิดีโอไม่สำเร็จ');
      }

      setProgressText('กำลังประกอบเฟรมเป็นภาพ GIF...');

      // Compile frames to GIF using gifshot
      gifshot.createGIF({
        images: frames,
        gifWidth: width,
        gifHeight: height,
        frameDuration: interval, // speed matches the capture rate
        numWorkers: 2,
        imagesToGif: true
      }, (result) => {
        setLoading(false);
        if (result.error) {
          alert('เกิดข้อผิดพลาดในการสร้าง GIF: ' + result.errorMsg);
        } else {
          setResultGif(result.image);
        }
      });

    } catch (error: any) {
      console.error(error);
      alert('เกิดข้อผิดพลาดในการแปลงไฟล์วิดีโอ: ' + (error.message || error));
      setLoading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const clearAll = () => {
    setVideoSrc(null);
    setVideoFile(null);
    setResultGif(null);
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
            <div className="upload-subtext">รองรับ MP4, WebM, OGG (แนะนำคลิปความยาวสั้นไม่เกิน 10-15 วินาที เพื่อป้องกันหน้าบราวเซอร์ค้าง)</div>
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
              <button onClick={clearAll} className="btn btn-danger">
                ล้างทั้งหมด
              </button>
            </div>

            <div className="workspace-grid">
              {/* Left Side: Video Preview & Capturing Tool */}
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
                    <strong>คำแนะนำ:</strong> ปรับช่วงวินาทีเริ่มต้นและสิ้นสุด เพื่อไม่ให้ไฟล์ GIF มีขนาดใหญ่เกินไป
                  </div>
                </div>

                {/* Hidden canvas for extracting frames */}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
              </div>

              {/* Right Side: Options & Actions */}
              <div className="controls-panel glass-panel" style={{ background: 'rgba(0,0,0,0.1)', height: 'fit-content' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                  <Settings size={18} />
                  ตั้งค่าการแปลง
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
                        className="form-control" 
                        style={{ width: '70px', padding: '0.2rem 0.5rem', textAlign: 'center', fontSize: '0.85rem', background: '#000', border: '2px solid #fff', color: 'white', borderRadius: '0px' }}
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
                        className="form-control" 
                        style={{ width: '70px', padding: '0.2rem 0.5rem', textAlign: 'center', fontSize: '0.85rem', background: '#000', border: '2px solid #fff', color: 'white', borderRadius: '0px' }}
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

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">เฟรมเรต (FPS)</label>
                    <select 
                      className="form-control" 
                      value={fps} 
                      onChange={(e) => setFps(parseInt(e.target.value))}
                    >
                      <option value="5">5 FPS (เน้นขนาดไฟล์เล็ก)</option>
                      <option value="10">10 FPS (มาตรฐาน)</option>
                      <option value="15">15 FPS (ลื่นไหล)</option>
                      <option value="20">20 FPS (ลื่นไหลพิเศษ)</option>
                    </select>
                  </div>
                </div>

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

                {(endTime - startTime) > 15 && (
                  <div className="alert alert-warning" style={{ fontSize: '0.75rem', padding: '0.5rem', marginTop: '0.5rem', marginBottom: '0.5rem', margin: '0.5rem 0' }}>
                    ⚠️ ช่วงเวลานี้เลือกยาวเกิน 15 วินาที อาจส่งผลให้หน้าบราวเซอร์หยุดตอบสนอง (Freeze) ชั่วคราวระหว่างเขียนไฟล์ GIF
                  </div>
                )}

                <button 
                  onClick={convertVideoToGif} 
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
                      <Play size={18} />
                      แปลงวิดีโอเป็น GIF
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Generated Output Preview Section */}
            {resultGif && (
              <div className="glass-panel" style={{ marginTop: '2rem', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)', fontWeight: 600 }}>แปลงไฟล์ GIF สำเร็จ!</h3>
                <PreviewTrigger src={resultGif} alt="Converted Result GIF" className="gif-preview-img" style={{ maxWidth: '100%' }} onClick={() => setLightboxSrc(resultGif)} />
                <button 
                  onClick={() => downloadFile(resultGif, `ezgif-video-to-gif-${Date.now()}.gif`, 'image/gif', 'gif')}
                  className="btn btn-primary"
                  style={{ width: '320px', maxWidth: '100%', background: 'var(--secondary)', color: 'black' }}
                >
                  <Download size={18} />
                  ดาวน์โหลดไฟล์ GIF
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

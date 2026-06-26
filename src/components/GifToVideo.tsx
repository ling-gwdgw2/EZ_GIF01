import React, { useState, useRef } from 'react';
import { Film, Play, Download, RefreshCw, Video } from 'lucide-react';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { downloadFile } from '../utils/downloadHelper';

interface DecodedFrame {
  canvas: HTMLCanvasElement;
  delay: number;
}

export const GifToVideo: React.FC = () => {
  const [gifSrc, setGifSrc] = useState<string | null>(null);
  const [gifFile, setGifFile] = useState<File | null>(null);
  const [decodedFrames, setDecodedFrames] = useState<DecodedFrame[]>([]);
  const [isDecoding, setIsDecoding] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Video Output
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    return () => {
      if (gifSrc) {
        URL.revokeObjectURL(gifSrc);
      }
    };
  }, [gifSrc]);

  React.useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

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
    setVideoUrl(null);
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

  const convertToVideo = () => {
    if (decodedFrames.length === 0 || !canvasRef.current) return;

    setLoading(true);
    setProgressText('กำลังเริ่มบันทึกและแปลงเฟรม...');
    setVideoUrl(null);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const firstFrame = decodedFrames[0];
    const width = firstFrame.canvas.width;
    const height = firstFrame.canvas.height;

    canvas.width = width;
    canvas.height = height;

    // Calculate fps based on delays
    const totalDelay = decodedFrames.reduce((sum, f) => sum + f.delay, 0);
    const avgDelay = totalDelay / decodedFrames.length;
    const fps = Math.round(1000 / avgDelay) || 10;

    // Setup recorder stream
    const stream = canvas.captureStream(fps);
    
    // Choose appropriate mimeType supported by browser
    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm;codecs=vp8' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
      }
    }

    try {
      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const videoBlob = new Blob(chunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(videoBlob);
        setVideoUrl(videoUrl);
        setLoading(false);
      };

      // Start recording
      mediaRecorder.start();

      let frameIndex = 0;
      setProgressText(`กำลังบันทึกวิดีโอ...`);

      const drawLoop = () => {
        if (frameIndex >= decodedFrames.length) {
          // stop recording
          setProgressText('การประมวลผลวิดีโอเสร็จสิ้น!');
          mediaRecorder.stop();
          return;
        }

        const frame = decodedFrames[frameIndex];
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(frame.canvas, 0, 0);

        frameIndex++;
        setTimeout(drawLoop, frame.delay);
      };

      // Start play loop
      drawLoop();

    } catch (err: any) {
      console.error(err);
      alert('เบราว์เซอร์ของคุณไม่รองรับ MediaRecorder API หรือตัวแปลงวิดีโอ: ' + err.message);
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
    setVideoUrl(null);
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
            <Video className="upload-icon" />
            <div className="upload-text">ลากและวางไฟล์ GIF ของคุณที่นี่ หรือคลิกเพื่อค้นหาไฟล์</div>
            <div className="upload-subtext">แปลงไฟล์ภาพเคลื่อนไหวให้เป็นวิดีโอเคลื่อนไหวอย่างรวดเร็ว</div>
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
                ไฟล์: {gifFile?.name} ({decodedFrames.length} เฟรม | {decodedFrames[0]?.canvas.width}x{decodedFrames[0]?.canvas.height} px)
              </span>
              <button onClick={clearAll} className="btn btn-danger" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                ล้างทั้งหมด
              </button>
            </div>

            {isDecoding ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 0' }}>
                 <RefreshCw className="loading-spinner" style={{ animation: 'spin 1s linear infinite' }} />
                 <p style={{ color: 'var(--text-muted)' }}>กำลังดึงข้อมูลและเตรียมเฟรม GIF...</p>
              </div>
            ) : (
              <div className="workspace-grid">
                {/* Visual Area (Source Preview) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="preview-container">
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', alignSelf: 'flex-start' }}>ภาพต้นฉบับ (Original GIF)</h3>
                    <img src={gifSrc} alt="Source GIF" className="gif-preview-img" style={{ maxHeight: '350px' }} />
                  </div>
                  
                  {/* Hidden recording canvas */}
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>

                {/* Convert Box Options */}
                <div className="controls-panel glass-panel" style={{ background: 'rgba(0,0,0,0.1)', height: 'fit-content' }}>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                    <Film size={18} />
                    แปลงเป็นวิดีโอ
                  </h3>
                   <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '0.5rem' }}>
                     เมื่อทำการกดแปลง โปรแกรมจะทำการเล่นภาพ GIF ทีละเฟรมลงในระบบบันทึกและแปลงไฟล์วิดีโอในฟอร์แมต WebM (.webm) โดยตรงบนเบราว์เซอร์
                  </p>

                  <button 
                    onClick={convertToVideo} 
                    disabled={loading || decodedFrames.length === 0}
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="loading-spinner" style={{ width: '16px', height: '16px', margin: 0, animation: 'spin 1s linear infinite' }} />
                        <span>{progressText}</span>
                      </>
                    ) : (
                      <>
                        <Play size={18} />
                        แปลงไฟล์เป็นวิดีโอ WebM
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Video output result */}
            {videoUrl && (
              <div className="glass-panel" style={{ marginTop: '2rem', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
                <h3 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)', fontWeight: 600 }}>แปลงไฟล์วิดีโอ WebM สำเร็จ!</h3>
                <video 
                  src={videoUrl} 
                  controls 
                  loop 
                  className="gif-preview-img" 
                  style={{ width: '100%', maxWidth: '480px', maxHeight: '360px', background: 'black', borderRadius: '0px' }} 
                />
                <button 
                  onClick={() => downloadFile(videoUrl, `ezgif-converted-${Date.now()}.webm`, 'video/webm', 'webm')}
                  className="btn btn-primary"
                  style={{ width: '320px', maxWidth: '100%', background: 'var(--secondary)', color: 'black' }}
                >
                  <Download size={18} />
                  ดาวน์โหลดไฟล์วิดีโอ WebM
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

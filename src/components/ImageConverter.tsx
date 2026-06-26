import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw, Download, Image as ImageIcon, Settings, Music, Film, FileText } from 'lucide-react';
import { downloadFile } from '../utils/downloadHelper';
import { Lightbox, PreviewTrigger } from './Lightbox';
import { jsPDF } from 'jspdf';
import gifshot from 'gifshot';
import JSZip from 'jszip';

interface FileDetails {
  name: string;
  size: number;
  type: string;
}

interface BatchItem {
  id: string;
  file: File;
  src: string | null;
  audioBuffer: AudioBuffer | null;
  status: 'pending' | 'processing' | 'success' | 'error';
  progressText: string;
  convertedUrl: string | null;
  convertedSize: number;
  error?: string;
}

/**
 * Converts a Canvas to a binary ICO file blob URL.
 */
async function convertToIco(canvas: HTMLCanvasElement): Promise<string> {
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
  });
  
  const pngBuffer = await pngBlob.arrayBuffer();
  const pngBytes = new Uint8Array(pngBuffer);
  
  const width = canvas.width > 255 ? 0 : canvas.width;
  const height = canvas.height > 255 ? 0 : canvas.height;
  
  const icoHeader = new Uint8Array(6 + 16);
  const view = new DataView(icoHeader.buffer);
  
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true); // Type (1 = ICO)
  view.setUint16(4, 1, true); // Count
  
  icoHeader[6] = width;
  icoHeader[7] = height;
  icoHeader[8] = 0;
  icoHeader[9] = 0;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, pngBytes.length, true);
  view.setUint32(18, 6 + 16, true);
  
  const icoBytes = new Uint8Array(icoHeader.length + pngBytes.length);
  icoBytes.set(icoHeader, 0);
  icoBytes.set(pngBytes, icoHeader.length);
  
  const icoBlob = new Blob([icoBytes], { type: 'image/x-icon' });
  return URL.createObjectURL(icoBlob);
}

/**
 * Converts a Canvas to a PDF blob URL.
 */
function convertToPdf(canvas: HTMLCanvasElement): string {
  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const pdf = new jsPDF({
    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height]
  });
  pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
  const blob = pdf.output('blob');
  return URL.createObjectURL(blob);
}

/**
 * Encodes an AudioBuffer into WAV format (16-bit signed PCM).
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  let result: Float32Array;
  if (numOfChan === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }
  
  const bufferLength = result.length * 2;
  const wavBuffer = new ArrayBuffer(44 + bufferLength);
  const view = new DataView(wavBuffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bufferLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
  view.setUint16(32, numOfChan * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, bufferLength, true);
  
  floatTo16BitPCM(view, 44, result);
  
  return new Blob([view], { type: 'audio/wav' });
}

function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);
  let index = 0;
  let inputIndex = 0;
  
  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Mix channels/Resample using OfflineAudioContext.
 */
async function renderAudioBuffer(
  originalBuffer: AudioBuffer, 
  targetSampleRate: number, 
  targetChannels: number
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(
    targetChannels,
    Math.round(originalBuffer.duration * targetSampleRate),
    targetSampleRate
  );
  
  const source = offlineCtx.createBufferSource();
  source.buffer = originalBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  
  return await offlineCtx.startRendering();
}

/**
 * Wrap text lines based on max line width for PDF generation.
 */
function convertTextToPdf(
  text: string, 
  fontSize: number, 
  fontStyle: 'monospace' | 'sans-serif' | 'serif', 
  pageSize: 'a4' | 'letter', 
  orientation: 'portrait' | 'landscape'
): string {
  const pdf = new jsPDF({
    orientation: orientation,
    unit: 'pt',
    format: pageSize
  });
  
  let fontName = 'courier'; 
  if (fontStyle === 'sans-serif') fontName = 'helvetica';
  else if (fontStyle === 'serif') fontName = 'times';
  
  pdf.setFont(fontName);
  pdf.setFontSize(fontSize);
  
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const maxLineWidth = pageWidth - margin * 2;
  
  const lines = pdf.splitTextToSize(text, maxLineWidth);
  let cursorY = margin + fontSize;
  const lineHeight = fontSize * 1.3;
  
  lines.forEach((line: string) => {
    if (cursorY + lineHeight > pageHeight - margin) {
      pdf.addPage();
      cursorY = margin + fontSize;
    }
    pdf.text(line, margin, cursorY);
    cursorY += lineHeight;
  });
  
  const blob = pdf.output('blob');
  return URL.createObjectURL(blob);
}

function drawWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const width = canvas.width;
  const height = canvas.height;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  
  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / (width / 6)); 
  const amp = height / 2;
  
  ctx.fillStyle = 'var(--secondary)';
  
  for (let i = 0; i < width; i += 6) {
    const dataIndex = Math.floor((i / width) * data.length);
    let max = 0;
    
    for (let j = 0; j < step && (dataIndex + j) < data.length; j++) {
      const val = Math.abs(data[dataIndex + j]);
      if (val > max) max = val;
    }
    
    const barHeight = Math.max(2, max * amp * 0.9);
    const y = (height - barHeight) / 2;
    ctx.fillRect(i, y, 4, barHeight);
  }
}

/**
 * Converts a Canvas to an SVG blob URL.
 */
async function convertToSvg(canvas: HTMLCanvasElement, mode: 'embed' | 'trace'): Promise<string> {
  const width = canvas.width;
  const height = canvas.height;
  
  if (mode === 'embed') {
    const pngUrl = canvas.toDataURL('image/png');
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image width="${width}" height="${height}" href="${pngUrl}"/>
</svg>`;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    return URL.createObjectURL(blob);
  } else {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    
    let traceWidth = width;
    let traceHeight = height;
    let tempCanvas = canvas;
    
    // Web Worker trace allows up to 600px safely without freezing the UI
    if (width > 600 || height > 600) {
      const scale = Math.min(600 / width, 600 / height);
      traceWidth = Math.round(width * scale);
      traceHeight = Math.round(height * scale);
      
      tempCanvas = document.createElement('canvas');
      tempCanvas.width = traceWidth;
      tempCanvas.height = traceHeight;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0, traceWidth, traceHeight);
      }
    }
    
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) throw new Error('Could not get context');
    
    const imgData = tempCtx.getImageData(0, 0, traceWidth, traceHeight);
    const dataBuffer = imgData.data.buffer.slice(0); // slice to make it safe for transferring
    
    return new Promise<string>((resolve, reject) => {
      try {
        const worker = new Worker(
          new URL('../workers/trace.worker.ts', import.meta.url),
          { type: 'module' }
        );
        
        worker.onmessage = (e) => {
          const { success, svgContent, error } = e.data;
          worker.terminate();
          if (success) {
            const blob = new Blob([svgContent], { type: 'image/svg+xml' });
            resolve(URL.createObjectURL(blob));
          } else {
            reject(new Error(error || 'Failed to trace image in worker'));
          }
        };
        
        worker.onerror = (err) => {
          worker.terminate();
          reject(err);
        };
        
        worker.postMessage({
          width,
          height,
          traceWidth,
          traceHeight,
          dataBuffer
        }, [dataBuffer]);
      } catch (err) {
        reject(err);
      }
    });
  }
}

async function convertSingleImage(
  src: string,
  targetFormat: string,
  quality: number,
  resizeWidth: number,
  resizeHeight: number,
  svgMode: 'embed' | 'trace'
): Promise<{ url: string; size: number }> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });

  const canvas = document.createElement('canvas');
  canvas.width = resizeWidth || img.width || 400;
  canvas.height = resizeHeight || img.height || 400;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d context');

  if (targetFormat === 'image/jpeg' || targetFormat === 'application/pdf') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  let dataUrl = '';
  let sizeInBytes = 0;

  if (targetFormat === 'application/pdf') {
    dataUrl = convertToPdf(canvas);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    sizeInBytes = blob.size;
  } else if (targetFormat === 'image/svg+xml') {
    dataUrl = await convertToSvg(canvas, svgMode);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    sizeInBytes = blob.size;
  } else if (targetFormat === 'image/x-icon') {
    dataUrl = await convertToIco(canvas);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    sizeInBytes = blob.size;
  } else {
    const qualityParam = quality / 100;
    dataUrl = canvas.toDataURL(targetFormat, qualityParam);
    const head = dataUrl.indexOf(',') + 1;
    const base64Len = dataUrl.length - head;
    sizeInBytes = Math.round(base64Len * 0.75);
  }

  return { url: dataUrl, size: sizeInBytes };
}

async function convertSingleAudio(
  buffer: AudioBuffer,
  audioChannels: string,
  audioSampleRate: number
): Promise<{ url: string; size: number }> {
  let processedBuffer = buffer;
  const targetChannels = audioChannels === 'stereo' ? 2 : audioChannels === 'mono' ? 1 : buffer.numberOfChannels;
  const targetSR = audioSampleRate > 0 ? audioSampleRate : buffer.sampleRate;
  
  if (targetSR !== buffer.sampleRate || targetChannels !== buffer.numberOfChannels) {
    processedBuffer = await renderAudioBuffer(buffer, targetSR, targetChannels);
  }
  
  const wavBlob = audioBufferToWavBlob(processedBuffer);
  const dataUrl = URL.createObjectURL(wavBlob);
  return { url: dataUrl, size: wavBlob.size };
}

export const ImageConverter: React.FC = () => {
  const [fileCategory, setFileCategory] = useState<'image' | 'audio' | 'video' | 'document' | null>(null);
  const [fileDetails, setFileDetails] = useState<FileDetails | null>(null);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  
  // Input sources
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState<string>('');
  
  // Decoded Audio Data
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  // Settings
  const [targetFormat, setTargetFormat] = useState<string>('');
  const [quality, setQuality] = useState<number>(85);
  const [resizeWidth, setResizeWidth] = useState<number>(0);
  const [resizeHeight, setResizeHeight] = useState<number>(0);
  const [maintainAspect, setMaintainAspect] = useState<boolean>(true);
  const [aspectRatio, setAspectRatio] = useState<number>(1);
  
  // SVG Settings
  const [svgMode, setSvgMode] = useState<'embed' | 'trace'>('embed');
  
  // Audio Settings
  const [audioSampleRate, setAudioSampleRate] = useState<number>(0); // 0 = original
  const [audioChannels, setAudioChannels] = useState<string>('original');

  // Video Settings
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoStartTime, setVideoStartTime] = useState<number>(0);
  const [videoEndTime, setVideoEndTime] = useState<number>(5);
  const [videoFps, setVideoFps] = useState<number>(10);
  const [videoSnapshotTime, setVideoSnapshotTime] = useState<number>(0);

  // Document Settings
  const [docFontSize, setDocFontSize] = useState<number>(12);
  const [docFontStyle, setDocFontStyle] = useState<'monospace' | 'sans-serif' | 'serif'>('monospace');
  const [docPageSize, setDocPageSize] = useState<'a4' | 'letter'>('a4');
  const [docOrientation, setDocOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // States
  const [loading, setLoading] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [convertedSize, setConvertedSize] = useState<number>(0);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Warnings / Notifications
  const [tiffWarning, setTiffWarning] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeUrlsRef = useRef<string[]>([]);

  const registerUrl = (url: string) => {
    activeUrlsRef.current.push(url);
    return url;
  };

  const revokeAllUrls = () => {
    activeUrlsRef.current.forEach((url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    activeUrlsRef.current = [];
  };

  const setAndTrackConvertedUrl = (url: string) => {
    if (convertedUrl && convertedUrl.startsWith('blob:')) {
      URL.revokeObjectURL(convertedUrl);
      activeUrlsRef.current = activeUrlsRef.current.filter(u => u !== convertedUrl);
    }
    setConvertedUrl(registerUrl(url));
  };

  const detectFileCategory = (file: File): 'image' | 'audio' | 'video' | 'document' => {
    const mime = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    
    if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp|ico|tiff?)$/.test(name)) {
      return 'image';
    }
    if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac|wma)$/.test(name)) {
      return 'audio';
    }
    if (mime.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/.test(name)) {
      return 'video';
    }
    return 'document';
  };

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
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFiles(e.target.files);
    }
  };

  const processFiles = async (files: FileList) => {
    revokeAllUrls();
    
    if (files.length === 0) return;
    
    // Auto-detect category of the first file
    const firstFile = files[0];
    const category = detectFileCategory(firstFile);
    
    // Filter files to only contain files of the same category
    let validFiles = Array.from(files).filter(file => detectFileCategory(file) === category);
    
    if (files.length > 1 && category !== 'image' && category !== 'audio') {
      alert('ระบบการแปลงแบบกลุ่ม (Batch Conversion) รองรับเฉพาะรูปภาพและเสียงเท่านั้น สำหรับวิดีโอและเอกสารกรุณาแปลงทีละไฟล์');
      validFiles = [firstFile];
    } else if (validFiles.length < files.length) {
      alert(`พบบางไฟล์ไม่ใช่ประเภทเดียวกับไฟล์แรก (${category}) ระบบจะเลือกแปลงเฉพาะไฟล์ที่เป็นประเภทเดียวกันจำนวน ${validFiles.length} ไฟล์`);
    }
    
    setTiffWarning(validFiles.some(f => /\.(tiff?)$/i.test(f.name)));
    setFileCategory(category);
    
    setFileDetails({
      name: validFiles.length === 1 ? firstFile.name : `${validFiles.length} รูปภาพ/ไฟล์เสียง`,
      size: validFiles.reduce((acc, f) => acc + f.size, 0),
      type: validFiles.length === 1 ? firstFile.type : `batch/${category}`
    });
    
    // Clear old state
    setImageSrc(null);
    setAudioSrc(null);
    setVideoSrc(null);
    setDocumentText('');
    setConvertedUrl(null);
    setConvertedSize(0);
    setAudioBuffer(null);
    
    const items: BatchItem[] = [];
    
    for (const file of validFiles) {
      const id = Math.random().toString(36).substring(2, 9);
      const url = registerUrl(URL.createObjectURL(file));
      
      let decodedBuffer: AudioBuffer | null = null;
      if (category === 'audio') {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
          await ctx.close();
        } catch (err) {
          console.error('Failed to decode audio file in batch:', file.name, err);
        }
      }
      
      items.push({
        id,
        file,
        src: url,
        audioBuffer: decodedBuffer,
        status: 'pending',
        progressText: 'รอการแปลงไฟล์',
        convertedUrl: null,
        convertedSize: 0
      });
    }
    
    setBatchItems(items);
    
    // For single-file preview backward compatibility
    if (items.length === 1) {
      const singleItem = items[0];
      if (category === 'image' && singleItem.src) {
        setImageSrc(singleItem.src);
        const img = new Image();
        img.onload = () => {
          const w = img.width || 400;
          const h = img.height || 400;
          setResizeWidth(w);
          setResizeHeight(h);
          setAspectRatio(w / h);
        };
        img.src = singleItem.src;
        setTargetFormat('image/webp');
      } else if (category === 'audio') {
        setAudioSrc(singleItem.src);
        setAudioBuffer(singleItem.audioBuffer);
        setTargetFormat('audio/wav');
        
        // Draw waveform
        const buffer = singleItem.audioBuffer;
        if (buffer) {
          setTimeout(() => {
            const canvas = document.getElementById('audio-waveform') as HTMLCanvasElement;
            if (canvas) {
              drawWaveform(canvas, buffer);
            }
          }, 150);
        }
      } else if (category === 'video') {
        setVideoSrc(singleItem.src);
        setTargetFormat('image/gif');
        setVideoStartTime(0);
        setVideoEndTime(5);
        setVideoFps(10);
        setVideoSnapshotTime(0);
      } else if (category === 'document') {
        setTargetFormat('application/pdf');
        try {
          const text = await singleItem.file.text();
          setDocumentText(text);
        } catch (err) {
          console.error('Failed to read text file:', err);
          setDocumentText('Error reading file content.');
        }
      }
    } else {
      // For batch mode: set default formats
      if (category === 'image') {
        setResizeWidth(0);
        setResizeHeight(0);
        setTargetFormat('image/webp');
      } else if (category === 'audio') {
        setTargetFormat('audio/wav');
      }
    }
  };

  const downloadAllAsZip = async () => {
    try {
      setLoading(true);
      setProgressText('กำลังบีบอัดไฟล์ ZIP...');
      const zip = new JSZip();
      
      for (const item of batchItems) {
        if (item.status === 'success' && item.convertedUrl) {
          const res = await fetch(item.convertedUrl);
          const blob = await res.blob();
          
          const ext = getExtension(targetFormat);
          const originalName = item.file.name;
          const lastDot = originalName.lastIndexOf('.');
          const nameWithoutExt = lastDot !== -1 ? originalName.substring(0, lastDot) : originalName;
          const filename = `${nameWithoutExt}.${ext}`;
          
          zip.file(filename, blob);
        }
      }
      
      const content = await zip.generateAsync({ type: 'blob' });
      const zipUrl = registerUrl(URL.createObjectURL(content));
      downloadFile(zipUrl, `ezgif-batch-${Date.now()}.zip`, 'application/zip', 'zip');
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการสร้างไฟล์ ZIP: ' + err.message);
    } finally {
      setLoading(false);
      setProgressText('');
    }
  };

  const handleLoadedVideoMetadata = () => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      setVideoDuration(duration);
      setVideoEndTime(Math.min(duration, 5));
      setResizeWidth(videoRef.current.videoWidth);
      setResizeHeight(videoRef.current.videoHeight);
      setAspectRatio(videoRef.current.videoWidth / videoRef.current.videoHeight);
    }
  };

  const handleWidthChange = (val: number) => {
    setResizeWidth(val);
    if (maintainAspect && val > 0) {
      setResizeHeight(Math.round(val / aspectRatio));
    }
  };

  const handleHeightChange = (val: number) => {
    setResizeHeight(val);
    if (maintainAspect && val > 0) {
      setResizeWidth(Math.round(val * aspectRatio));
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const convertFile = async () => {
    if (!fileCategory || !fileDetails || batchItems.length === 0) return;
    setLoading(true);
    setProgressText('กำลังจัดเตรียมไฟล์...');

    setTimeout(async () => {
      try {
        if (fileCategory === 'video') {
          await convertVideo();
        } else if (fileCategory === 'document') {
          await convertDocument();
        } else {
          // Process batch (images or audio)
          for (let i = 0; i < batchItems.length; i++) {
            const item = batchItems[i];
            setBatchItems(prev => prev.map(x => x.id === item.id ? { ...x, status: 'processing', progressText: 'กำลังแปลงไฟล์...' } : x));
            setProgressText(`กำลังแปลงไฟล์ ${i + 1}/${batchItems.length}: ${item.file.name}`);
            
            try {
              let url = '';
              let size = 0;
              
              if (fileCategory === 'image') {
                const res = await convertSingleImage(
                  item.src!,
                  targetFormat,
                  quality,
                  resizeWidth,
                  resizeHeight,
                  svgMode
                );
                url = res.url;
                size = res.size;
              } else if (fileCategory === 'audio') {
                if (!item.audioBuffer) throw new Error('ไม่พบข้อมูลเสียง');
                const res = await convertSingleAudio(
                  item.audioBuffer,
                  audioChannels,
                  audioSampleRate
                );
                url = res.url;
                size = res.size;
              }
              
              setBatchItems(prev => prev.map(x => x.id === item.id ? {
                ...x,
                status: 'success',
                progressText: 'เสร็จสิ้น',
                convertedUrl: url,
                convertedSize: size
              } : x));
              
              if (batchItems.length === 1) {
                setAndTrackConvertedUrl(url);
                setConvertedSize(size);
              }
            } catch (err: any) {
              console.error(err);
              setBatchItems(prev => prev.map(x => x.id === item.id ? {
                ...x,
                status: 'error',
                progressText: 'ล้มเหลว',
                error: err.message || 'เกิดข้อผิดพลาด'
              } : x));
            }
          }
        }
      } catch (err: any) {
        console.error(err);
        alert('เกิดข้อผิดพลาดในการแปลงไฟล์: ' + err.message);
      } finally {
        setLoading(false);
        setProgressText('');
      }
    }, 300);
  };

  const convertVideo = async () => {
    if (!videoSrc) return;
    
    if (targetFormat === 'image/gif') {
      setProgressText('กำลังเตรียมประมวลผลคลิปวิดีโอ...');
      const video = document.createElement('video');
      video.src = videoSrc;
      video.muted = true;
      video.playsInline = true;
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
        video.load();
      });
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d context');
      
      const targetW = resizeWidth || video.videoWidth || 320;
      const targetH = resizeHeight || video.videoHeight || 240;
      canvas.width = targetW;
      canvas.height = targetH;
      
      const frames: string[] = [];
      const duration = video.duration;
      const start = videoStartTime;
      const end = Math.min(videoEndTime, duration);
      const fps = videoFps;
      const interval = 1 / fps;
      
      let current = start;
      video.pause();
      
      while (current <= end) {
        setProgressText(`กำลังดึงเฟรมวิดีโอ... ${Math.round(((current - start) / (end - start)) * 100)}%`);
        video.currentTime = current;
        
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
        
        ctx.drawImage(video, 0, 0, targetW, targetH);
        frames.push(canvas.toDataURL('image/jpeg', 0.85));
        current += interval;
      }
      
      setProgressText('กำลังประกอบเฟรมเป็นภาพ GIF...');
      await new Promise<void>((resolve, reject) => {
        gifshot.createGIF({
          images: frames,
          gifWidth: targetW,
          gifHeight: targetH,
          frameDuration: interval,
          numWorkers: 2,
          imagesToGif: true
        }, (result) => {
          if (result.error) {
            reject(new Error(result.errorMsg));
          } else {
            setAndTrackConvertedUrl(result.image);
            const head = result.image.indexOf(',') + 1;
            const base64Len = result.image.length - head;
            setConvertedSize(Math.round(base64Len * 0.75));
            resolve();
          }
        });
      });
      
    } else if (targetFormat === 'audio/wav') {
      setProgressText('กำลังสแกนสัญญาณเสียงจากวิดีโอ...');
      const res = await fetch(videoSrc);
      const arrayBuffer = await res.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      await ctx.close();
      
      setProgressText('กำลังจัดรูปแบบไฟล์เสียง (WAV)...');
      let processedBuffer = buffer;
      const targetChannels = audioChannels === 'stereo' ? 2 : audioChannels === 'mono' ? 1 : buffer.numberOfChannels;
      const targetSR = audioSampleRate > 0 ? audioSampleRate : buffer.sampleRate;
      
      if (targetSR !== buffer.sampleRate || targetChannels !== buffer.numberOfChannels) {
        setProgressText('กำลังปรับเปลี่ยนคลื่นเสียง (Resampling)...');
        processedBuffer = await renderAudioBuffer(buffer, targetSR, targetChannels);
      }
      
      const wavBlob = audioBufferToWavBlob(processedBuffer);
      const dataUrl = URL.createObjectURL(wavBlob);
      
      setAndTrackConvertedUrl(dataUrl);
      setConvertedSize(wavBlob.size);
      
    } else {
      // Snapshot (PNG/JPEG/WebP)
      setProgressText('กำลังข้ามไปยังเฟรมวิดีโอที่เลือก...');
      const video = document.createElement('video');
      video.src = videoSrc;
      video.muted = true;
      video.playsInline = true;
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
        video.load();
      });
      
      video.currentTime = videoSnapshotTime;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });
      
      const canvas = document.createElement('canvas');
      const targetW = resizeWidth || video.videoWidth || 640;
      const targetH = resizeHeight || video.videoHeight || 480;
      canvas.width = targetW;
      canvas.height = targetH;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d context');
      
      if (targetFormat === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);
      }
      ctx.drawImage(video, 0, 0, targetW, targetH);
      
      const qualityParam = quality / 100;
      const dataUrl = canvas.toDataURL(targetFormat, targetFormat === 'image/png' ? undefined : qualityParam);
      
      const head = dataUrl.indexOf(',') + 1;
      const base64Len = dataUrl.length - head;
      setAndTrackConvertedUrl(dataUrl);
      setConvertedSize(Math.round(base64Len * 0.75));
    }
  };

  const convertDocument = async () => {
    if (targetFormat === 'text/plain') {
      const blob = new Blob([documentText], { type: 'text/plain;charset=utf-8' });
      setAndTrackConvertedUrl(URL.createObjectURL(blob));
      setConvertedSize(blob.size);
    } else if (targetFormat === 'text/html') {
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Converted Document</title>
  <style>
    body { font-family: sans-serif; padding: 20px; line-height: 1.6; white-space: pre-wrap; }
  </style>
</head>
<body>
${escapeHtml(documentText)}
</body>
</html>`;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      setAndTrackConvertedUrl(URL.createObjectURL(blob));
      setConvertedSize(blob.size);
    } else if (targetFormat === 'application/pdf') {
      setProgressText('กำลังประกอบเอกสาร PDF...');
      const url = convertTextToPdf(documentText, docFontSize, docFontStyle, docPageSize, docOrientation);
      const res = await fetch(url);
      const blob = await res.blob();
      setAndTrackConvertedUrl(url);
      setConvertedSize(blob.size);
    }
  };

  const escapeHtml = (text: string): string => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const getFormatLabel = (mime: string) => {
    switch (mime) {
      case 'image/png': return 'PNG';
      case 'image/jpeg': return 'JPEG/JPG';
      case 'image/webp': return 'WebP';
      case 'image/gif': return 'GIF';
      case 'image/svg+xml': return 'SVG (Vector)';
      case 'image/x-icon': return 'ICO (Icon)';
      case 'application/pdf': return 'PDF (Document)';
      case 'audio/wav': return 'WAV (Lossless)';
      case 'text/plain': return 'TXT';
      case 'text/html': return 'HTML';
      default: return 'Unknown';
    }
  };

  const getExtension = (mime: string) => {
    switch (mime) {
      case 'image/png': return 'png';
      case 'image/jpeg': return 'jpg';
      case 'image/webp': return 'webp';
      case 'image/gif': return 'gif';
      case 'image/svg+xml': return 'svg';
      case 'image/x-icon': return 'ico';
      case 'application/pdf': return 'pdf';
      case 'audio/wav': return 'wav';
      case 'text/plain': return 'txt';
      case 'text/html': return 'html';
      default: return 'bin';
    }
  };

  const getFileSizeLabel = (size: number) => {
    if (size >= 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(size / 1024).toFixed(1)} KB`;
  };

  const clearAll = () => {
    revokeAllUrls();
    setTiffWarning(false);
    setFileCategory(null);
    setFileDetails(null);
    setImageSrc(null);
    setAudioSrc(null);
    setVideoSrc(null);
    setDocumentText('');
    setConvertedUrl(null);
    setConvertedSize(0);
    setAudioBuffer(null);
    setBatchItems([]);
  };

  // Sync canvas redraw on buffer reload and unmount cleanup
  useEffect(() => {
    if (fileCategory === 'audio' && audioBuffer) {
      const canvas = document.getElementById('audio-waveform') as HTMLCanvasElement;
      if (canvas) {
        drawWaveform(canvas, audioBuffer);
      }
    }
  }, [fileCategory, audioBuffer]);

  useEffect(() => {
    return () => {
      revokeAllUrls();
    };
  }, []);

  return (
    <div className="main-content">
      <div className="glass-panel" style={{ padding: '2rem' }}>
        {!fileCategory ? (
          <div 
            className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileInput}
          >
            <RefreshCw className="upload-icon" />
            <div className="upload-text">ลากและวางไฟล์ที่ต้องการแปลงที่นี่ หรือคลิกเพื่อเลือกไฟล์</div>
            <div className="upload-subtext" style={{ fontSize: '0.8rem', opacity: 0.75, maxWidth: '650px', lineHeight: '1.4' }}>
              รองรับไฟล์ทุกประเภท: รูปภาพ (PNG, JPG, WebP, GIF, SVG, BMP, ICO, TIFF) วิดีโอ (MP4, WebM, OGG, MOV) เสียง (MP3, WAV, M4A, OGG, FLAC) และเอกสาร/ข้อความ (TXT, MD, CSV, JSON, HTML)
            </div>
            <input 
              ref={fileInputRef}
              type="file" 
              className="file-input" 
              accept="*"
              multiple
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div>
            <div className="tool-header-toolbar">
              <span className="brand-badge" style={{ textTransform: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {fileCategory === 'image' && <ImageIcon size={14} />}
                {fileCategory === 'audio' && <Music size={14} />}
                {fileCategory === 'video' && <Film size={14} />}
                {fileCategory === 'document' && <FileText size={14} />}
                {batchItems.length > 1 ? `แบทช์: ${batchItems.length} ไฟล์` : `ไฟล์: ${fileDetails?.name}`} ({getFileSizeLabel(fileDetails?.size || 0)})
              </span>
              <button onClick={clearAll} className="btn btn-danger">
                ล้างทั้งหมด
              </button>
            </div>

            <div className="workspace-grid">
              {/* Left Column: Preview input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="preview-container">
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', alignSelf: 'flex-start', color: 'white' }}>
                    {batchItems.length > 1 ? 'รายการไฟล์ในแบทช์ (Batch File List)' : 'ตัวอย่างไฟล์ต้นฉบับ (Source Preview)'}
                  </h3>

                  {batchItems.length > 1 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                      {batchItems.some(x => x.status === 'success') && (
                        <button
                          onClick={downloadAllAsZip}
                          className="btn btn-primary"
                          style={{ width: '100%', background: 'var(--accent-green)', color: 'black', fontWeight: 'bold', border: '2px solid white', boxShadow: '4px 4px 0px #000' }}
                        >
                          📦 ดาวน์โหลดทั้งหมดเป็นไฟล์ .ZIP
                        </button>
                      )}
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto', paddingRight: '0.5rem', width: '100%' }}>
                        {batchItems.map((item) => (
                          <div key={item.id} className="glass-panel" style={{ padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.3)', border: '2px solid white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '2px 2px 0px #000' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '65%' }}>
                              <span style={{ fontSize: '0.85rem', color: 'white', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.file.name}>
                                {item.file.name}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {getFileSizeLabel(item.file.size)}
                                {item.status === 'success' && ` → ${getFileSizeLabel(item.convertedSize)}`}
                              </span>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {item.status === 'pending' && <span className="brand-badge" style={{ background: '#777', color: 'white', border: '1px solid white' }}>รอคิว</span>}
                              {item.status === 'processing' && <span className="brand-badge" style={{ background: 'var(--secondary)', color: 'black', border: '1px solid black' }}>กำลังแปลง...</span>}
                              {item.status === 'success' && <span className="brand-badge" style={{ background: 'var(--accent-green)', color: 'black', border: '1px solid black' }}>สำเร็จ</span>}
                              {item.status === 'error' && <span className="brand-badge" style={{ background: 'var(--accent-red)', color: 'white', border: '1px solid white' }} title={item.error}>ล้มเหลว</span>}
                              
                              {item.status === 'success' && item.convertedUrl && (
                                <button
                                  onClick={() => downloadFile(item.convertedUrl!, `${item.file.name.substring(0, item.file.name.lastIndexOf('.')) || item.file.name}.${getExtension(targetFormat)}`, targetFormat, getExtension(targetFormat))}
                                  className="btn btn-secondary"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                  title="ดาวน์โหลดไฟล์นี้"
                                >
                                  <Download size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      {fileCategory === 'image' && imageSrc && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                          {tiffWarning && (
                            <div className="alert alert-warning" style={{ fontSize: '0.8rem', padding: '0.5rem', width: '100%', marginBottom: '0.5rem', margin: '0 auto 0.5rem auto' }}>
                              ⚠️ ไฟล์ TIFF อาจไม่รองรับการแสดงผลพรีวิวในบางเบราว์เซอร์ หากไม่พบตัวอย่างภาพ คุณสามารถกดปุ่ม "แปลงไฟล์เลย!" เพื่อประมวลผลต่อได้ปกติ
                            </div>
                          )}
                          <PreviewTrigger 
                            src={imageSrc} 
                            alt="Source Preview" 
                            className="gif-preview-img" 
                            style={{ maxHeight: '300px' }}
                            onClick={() => setLightboxSrc(imageSrc)}
                          />
                        </div>
                      )}

                      {fileCategory === 'audio' && (
                        <div style={{ width: '100%', background: 'black', padding: '15px', border: '2px solid white', boxShadow: '4px 4px 0px #000', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ color: 'var(--secondary)', fontFamily: 'var(--font-display)', fontSize: '0.75rem', letterSpacing: '1px' }}>
                            WAVEFORM ANALYZER:
                          </div>
                          <canvas 
                            id="audio-waveform" 
                            width={400} 
                            height={100} 
                            style={{ width: '100%', height: '100px', display: 'block', background: 'black' }} 
                          />
                          {audioSrc && (
                            <audio 
                              src={audioSrc} 
                              controls 
                              style={{ width: '100%' }} 
                            />
                          )}
                          {audioBuffer && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              ข้อมูล: {audioBuffer.sampleRate} Hz • {audioBuffer.numberOfChannels} ช่องเสียง • {audioBuffer.duration.toFixed(1)} วินาที
                            </span>
                          )}
                        </div>
                      )}

                      {fileCategory === 'video' && videoSrc && (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <video 
                            ref={videoRef}
                            src={videoSrc} 
                            controls 
                            onLoadedMetadata={handleLoadedVideoMetadata}
                            style={{ width: '100%', maxHeight: '300px', display: 'block', background: 'black', border: '2px solid white', boxShadow: '4px 4px 0px #000' }}
                          />
                          {videoDuration > 0 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              ความละเอียด: {resizeWidth} x {resizeHeight} px • ยาว: {videoDuration.toFixed(1)} วินาที
                            </span>
                          )}
                        </div>
                      )}

                      {fileCategory === 'document' && (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <div style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-display)', fontSize: '0.75rem', letterSpacing: '1px' }}>
                            TEXT CONTENT VIEWER:
                          </div>
                          <textarea
                            readOnly
                            value={documentText}
                            style={{
                              width: '100%',
                              height: '250px',
                              background: 'black',
                              color: '#00ffcc',
                              fontFamily: 'monospace',
                              border: '2px solid white',
                              padding: '10px',
                              resize: 'none',
                              boxShadow: '4px 4px 0px #000',
                              fontSize: '0.85rem',
                              lineHeight: '1.4'
                            }}
                          />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            จำนวนตัวอักษร: {documentText.length} ตัว
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Settings panel */}
                <div className="glass-panel" style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.2)' }}>
                  <h3 style={{ fontSize: '1.05rem', fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <Settings size={18} style={{ color: 'var(--secondary)' }} />
                    การตั้งค่าการแปลงไฟล์ (Settings)
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Format Selector depending on category */}
                    {fileCategory === 'image' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div>
                          <label className="form-label">ฟอร์แมตปลายทาง</label>
                          <select 
                            className="form-control" 
                            value={targetFormat} 
                            onChange={(e) => setTargetFormat(e.target.value)}
                          >
                            <option value="image/webp">WebP (แนะนำ - ขนาดเล็กคุณภาพดี)</option>
                            <option value="image/png">PNG (ความคมชัดสูง/รองรับความโปร่งใส)</option>
                            <option value="image/jpeg">JPEG (ยอดนิยม/ลดรูปถ่ายได้ดี)</option>
                            <option value="image/gif">GIF (ภาพนิ่ง - Static GIF)</option>
                            <option value="image/svg+xml">SVG (กราฟิกเวกเตอร์ - Vector SVG)</option>
                            <option value="image/x-icon">ICO (ไอคอน - Favicon)</option>
                            <option value="application/pdf">PDF (เอกสาร PDF)</option>
                          </select>
                        </div>
                        {fileDetails?.name.toLowerCase().endsWith('.gif') && targetFormat !== 'image/gif' && (
                          <div className="alert alert-warning" style={{ fontSize: '0.75rem', padding: '0.5rem', margin: 0 }}>
                            ⚠️ หมายเหตุ: การแปลงไฟล์ GIF ในหน้านี้จะเป็นการบันทึกภาพนิ่ง (Static Frame) หากต้องการจัดการหรือบีบอัดไฟล์ GIF เคลื่อนไหวครบทุกเฟรม กรุณาเลือกใช้เมนู GIF Splitter หรือ GIF Optimizer แทน
                          </div>
                        )}
                      </div>
                    )}

                    {fileCategory === 'audio' && (
                      <div>
                        <label className="form-label">ฟอร์แมตปลายทาง</label>
                        <select 
                          className="form-control" 
                          value={targetFormat} 
                          onChange={(e) => setTargetFormat(e.target.value)}
                        >
                          <option value="audio/wav">WAV (ไฟล์เสียงคุณภาพสูงแบบไร้กำลังสูญเสีย)</option>
                        </select>
                      </div>
                    )}

                    {fileCategory === 'video' && (
                      <div>
                        <label className="form-label">ฟอร์แมตปลายทาง</label>
                        <select 
                          className="form-control" 
                          value={targetFormat} 
                          onChange={(e) => {
                            setTargetFormat(e.target.value);
                            // Adjust defaults
                            if (e.target.value === 'audio/wav') {
                              setAudioSampleRate(0);
                            }
                          }}
                        >
                          <option value="image/gif">GIF (ภาพเคลื่อนไหว - Animated GIF)</option>
                          <option value="image/png">Snapshot Frame (PNG)</option>
                          <option value="image/jpeg">Snapshot Frame (JPEG)</option>
                          <option value="image/webp">Snapshot Frame (WebP)</option>
                          <option value="audio/wav">Extract Audio Track (สกัดเฉพาะเสียงเป็น WAV)</option>
                        </select>
                      </div>
                    )}

                    {fileCategory === 'document' && (
                      <div>
                        <label className="form-label">ฟอร์แมตปลายทาง</label>
                        <select 
                          className="form-control" 
                          value={targetFormat} 
                          onChange={(e) => setTargetFormat(e.target.value)}
                        >
                          <option value="application/pdf">PDF (เอกสาร PDF จัดหน้าอัตโนมัติ)</option>
                          <option value="text/plain">TXT (ไฟล์ข้อความดิบ)</option>
                          <option value="text/html">HTML Document</option>
                        </select>
                      </div>
                    )}

                    {/* SVG Options */}
                    {fileCategory === 'image' && targetFormat === 'image/svg+xml' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div>
                          <label className="form-label">โหมดการแปลง SVG (SVG Mode)</label>
                          <select 
                            className="form-control"
                            value={svgMode}
                            onChange={(e) => setSvgMode(e.target.value as any)}
                          >
                            <option value="embed">ฝังรูปภาพต้นฉบับ (Embedded Raster - เหมาะสำหรับรูปขนาดใหญ่)</option>
                            <option value="trace">วาดตามพิกเซล (Pixel-Art Vector Trace - เหมาะสำหรับภาพพิกเซล)</option>
                          </select>
                        </div>
                        {svgMode === 'trace' && (
                          <div className="alert alert-info" style={{ fontSize: '0.75rem', padding: '0.5rem', margin: 0 }}>
                            💡 ระบบจะประมวลผลเบื้องหลังผ่าน Web Worker เพื่อความลื่นไหล และจำกัดขนาดภาพไม่เกิน 600px เพื่อป้องกันไม่ให้ไฟล์เวกเตอร์ SVG มีขนาดใหญ่เกินไป
                          </div>
                        )}
                      </div>
                    )}

                    {/* Image Options */}
                    {fileCategory === 'image' && targetFormat !== 'image/png' && targetFormat !== 'image/svg+xml' && targetFormat !== 'image/x-icon' && targetFormat !== 'application/pdf' && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label className="form-label">คุณภาพของภาพ (Quality)</label>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: 'var(--secondary)' }}>{quality}%</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <input 
                            type="range" 
                            min="10" 
                            max="100" 
                            value={quality}
                            onChange={(e) => setQuality(Number(e.target.value))}
                            style={{ flex: 1 }}
                          />
                          <input 
                            type="number"
                            min="10"
                            max="100"
                            className="form-control"
                            style={{ width: '60px', padding: '0.2rem', textAlign: 'center' }}
                            value={quality}
                            onChange={(e) => setQuality(Math.min(100, Math.max(10, Number(e.target.value))))}
                          />
                        </div>
                      </div>
                    )}

                    {/* Resize Inputs for Images & Video Snapshots */}
                    {(fileCategory === 'image' || (fileCategory === 'video' && targetFormat !== 'audio/wav')) && (
                      <div>
                        <label className="form-label">ปรับขนาดเฟรม/รูปภาพ (Resize)</label>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>กว้าง:</span>
                            <input 
                              type="number" 
                              className="form-control" 
                              style={{ width: '80px', padding: '0.25rem 0.5rem' }} 
                              value={resizeWidth}
                              onChange={(e) => handleWidthChange(Number(e.target.value))}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>สูง:</span>
                            <input 
                              type="number" 
                              className="form-control" 
                              style={{ width: '80px', padding: '0.25rem 0.5rem' }} 
                              value={resizeHeight}
                              onChange={(e) => handleHeightChange(Number(e.target.value))}
                            />
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', cursor: 'pointer', color: 'white' }}>
                            <input 
                              type="checkbox" 
                              checked={maintainAspect} 
                              onChange={(e) => setMaintainAspect(e.target.checked)}
                            />
                            คงอัตราส่วน (Ratio)
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Audio Custom Options (Both Audio and Video Audio extraction) */}
                    {(fileCategory === 'audio' || (fileCategory === 'video' && targetFormat === 'audio/wav')) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div>
                          <label className="form-label">อัตราสุ่มตัวอย่าง (Sample Rate)</label>
                          <select 
                            className="form-control"
                            value={audioSampleRate}
                            onChange={(e) => setAudioSampleRate(Number(e.target.value))}
                          >
                            <option value={0}>คงค่าเดิม (Original)</option>
                            <option value={48000}>48,000 Hz (คุณภาพระดับสตูดิโอ)</option>
                            <option value={44100}>44,100 Hz (คุณภาพระดับซีดีเพลง)</option>
                            <option value={22050}>22,050 Hz (ประหยัดพื้นที่)</option>
                            <option value={11025}>11,025 Hz (ขนาดเล็กพิเศษ)</option>
                          </select>
                        </div>
                        <div>
                          <label className="form-label">โหมดช่องเสียง (Channels)</label>
                          <select
                            className="form-control"
                            value={audioChannels}
                            onChange={(e) => setAudioChannels(e.target.value)}
                          >
                            <option value="original">คงค่าเดิม (Original)</option>
                            <option value="stereo">สเตอริโอ (Stereo - 2 Channels)</option>
                            <option value="mono">โมโน (Mono - 1 Channel)</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Video Animated GIF custom options */}
                    {fileCategory === 'video' && targetFormat === 'image/gif' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <div style={{ flex: 1 }}>
                            <label className="form-label">เริ่มต้น (วิที่)</label>
                            <input 
                              type="number" 
                              step="0.1"
                              min="0"
                              max={videoDuration}
                              className="form-control"
                              value={videoStartTime}
                              onChange={(e) => setVideoStartTime(Math.max(0, Number(e.target.value)))}
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="form-label">สิ้นสุด (วิที่)</label>
                            <input 
                              type="number" 
                              step="0.1"
                              min="0"
                              max={videoDuration}
                              className="form-control"
                              value={videoEndTime}
                              onChange={(e) => setVideoEndTime(Math.min(videoDuration, Number(e.target.value)))}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="form-label">เฟรมเรต (FPS)</label>
                          <select 
                            className="form-control"
                            value={videoFps}
                            onChange={(e) => setVideoFps(Number(e.target.value))}
                          >
                            <option value={5}>5 FPS (ขนาดเล็กมาก)</option>
                            <option value={10}>10 FPS (ปกติ)</option>
                            <option value={15}>15 FPS (ไหลลื่น)</option>
                            <option value={20}>20 FPS (คมชัดคุณภาพสูง)</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Video Snapshot selector */}
                    {fileCategory === 'video' && (targetFormat === 'image/png' || targetFormat === 'image/jpeg' || targetFormat === 'image/webp') && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label className="form-label">เลือกช่วงเวลาเพื่อถ่ายรูป (Time Position)</label>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: 'var(--secondary)' }}>
                            {videoSnapshotTime.toFixed(2)} / {videoDuration.toFixed(1)} วินาที
                          </span>
                        </div>
                        <input 
                          type="range"
                          min="0"
                          max={videoDuration}
                          step="0.05"
                          value={videoSnapshotTime}
                          onChange={(e) => {
                            const time = Number(e.target.value);
                            setVideoSnapshotTime(time);
                            if (videoRef.current) {
                              videoRef.current.currentTime = time;
                            }
                          }}
                          style={{ width: '100%' }}
                        />
                      </div>
                    )}

                    {/* Document settings */}
                    {fileCategory === 'document' && targetFormat === 'application/pdf' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <div style={{ flex: 1 }}>
                            <label className="form-label">ขนาดฟอนต์</label>
                            <select 
                              className="form-control"
                              value={docFontSize}
                              onChange={(e) => setDocFontSize(Number(e.target.value))}
                            >
                              <option value={8}>8 pt</option>
                              <option value={10}>10 pt</option>
                              <option value={12}>12 pt (มาตรฐาน)</option>
                              <option value={14}>14 pt</option>
                              <option value={16}>16 pt</option>
                              <option value={18}>18 pt</option>
                              <option value={24}>24 pt</option>
                            </select>
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="form-label">รูปแบบตัวอักษร</label>
                            <select 
                              className="form-control"
                              value={docFontStyle}
                              onChange={(e) => setDocFontStyle(e.target.value as any)}
                            >
                              <option value="monospace">Monospace (พิมพ์ดีด)</option>
                              <option value="sans-serif">Sans-Serif (ขอบตัด)</option>
                              <option value="serif">Serif (มีเชิงโบราณ)</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <div style={{ flex: 1 }}>
                            <label className="form-label">ขนาดหน้าเอกสาร</label>
                            <select 
                              className="form-control"
                              value={docPageSize}
                              onChange={(e) => setDocPageSize(e.target.value as any)}
                            >
                              <option value="a4">A4</option>
                              <option value="letter">Letter</option>
                            </select>
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="form-label">แนวการจัดวาง</label>
                            <select 
                              className="form-control"
                              value={docOrientation}
                              onChange={(e) => setDocOrientation(e.target.value as any)}
                            >
                              <option value="portrait">แนวตั้ง (Portrait)</option>
                              <option value="landscape">แนวนอน (Landscape)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    <button 
                      onClick={convertFile}
                      disabled={loading}
                      className="btn btn-primary"
                      style={{ marginTop: '0.5rem', width: '100%', justifyContent: 'center' }}
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="loading-spinner" size={18} style={{ animation: 'spin 1s linear infinite' }} />
                          {progressText || 'กำลังแปลงไฟล์...'}
                        </>
                      ) : (
                        'แปลงไฟล์เลย!'
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Output Preview */}
              <div className="preview-container">
                {batchItems.length > 1 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', width: '100%' }}>
                    <h3 style={{ fontSize: '1rem', fontFamily: 'var(--font-display)', color: 'white', alignSelf: 'flex-start' }}>
                      ผลลัพธ์การแปลงกลุ่ม (Batch Results)
                    </h3>
                    
                    {batchItems.some(x => x.status === 'success') ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', width: '100%' }}>
                        <div style={{ fontSize: '3.5rem', filter: 'drop-shadow(0px 4px 0px #000)' }}>📦</div>
                        <span style={{ fontSize: '0.9rem', color: 'var(--accent-green)', fontWeight: 'bold', fontFamily: 'var(--font-display)', textAlign: 'center' }}>
                          แปลงสำเร็จ {batchItems.filter(x => x.status === 'success').length} / {batchItems.length} ไฟล์
                        </span>
                        
                        <button
                          onClick={downloadAllAsZip}
                          className="btn btn-primary"
                          style={{ width: '100%', background: 'var(--accent-green)', color: 'black', fontWeight: 'bold', border: '2px solid white', boxShadow: '4px 4px 0px #000' }}
                        >
                          <Download size={18} />
                          ดาวน์โหลดทั้งหมดเป็นไฟล์ .ZIP
                        </button>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        <ImageIcon size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                        <p style={{ fontSize: '0.9rem' }}>ตั้งค่าไฟล์ปลายทางทางด้านซ้าย แล้วกดปุ่ม "แปลงไฟล์เลย!" เพื่อเริ่มต้นประมวลผลกลุ่ม</p>
                      </div>
                    )}
                  </div>
                ) : convertedUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', width: '100%' }}>
                    <h3 style={{ fontSize: '1rem', fontFamily: 'var(--font-display)', color: 'var(--accent-green)' }}>
                      แปลงไฟล์สำเร็จเป็น {getFormatLabel(targetFormat)}!
                    </h3>

                    {/* PDF Output Preview */}
                    {targetFormat === 'application/pdf' && (
                      <div 
                        className="gif-preview-img" 
                        style={{ 
                          height: '200px', 
                          width: '200px', 
                          display: 'flex', 
                          flexDirection: 'column', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          background: 'rgba(0,0,0,0.3)', 
                          border: '4px solid var(--border-color)', 
                          boxShadow: '6px 6px 0px #000000', 
                          gap: '0.75rem', 
                          cursor: 'pointer' 
                        }} 
                        onClick={() => window.open(convertedUrl || undefined, '_blank')}
                        title="เปิดดูตัวอย่าง PDF ในหน้าต่างใหม่"
                      >
                        <span style={{ fontSize: '3rem' }}>📄</span>
                        <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-display)', color: 'var(--accent-pink)' }}>เปิดดู PDF</span>
                      </div>
                    )}

                    {/* Audio Output Preview */}
                    {targetFormat === 'audio/wav' && (
                      <div style={{ width: '100%', background: 'black', padding: '15px', border: '2px solid white', boxShadow: '4px 4px 0px #000', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                        <span style={{ fontSize: '2.5rem' }}>🎵</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--secondary)', fontFamily: 'var(--font-display)' }}>ไฟล์เสียงผลลัพธ์</span>
                        <audio src={convertedUrl} controls style={{ width: '100%' }} />
                      </div>
                    )}

                    {/* Text Output Preview */}
                    {(targetFormat === 'text/plain' || targetFormat === 'text/html') && (
                      <div 
                        className="gif-preview-img" 
                        style={{ 
                          height: '200px', 
                          width: '200px', 
                          display: 'flex', 
                          flexDirection: 'column', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          background: 'rgba(0,0,0,0.3)', 
                          border: '4px solid var(--border-color)', 
                          boxShadow: '6px 6px 0px #000000', 
                          gap: '0.75rem', 
                          cursor: 'pointer' 
                        }} 
                        onClick={() => window.open(convertedUrl || undefined, '_blank')}
                      >
                        <span style={{ fontSize: '3rem' }}>🗎</span>
                        <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-display)', color: 'var(--secondary)' }}>เปิดอ่านไฟล์</span>
                      </div>
                    )}

                    {/* Standard Image/GIF Output Preview */}
                    {targetFormat !== 'application/pdf' && targetFormat !== 'audio/wav' && targetFormat !== 'text/plain' && targetFormat !== 'text/html' && (
                      <PreviewTrigger 
                        src={convertedUrl} 
                        alt="Converted Output" 
                        className="gif-preview-img" 
                        style={{ maxHeight: '300px' }}
                        onClick={() => setLightboxSrc(convertedUrl)}
                      />
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)', alignItems: 'center' }}>
                      {fileCategory === 'image' || (fileCategory === 'video' && targetFormat !== 'audio/wav') ? (
                        <span>ความละเอียดใหม่: {resizeWidth} x {resizeHeight} px</span>
                      ) : null}
                      <span>ขนาดไฟล์ใหม่: {getFileSizeLabel(convertedSize)}</span>
                      {fileDetails && (
                        <span style={{ 
                          color: convertedSize < fileDetails.size ? 'var(--accent-green)' : 'var(--accent-pink)',
                          fontWeight: 'bold' 
                        }}>
                          {convertedSize < fileDetails.size 
                            ? `ประหยัดพื้นที่ลง ${((1 - (convertedSize / fileDetails.size)) * 100).toFixed(1)}%`
                            : `ขนาดใหญ่ขึ้น ${(((convertedSize / fileDetails.size) - 1) * 100).toFixed(1)}%`
                          }
                        </span>
                      )}
                    </div>

                    <button 
                      onClick={() => {
                        const originalNameWithoutExt = fileDetails?.name.substring(0, fileDetails.name.lastIndexOf('.')) || 'converted';
                        downloadFile(
                          convertedUrl, 
                          `${originalNameWithoutExt}.${getExtension(targetFormat)}`, 
                          targetFormat, 
                          getExtension(targetFormat)
                        );
                      }}
                      className="btn btn-primary"
                      style={{ width: '100%', background: 'var(--secondary)', color: 'black' }}
                    >
                      <Download size={18} />
                      ดาวน์โหลดไฟล์ปลายทาง
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <ImageIcon size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                    <p style={{ fontSize: '0.9rem' }}>เมื่อกดยืนยันการแปลงไฟล์ ผลลัพธ์เปรียบเทียบขนาดจะขึ้นแสดงที่นี่</p>
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

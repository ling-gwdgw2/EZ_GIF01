self.onmessage = (e: MessageEvent) => {
  try {
    const { width, height, traceWidth, traceHeight, dataBuffer } = e.data;
    
    const data = new Uint8ClampedArray(dataBuffer);
    const pixelW = width / traceWidth;
    const pixelH = height / traceHeight;
    
    const rects: string[] = [];
    
    for (let y = 0; y < traceHeight; y++) {
      for (let x = 0; x < traceWidth; x++) {
        const idx = (y * traceWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        
        if (a > 0) {
          const fill = `rgb(${r},${g},${b})`;
          const fillOpacity = a < 255 ? ` fill-opacity="${(a / 255).toFixed(2)}"` : '';
          const px = x * pixelW;
          const py = y * pixelH;
          rects.push(`  <rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pixelW.toFixed(1)}" height="${pixelH.toFixed(1)}" fill="${fill}"${fillOpacity}/>\n`);
        }
      }
    }
    
    const rectsContent = rects.join('');
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">\n${rectsContent}</svg>`;
    
    self.postMessage({ success: true, svgContent });
  } catch (error: any) {
    self.postMessage({ success: false, error: error.message || 'Error occurred during tracing' });
  }
};

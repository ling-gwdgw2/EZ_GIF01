import JSZip from 'jszip';

/**
 * Utility helper to download a file.
 * Uses File System Access API (showSaveFilePicker) on supported browsers (Chrome, Edge, etc.)
 * to let the user select where to store the file and name it, falling back to 
 * traditional anchor tags.
 */
export async function downloadFile(
  dataUrl: string, 
  suggestedName: string, 
  mimeType: string, 
  extension: string
): Promise<void> {
  // Check if showSaveFilePicker is supported in the browser
  if ('showSaveFilePicker' in window) {
    try {
      const accept: Record<string, string[]> = {
        [mimeType]: [`.${extension}`]
      };
      
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: suggestedName,
        types: [{
          description: `${extension.toUpperCase()} File`,
          accept: accept
        }]
      });
      
      const writable = await handle.createWritable();
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      await writable.write(blob);
      await writable.close();
      return; // Success
    } catch (err: any) {
      // If the user cancelled, do nothing
      if (err.name === 'AbortError') {
        return;
      }
      console.warn('showSaveFilePicker failed, falling back to anchor tag download', err);
    }
  }
  
  // Fallback: traditional download
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = suggestedName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Packs multiple files (from dataUrls) into a single ZIP file
 * and prompts the user to download the ZIP, selecting a save location.
 */
export async function downloadZip(
  files: { dataUrl: string; filename: string }[],
  suggestedZipName: string
): Promise<void> {
  const zip = new JSZip();
  
  // Add each file to the zip
  for (const file of files) {
    const response = await fetch(file.dataUrl);
    const blob = await response.blob();
    zip.file(file.filename, blob);
  }
  
  // Generate the zip blob
  const content = await zip.generateAsync({ type: 'blob' });
  const objectUrl = URL.createObjectURL(content);
  
  try {
    await downloadFile(objectUrl, suggestedZipName, 'application/zip', 'zip');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

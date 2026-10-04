import iconv from 'iconv-lite';
import { Buffer } from 'buffer';

// Ensure Buffer is available globally if iconv-lite needs it, 
// though iconv-lite in browser browserify might use its own Buffer instance or we just pass Buffer directly.
(window as any).Buffer = (window as any).Buffer || Buffer;

export function downloadAsAnsi(content: string, filename: string) {
  // Use GBK encoding which is the standard "ANSI" for simplified Chinese Windows,
  // where AutoCAD LISP files are usually loaded in mainland China.
  const buf = iconv.encode(content, 'gbk');
  
  // Create Blob from buffer
  const blob = new Blob([buf], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

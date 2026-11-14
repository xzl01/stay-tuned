/* SPDX-License-Identifier: GPL-3.0-only */

/**
 * Read a local image and downscale it into a small data URL suitable for
 * localStorage. Covers stay sharp at 320px and usually remain well under 80KB.
 */
export async function imageFileToDataUrl(file: File, maxSize = 320): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。');
  if (file.size > 15 * 1024 * 1024) throw new Error('图片不能大于 15MB。');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round((image.naturalWidth || maxSize) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || maxSize) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法处理这张图片。');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    let dataUrl = canvas.toDataURL('image/webp', 0.85);
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    if (dataUrl.length > 500_000) throw new Error('图片处理失败，请换一张更小的图片。');
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取这张图片。'));
    image.src = src;
  });
}

import { Platform } from 'react-native';

/**
 * Web: shrink a picked image (long edge ≤ 2000 px, JPEG) so several phone screenshots fit in one request.
 * Claude reads text fine at this size. Native: the picker already compresses (quality option).
 */
export async function prepImage(base64: string, mediaType: string): Promise<{ base64: string; mediaType: string }> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return { base64, mediaType };
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el); el.onerror = reject;
      el.src = `data:${mediaType};base64,${base64}`;
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { base64, mediaType };
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    return out && out.length < base64.length * 1.2 ? { base64: out, mediaType: 'image/jpeg' } : { base64, mediaType };
  } catch {
    return { base64, mediaType };
  }
}

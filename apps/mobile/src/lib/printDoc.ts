// Print / save-as-PDF a standalone HTML document.
// Web: opens it in a visible new tab with a « Imprimer / Enregistrer en PDF » bar and triggers printing
//      (hidden iframes are ignored by mobile browsers, notably iOS Safari). If the tab is blocked, shows it
//      full-screen inside the app instead. Must be called synchronously from the click handler (before any await).
// Native: real PDF file via expo-print, then the share sheet.
import { Platform } from 'react-native';

const toolbar = (fr: boolean) => `
<div class="cbx-bar" style="position:sticky;top:0;z-index:9;display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px 14px;background:#0B6E73;color:#fff;font:600 14px -apple-system,Segoe UI,Roboto,sans-serif">
  <span>${fr ? 'Aperçu avant impression' : 'Print preview'}</span>
  <span style="display:flex;gap:8px">
    <button onclick="window.print()" style="background:#6EECF2;color:#0B0F1E;border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer">🖨 ${fr ? 'Imprimer / Enregistrer en PDF' : 'Print / Save as PDF'}</button>
    <button onclick="window.parent!==window?window.parent.postMessage('cbx-close','*'):window.close()" style="background:transparent;color:#fff;border:1px solid #fff;border-radius:8px;padding:8px 12px;cursor:pointer">✕</button>
  </span>
</div>
<style>@media print{.cbx-bar{display:none!important}}</style>`;

function withToolbar(html: string, fr: boolean) {
  return /<body[^>]*>/i.test(html) ? html.replace(/<body([^>]*)>/i, `<body$1>${toolbar(fr)}`) : toolbar(fr) + html;
}

export async function printHtml(html: string, opts: { title: string; fr?: boolean; landscape?: boolean } ) {
  const fr = opts.fr ?? true;
  if (Platform.OS === 'web') {
    const doc = withToolbar(html, fr);
    const w = window.open('', '_blank');
    if (w) {
      w.document.open(); w.document.write(doc); w.document.close();
      w.document.title = opts.title;
      setTimeout(() => { try { w.focus(); w.print(); } catch { /* the toolbar button remains */ } }, 600);
      return 'tab' as const;
    }
    // Pop-up blocked: full-screen overlay inside the app.
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff';
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:100%;height:100%;border:0';
    box.appendChild(frame); document.body.appendChild(box);
    const close = (e: MessageEvent) => { if (e.data === 'cbx-close') { box.remove(); window.removeEventListener('message', close); } };
    window.addEventListener('message', close);
    frame.contentWindow!.document.open(); frame.contentWindow!.document.write(doc); frame.contentWindow!.document.close();
    return 'overlay' as const;
  }
  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html, ...(opts.landscape ? { width: 842, height: 595 } : {}) });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: opts.title, UTI: 'com.adobe.pdf' });
  return 'native' as const;
}

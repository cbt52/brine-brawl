const ADJ = ['soggy', 'salty', 'wobbly', 'crispy', 'grumpy', 'sneaky', 'bouncy', 'dizzy'];
const NOUN = ['clam', 'kelp', 'crab', 'pearl', 'squid', 'whelk', 'barnacle', 'urchin'];

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const rand = (n: number) => Math.random().toString(36).slice(2, 2 + n);

export const quickRoom = (): string => `qp-${rand(4)}`;
export const friendlyRoom = (): string => `${pick(ADJ)}-${pick(NOUN)}-${10 + Math.floor(Math.random() * 90)}`;

/** Accepts a bare code or a pasted invite URL; returns a valid room id or null. */
export function parseRoomCode(raw: string): string | null {
  let s = raw.trim();
  const m = s.match(/[?&]room=([^&#\s]+)/);
  if (m) s = decodeURIComponent(m[1]);
  s = s.toLowerCase().replace(/\s+/g, '-');
  return /^[a-z0-9-]{1,24}$/.test(s) ? s : null;
}

export const inviteUrl = (room: string): string => `${location.origin}/?room=${encodeURIComponent(room)}`;

/** Clipboard API needs a secure context (not plain HTTP over LAN) → fall back to execCommand. */
export async function copyText(text: string, fallbackEl?: HTMLInputElement): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  const el = fallbackEl ?? Object.assign(document.createElement('input'), { value: text });
  if (!fallbackEl) document.body.appendChild(el);
  el.focus();
  el.select();
  el.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* ignore */ }
  if (!fallbackEl) el.remove();
  return ok;
}

// Comprobantes de una transacción: solo se guardan links (Google Drive u otro
// sitio), nunca los archivos. De un link de Drive se arma la vista previa.

export const MAX_RECEIPTS = 10;

// Separadores entre links: saltos de línea, espacios, comas, ";" o "|".
const SEPARATORS = /[\s,;|]+/;

export function parseReceiptUrls(text: string) {
  const urls: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(SEPARATORS)) {
    const value = part.trim();
    if (!value) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      invalid.push(value);
      continue;
    }
    if (url.protocol !== "https:") {
      invalid.push(value);
      continue;
    }
    if (!urls.includes(url.href)) urls.push(url.href);
  }
  return { urls: urls.slice(0, MAX_RECEIPTS), invalid, tooMany: urls.length > MAX_RECEIPTS };
}

// Mensaje de error de una lista de links (null si está bien).
export function receiptUrlsError(parsed: ReturnType<typeof parseReceiptUrls>) {
  if (parsed.invalid.length > 0) return `El link “${parsed.invalid[0]}” no es válido (tiene que empezar con https://).`;
  if (parsed.tooMany) return `Se pueden adjuntar hasta ${MAX_RECEIPTS} comprobantes.`;
  return null;
}

const DRIVE_HOSTS = ["drive.google.com", "docs.google.com"];

// ID del archivo en un link de Drive: /file/d/<id>/view, /open?id=<id>,
// /uc?id=<id> o /document/d/<id>. null si no es de Drive.
export function driveFileId(href: string) {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!DRIVE_HOSTS.includes(url.hostname)) return null;
  const fromPath = url.pathname.match(/\/d\/([\w-]{10,})/);
  if (fromPath) return fromPath[1];
  const fromQuery = url.searchParams.get("id");
  return fromQuery && /^[\w-]{10,}$/.test(fromQuery) ? fromQuery : null;
}

export type ReceiptPreview =
  | { kind: "drive"; thumbnail: string; embed: string; open: string }
  | { kind: "image"; src: string; open: string }
  | { kind: "link"; open: string };

// Cómo mostrar un comprobante. En Drive la vista previa necesita que el archivo
// esté compartido como "Cualquier persona con el enlace".
export function receiptPreview(href: string): ReceiptPreview {
  const id = driveFileId(href);
  if (id) {
    return {
      kind: "drive",
      thumbnail: `https://drive.google.com/thumbnail?id=${id}&sz=w600`,
      embed: `https://drive.google.com/file/d/${id}/preview`,
      open: href,
    };
  }
  try {
    if (/\.(jpe?g|png|webp|gif)$/i.test(new URL(href).pathname)) return { kind: "image", src: href, open: href };
  } catch {
    // Link inválido: se muestra tal cual.
  }
  return { kind: "link", open: href };
}

// Nombre corto para mostrar un link ("drive.google.com/…/abc123").
export function receiptLabel(href: string) {
  try {
    const url = new URL(href);
    const id = driveFileId(href);
    return id ? `Drive · ${id.slice(0, 8)}…` : `${url.hostname}${url.pathname.length > 1 ? "/…" : ""}`;
  } catch {
    return href;
  }
}

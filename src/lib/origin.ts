// Origen público de la app (protocolo + dominio) según las cabeceras del pedido.
// Detrás de un proxy o túnel, `request.url` trae la dirección interna
// (localhost), así que se usan `x-forwarded-host` / `x-forwarded-proto`.
export function publicOrigin(headers: Headers) {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0].trim();
  if (!host) return null;
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const protocol = forwardedProto ?? (local ? "http" : "https");
  return { protocol, host, origin: `${protocol}://${host}` };
}

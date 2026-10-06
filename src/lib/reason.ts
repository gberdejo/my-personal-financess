// "Café ", "café" y "CAFÉ" cuentan como el mismo motivo. Lo usan los gastos
// recurrentes para agrupar y las sugerencias para no duplicar.
export function normalizeReason(reason: string) {
  return reason.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-PE");
}

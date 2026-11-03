import * as XLSX from "xlsx";

// Solo se usa en el servidor (features/imports/actions.ts). Primera hoja de un
// .xlsx, .xls o .csv como filas de texto (tal como se ven en Excel). Las
// celdas vacías quedan como "".
export function readSheet(buffer: ArrayBuffer): string[][] {
  // `raw`: en un CSV, "03/11/2026" queda como texto (SheetJS lo leería como
  // fecha de EE. UU., 11 de marzo). `dateNF`: las celdas que en Excel sí son
  // fecha se leen como DD/MM/AAAA.
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", raw: true, dateNF: "dd/mm/yyyy" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
    dateNF: "dd/mm/yyyy",
  });
  return rows.map((cells) => cells.map((value) => String(value ?? "")));
}

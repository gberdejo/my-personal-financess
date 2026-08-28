import { ImageResponse } from "next/og";

export const alt = "Finanzas Personales";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e6e63",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 148,
            height: 148,
            borderRadius: 40,
            background: "rgba(255, 255, 255, 0.14)",
            marginBottom: 40,
          }}
        >
          <svg
            width="86"
            height="86"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ffffff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
            <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
          </svg>
        </div>

        <div
          style={{
            display: "flex",
            fontFamily: "serif",
            fontSize: 68,
            fontWeight: 600,
            color: "#ffffff",
            letterSpacing: -1,
          }}
        >
          Finanzas Personales
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: "rgba(255, 255, 255, 0.72)",
            marginTop: 16,
          }}
        >
          Ordená tus ingresos y gastos
        </div>

        <svg
          width="360"
          height="70"
          viewBox="0 0 360 70"
          fill="none"
          style={{ marginTop: 48 }}
        >
          <polyline
            points="0,60 90,44 180,48 270,16 360,6"
            stroke="rgba(255, 255, 255, 0.55)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="360" cy="6" r="7" fill="#ffffff" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}

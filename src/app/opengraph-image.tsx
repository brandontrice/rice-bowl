import { ImageResponse } from "next/og";

export const alt = "The Rice Bowl — a permanent-rivalry fantasy matchup, redrafted every week.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Link preview card. Deliberately typographic — the app's identity is the
 * wordmark on lacquer with the two rivals' colours split beneath it.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#14100c",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#7a6c59",
          }}
        >
          Two managers · One rivalry
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 148,
              fontWeight: 800,
              lineHeight: 0.9,
              letterSpacing: -2,
              textTransform: "uppercase",
              color: "#f7f2e7",
            }}
          >
            The Rice Bowl
          </div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 32, color: "#a99a85" }}>
            Redrafted every week. One House Rule, dealt from the deck.
          </div>
        </div>

        <div style={{ display: "flex", height: 12, width: "100%" }}>
          <div style={{ display: "flex", width: "58%", background: "#f2603a" }} />
          <div style={{ display: "flex", width: "42%", background: "#47a8d8" }} />
        </div>
      </div>
    ),
    size,
  );
}

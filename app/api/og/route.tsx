import { ImageResponse } from "next/og"

export const runtime = "edge"

export async function GET() {
  return new ImageResponse(
    <div
      style={{
        fontSize: 48,
        background: "#003A6E",
        color: "white",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px",
      }}
    >
      <div style={{ fontSize: 64, fontWeight: "bold", marginBottom: "20px" }}>QUT Classmate</div>
      <div style={{ fontSize: 36, textAlign: "center", maxWidth: "80%" }}>
        The timetable tool QUT should've made, but didn't.
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  )
}

import { C } from "../../site/constants";

export default function Footer({ nav }) {
  return (
    <footer style={{ borderTop: `1px solid ${C.border}`, padding: "40px 24px", marginTop: 40 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ padding: "6px 10px", borderRadius: 10, background: "rgba(8,12,16,0.85)", border: `1px solid ${C.border}` }}>
              <img src="/images/golfsum-logo.png" alt="GolfSum" style={{ height: 28, width: "auto", display: "block" }} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 15 }}>GolfSum</span>
          </div>
          <p style={{ fontSize: 13, color: C.textDim }}>Capture · Analyze · Improve</p>
        </div>
        <div style={{ display: "flex", gap: 32 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Product</span>
            <a href="#" onClick={(e) => { e.preventDefault(); nav("features"); }} style={{ fontSize: 14, color: C.textMuted }}>Features</a>
            <a href="#" onClick={(e) => { e.preventDefault(); nav("pricing"); }} style={{ fontSize: 14, color: C.textMuted }}>Pricing</a>
            <a href="#" onClick={(e) => { e.preventDefault(); nav("tutorial"); }} style={{ fontSize: 14, color: C.textMuted }}>Tutorial</a>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Legal</span>
            <a href="#" onClick={(e) => { e.preventDefault(); nav("privacy"); }} style={{ fontSize: 14, color: C.textMuted }}>Privacy Policy</a>
            <a href="#" onClick={(e) => { e.preventDefault(); nav("terms"); }} style={{ fontSize: 14, color: C.textMuted }}>Terms of Service</a>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>Support</span>
            <a href="mailto:support@golfsum.com" style={{ fontSize: 14, color: C.textMuted }}>support@golfsum.com</a>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: "24px auto 0", borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
        <p style={{ fontSize: 12, color: C.textDim }}>© 2026 GolfSum. All rights reserved.</p>
      </div>
    </footer>
  );
}

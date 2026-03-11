import { C, premiumFeatureList, APP_LINKS } from "../site/constants";

export default function PricingPage({ Icon }) {
  const handleGetStarted = (plan = "annual") => {
    if (typeof window !== "undefined" && typeof window.va === "function") {
      window.va("event", { name: "pricing_cta_click", data: { plan } });
    }
    if (APP_LINKS.ios) {
      window.open(APP_LINKS.ios, "_blank", "noopener");
      return;
    }
    if (APP_LINKS.ios_pending) {
      window.open(APP_LINKS.ios_pending, "_blank", "noopener");
      return;
    }
    document.getElementById("notify")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section style={{ padding: "80px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <h1 className="serif fade-up" style={{ fontSize: 42, fontWeight: 400, textAlign: "center", marginBottom: 12 }}>Simple Pricing</h1>
      <p className="fade-up stagger-1" style={{ textAlign: "center", color: C.textMuted, marginBottom: 48, fontSize: 17 }}>Start free with 3 premium rounds. Upgrade when you're ready for the full picture.</p>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 32 }}>
        {APP_LINKS.ios && (
          <a href={APP_LINKS.ios} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            iOS App Store
          </a>
        )}
        {APP_LINKS.android && (
          <a href={APP_LINKS.android} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            Google Play
          </a>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        <div className="card fade-up stagger-1" style={{ padding: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Free</div>
          <div style={{ fontSize: 40, fontWeight: 700, marginBottom: 4 }}>$0</div>
          <div style={{ fontSize: 14, color: C.textDim, marginBottom: 24 }}>Forever</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {["Score & putts per hole", "Round history", "GolfSum Player Rating", "OCR course import (yardages, pars, tees)", "Course search", "Manual course entry"].map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: C.textMuted }}>
                <Icon name="check" size={14} color={C.brand} /> {f}
              </div>
            ))}
          </div>
        </div>
        <div className="card fade-up stagger-2" style={{ padding: 32, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.brand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Premium Monthly</div>
          <div style={{ fontSize: 40, fontWeight: 700, marginBottom: 4 }}>$6.99<span style={{ fontSize: 16, fontWeight: 400, color: C.textMuted }}>/mo</span></div>
          <div style={{ fontSize: 14, color: C.textDim, marginBottom: 4 }}>Cancel anytime</div>
          <div style={{ fontSize: 14, color: C.textDim, marginBottom: 24 }}>3 free premium rounds</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
            {premiumFeatureList.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: i === 0 ? C.text : C.textMuted, fontWeight: i === 0 ? 600 : 400 }}>
                <Icon name="check" size={14} color={C.brand} /> {f}
              </div>
            ))}
          </div>
          <button className="btn btn-secondary" style={{ width: "100%", justifyContent: "center", marginTop: "auto" }} onClick={() => handleGetStarted("monthly")}>Subscribe Monthly</button>
        </div>
        <div className="card fade-up stagger-3" style={{ padding: 32, borderColor: C.brand, position: "relative", background: `linear-gradient(135deg, ${C.bgCard}, rgba(16,185,129,0.04))`, display: "flex", flexDirection: "column" }}>
          <div className="badge badge-green" style={{ position: "absolute", top: 8, right: 12 }}>Save 17%</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.brand, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Premium Annual</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 40, fontWeight: 700 }}>$69.99</span>
            <span style={{ fontSize: 16, color: C.textMuted }}>/year</span>
          </div>
          <div style={{ fontSize: 14, color: C.textDim, marginBottom: 4 }}>$5.83/month · 3 free premium rounds</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
            <span style={{ fontSize: 14, color: C.textDim, textDecoration: "line-through" }}>$83.88/yr</span>
            <span style={{ fontSize: 14, color: C.brand, fontWeight: 600 }}>You save $13.89</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
            {premiumFeatureList.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: i === 0 ? C.text : C.textMuted, fontWeight: i === 0 ? 600 : 400 }}>
                <Icon name="check" size={14} color={C.brand} /> {f}
              </div>
            ))}
          </div>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: "auto" }} onClick={() => handleGetStarted("annual")}>Start Free Rounds</button>
        </div>
      </div>
    </section>
  );
}

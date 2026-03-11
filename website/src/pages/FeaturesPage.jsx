import { C, PHOTOS } from "../site/constants";

export default function FeaturesPage({ Icon }) {
  const features = [
    { icon: "chart", title: "Manual Score Entry", items: ["Hole-by-hole score and putts (free)", "FIR/GIR with miss direction arrows", "Up & Down tracking", "Approach distance zones", "Club selection per shot", "Penalty strokes & bunkers", "Basic and Advanced scoring modes"] },
    { icon: "camera", title: "OCR Scorecard Import", items: ["Photograph any printed scorecard", "Auto-extracts course layout, yardages, pars", "Auto-detects tee boxes and course details", "Player score extraction (Premium)", "Editable review screen before save", "Course saved to shared catalog"] },
    { icon: "brain", title: "Performance Insights", items: ["Player-rating-tiered analysis (LOW/MID/HIGH)", "Miss direction pattern detection", "Bogey train / momentum analysis", "Scramble quality breakdown", "Approach distance zone efficiency", "Practice plan generation", "Three-putt rate tracking"] },
    { icon: "target", title: "GolfSum Player Rating", items: ["Proprietary score-vs-par performance metric", "Par+2 adjusted gross scoring", "9-hole round pairing support", "Incomplete round handling rules", "Early-rating table for < 20 rounds", "Best-of-recent-round selection logic", "Round Rating tracking"] },
    { icon: "flag", title: "Round Detail & History", items: ["Score color-coded scorecard", "Scoring distribution visualization", "Personal best detection", "Round comparison tools", "Round rating & notes", "Weather conditions integration", "Front 9 vs Back 9 splits"] },
  ];
  return (
    <section style={{ padding: "80px 24px", maxWidth: 900, margin: "0 auto" }}>
      <div className="fade-up" style={{ borderRadius: 16, overflow: "hidden", marginBottom: 48, position: "relative", height: 200 }}>
        <img src={PHOTOS.panoramic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.6)" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <h1 className="serif" style={{ fontSize: 42, fontWeight: 400, textShadow: "0 2px 16px rgba(0,0,0,0.6)" }}>Features</h1>
          <p style={{ color: "#C8D0DC", fontSize: 17 }}>Everything under the hood</p>
        </div>
      </div>
      {features.map((f, i) => (
        <div key={i} className={`card fade-up stagger-${(i % 3) + 1}`} style={{ marginBottom: 20, display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: C.brandDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
            <Icon name={f.icon} size={22} color={C.brand} />
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{f.title}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "6px 24px" }}>
              {f.items.map((item, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: C.textMuted }}>
                  <Icon name="check" size={14} color={C.brand} /> {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

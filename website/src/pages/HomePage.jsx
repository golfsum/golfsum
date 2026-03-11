import { C, GALLERY, PHOTOS } from "../site/constants";

export default function HomePage({ nav, Icon }) {
  return (
    <div>
      <section style={{ position: "relative", overflow: "hidden", minHeight: 540 }}>
        <div style={{
          position: "absolute", inset: 0, backgroundImage: `url(${PHOTOS.hero})`,
          backgroundSize: "cover", backgroundPosition: "center 40%",
          animation: "kenburns 20s ease-in-out infinite alternate",
        }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(11,15,19,0.55) 0%, rgba(11,15,19,0.75) 60%, rgba(11,15,19,0.95) 100%)" }} />
        <div className="fade-up" style={{ position: "relative", zIndex: 1, maxWidth: 700, margin: "0 auto", textAlign: "center", padding: "120px 24px 100px" }}>
          <div className="badge badge-green" style={{ marginBottom: 20 }}>Now in Beta · iOS & Android</div>
          <h1 className="serif" style={{ fontSize: "clamp(36px, 5.5vw, 64px)", fontWeight: 400, lineHeight: 1.1, marginBottom: 20, letterSpacing: "-0.02em", textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}>
            Capture &bull; Analyze &bull; <span style={{ color: C.brand }}>Improve</span>
          </h1>
          <p style={{ fontSize: 18, color: "#C8D0DC", maxWidth: 500, margin: "0 auto 36px", lineHeight: 1.7, textShadow: "0 1px 8px rgba(0,0,0,0.4)" }}>
            GolfSum turns your scorecards into coaching insights. Snap a photo of any scorecard or track your round live with GPS yardages. No extra hardware. No swing cameras. Just real coaching from the rounds you already play.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" style={{ fontSize: 16, padding: "14px 32px" }} onClick={() => nav("pricing")}>
              Get Started <Icon name="arrow" size={18} color="#fff" />
            </button>
            <button className="btn btn-secondary" onClick={() => nav("features")}>See Features</button>
          </div>
        </div>
      </section>

      <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "32px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, textAlign: "center" }}>
          {[["$6.99/mo", "or $69.99/yr (save 17%)"], ["0", "Hardware Required"], ["GSR", "Player Rating"]].map(([val, label], i) => (
            <div key={i} className={`fade-up stagger-${i + 1}`}>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.text }}>{val}</div>
              <div style={{ fontSize: 13, color: C.textMuted }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "80px 24px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 className="serif fade-up" style={{ fontSize: 36, fontWeight: 400, textAlign: "center", marginBottom: 48 }}>
          Everything you need to <span style={{ fontStyle: "italic", color: C.brand }}>lower your scores</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          {[
            { icon: "chart", title: "Deep Stat Tracking", desc: "FIR, GIR, scrambling, putts, approach distances, penalties, all from manual entry or OCR scorecard import.", photo: PHOTOS.bunkers },
            { icon: "camera", title: "OCR Scorecard Import", desc: "Photograph old scorecards. Automatic extraction pulls course details, yardages, pars, and your scores.", photo: PHOTOS.uphill },
            { icon: "brain", title: "Performance Insights", desc: "Personalized tips calibrated to your player-rating tier. Not generic, based on your patterns across rounds.", photo: PHOTOS.panoramic },
            { icon: "target", title: "GolfSum Player Rating", desc: "Proprietary player rating based on your adjusted score vs par, with early-rating handling and stable long-term tracking.", photo: PHOTOS.overcast },
            { icon: "chart", title: "Scoring Trends", desc: "Track how your game evolves. Front 9 vs Back 9, par type breakdowns, weather impact splits.", photo: PHOTOS.foggy },
            { icon: "download", title: "Data Export", desc: "Export your stats as CSV or share formatted round summaries. Your data is yours.", photo: PHOTOS.hmb2 },
          ].map((f, i) => (
            <div key={i} className={`card fade-up stagger-${(i % 3) + 1}`} style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ height: 140, backgroundImage: `url(${f.photo})`, backgroundSize: "cover", backgroundPosition: "center", position: "relative" }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 30%, rgba(17,24,32,0.95) 100%)" }} />
              </div>
              <div style={{ padding: "16px 20px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: C.brandDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={f.icon} size={16} color={C.brand} />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 600 }}>{f.title}</h3>
                </div>
                <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "0 24px 60px", maxWidth: 1100, margin: "0 auto" }}>
        <h2 className="serif fade-up" style={{ fontSize: 28, fontWeight: 400, textAlign: "center", marginBottom: 8 }}>
          From the <span style={{ fontStyle: "italic" }}>courses we love</span>
        </h2>
        <p className="fade-up stagger-1" style={{ textAlign: "center", color: C.textDim, marginBottom: 32, fontSize: 14 }}>Shot on location by the GolfSum team</p>
        <div className="photo-grid fade-up stagger-2">
          {GALLERY.map((p, i) => (
            <div key={i} className={p.span === "wide" ? "wide" : ""}>
              <img src={p.src} alt={p.alt} loading="lazy" />
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: "60px 24px 100px", textAlign: "center" }}>
        <div className="fade-up" style={{
          maxWidth: 700, margin: "0 auto", borderRadius: 20, overflow: "hidden", position: "relative",
        }}>
          <div style={{
            position: "absolute", inset: 0, backgroundImage: `url(${PHOTOS.hmb})`,
            backgroundSize: "cover", backgroundPosition: "center",
          }} />
          <div style={{ position: "absolute", inset: 0, background: "rgba(11,15,19,0.8)", backdropFilter: "blur(2px)" }} />
          <div style={{ position: "relative", padding: "56px 32px" }}>
            <h2 className="serif" style={{ fontSize: 30, fontWeight: 400, marginBottom: 12 }}>Ready to play smarter?</h2>
            <p style={{ color: C.textMuted, marginBottom: 28 }}>Start with 3 rounds. Let the data show you where to improve.</p>
            <button className="btn btn-primary" style={{ fontSize: 16, padding: "14px 32px" }} onClick={() => nav("pricing")}>
              Start Free Rounds <Icon name="arrow" size={18} color="#fff" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

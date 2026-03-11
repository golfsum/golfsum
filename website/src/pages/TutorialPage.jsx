import { useState, useEffect, useCallback, useMemo } from "react";
import { C } from "../site/constants";

function TutorialPage() {
  const TUTORIAL_IMAGE_BASE = "/images/tutorial";
  const [lightbox, setLightbox] = useState({ open: false, src: "", file: "" });

  const landscapeFiles = useMemo(() => new Set([
    "01-profile-personal-info.jpg",
    "02-scoring-mode-toggle.jpg",
    "04-marking-symbols.jpg",
    "22-game-plan-card.jpg",
    "25-handicap-card.jpg",
    "26-data-export.jpg",
  ]), []);

  const openLightbox = useCallback((file) => {
    setLightbox({ open: true, src: `${TUTORIAL_IMAGE_BASE}/${file}`, file });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightbox((prev) => ({ ...prev, open: false }));
    setTimeout(() => {
      setLightbox((prev) => (prev.open ? prev : { open: false, src: "", file: "" }));
    }, 200);
  }, []);

  const renderShotGrid = useCallback((files, { single = false } = {}) => (
    <div className={`ts-shot-grid ${single ? "single" : ""}`}>
      {files.map((file) => (
        <div className="ts-shot" key={file}>
          <button className="ts-shot-trigger" type="button" onClick={() => openLightbox(file)}>
            <img
              className={`ts-shot-img ${landscapeFiles.has(file) ? "landscape" : ""}`}
              src={`${TUTORIAL_IMAGE_BASE}/${file}`}
              alt={file}
              loading="lazy"
            />
          </button>
          <div className="ts-shot-caption">
            <div className="ts-shot-title">Screenshot</div>
            <div className="ts-shot-file">{file}</div>
          </div>
        </div>
      ))}
    </div>
  ), [landscapeFiles, openLightbox]);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll(".ts-section"));
    const navItems = Array.from(document.querySelectorAll(".ts-nav-item[data-section]"));
    if (!sections.length || !navItems.length) return () => {};

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.getAttribute("id");
          navItems.forEach((item) => item.classList.remove("active"));
          const active = navItems.find((item) => item.getAttribute("data-section") === id);
          if (active) active.classList.add("active");
        });
      },
      { threshold: 0.2, rootMargin: "-20% 0px -70% 0px" }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!lightbox.open) return () => {};
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeLightbox();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [lightbox.open, closeLightbox]);

  return (
    <div className="ts-page">
      <style>{`
        .ts-page{display:flex;min-height:100vh}
        .ts-sidebar{width:256px;position:sticky;top:64px;height:calc(100vh - 64px);overflow-y:auto;background:#0E1318;border-right:1px solid ${C.border};padding:24px 0 48px;flex-shrink:0}
        .ts-sidebar-logo{padding:0 24px 20px;border-bottom:1px solid ${C.border};margin-bottom:14px}
        .ts-sidebar-logo .wordmark{font-family:'Instrument Serif', Georgia, serif;font-size:22px;letter-spacing:.04em;color:${C.brand}}
        .ts-sidebar-logo .sub{font-size:11px;color:${C.textDim};text-transform:uppercase;letter-spacing:.12em;margin-top:2px}
        .ts-nav-section-label{font-size:10px;text-transform:uppercase;letter-spacing:.14em;color:${C.textDim};padding:14px 24px 6px;font-weight:600}
        .ts-nav-item{display:block;padding:7px 24px;font-size:13.5px;color:${C.textMuted};text-decoration:none;border-left:2px solid transparent;line-height:1.4;transition:color .15s,background .15s,border-color .15s}
        .ts-nav-item:hover{color:${C.text};background:rgba(255,255,255,.03)}
        .ts-nav-item.active{color:${C.brand};border-left-color:${C.brand};background:rgba(16,185,129,.08)}
        .ts-main{flex:1;padding:56px 48px 96px;max-width:960px}
        .ts-page-header{margin-bottom:56px;padding-bottom:34px;border-bottom:1px solid #21262d}
        .ts-page-header .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:${C.brand};font-weight:600;margin-bottom:12px}
        .ts-page-header h1{font-family:'Instrument Serif', Georgia, serif;font-size:44px;line-height:1.15;margin-bottom:14px}
        .ts-page-header .lead{font-size:17px;color:${C.textMuted};line-height:1.6;max-width:620px}
        .ts-section{margin-bottom:72px;scroll-margin-top:92px}
        .ts-section-header{display:flex;align-items:center;gap:14px;margin-bottom:24px;padding-bottom:14px;border-bottom:1px solid #21262d}
        .ts-section-num{width:32px;height:32px;border-radius:8px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);color:${C.brand};font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .ts-section-header h2{font-family:'Instrument Serif', Georgia, serif;font-size:28px}
        .ts-main h3{font-size:13px;font-weight:600;color:${C.text};margin:28px 0 10px;text-transform:uppercase;letter-spacing:.08em}
        .ts-main p{color:${C.textMuted};margin-bottom:12px;font-size:15px;line-height:1.75}
        .ts-box{background:#0E1318;border:1px solid #21262d;border-radius:12px;overflow:hidden;margin:12px 0 20px}
        .ts-row{display:flex;gap:12px;padding:11px 16px;border-bottom:1px solid #21262d;font-size:14px;color:${C.textMuted}}
        .ts-row:last-child{border-bottom:none}
        .ts-dot{width:6px;height:6px;border-radius:50%;background:${C.brand};margin-top:7px;flex-shrink:0}
        .ts-tip{background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.18);border-radius:10px;padding:12px 16px;margin:14px 0 18px;font-size:14px;color:${C.textMuted}}
        .ts-tip strong{color:${C.text}}
        .ts-shot-grid{display:grid;grid-template-columns:repeat(2, 1fr);gap:16px;margin:20px 0}
        .ts-shot-grid.single{grid-template-columns:minmax(0,340px);justify-content:center}
        .ts-shot{background:#0E1318;border:1px solid #21262d;border-radius:14px;overflow:hidden;transition:border-color .2s,transform .2s}
        .ts-shot:hover{border-color:rgba(16,185,129,.35)}
        .ts-shot-trigger{display:block;cursor:zoom-in;position:relative;background:#080c10;border:0;width:100%;padding:0;text-align:left}
        .ts-shot-trigger::after{content:'';position:absolute;inset:0;background:rgba(16,185,129,0);transition:background .2s}
        .ts-shot-trigger:hover::after{background:rgba(16,185,129,.06)}
        .ts-shot-img{width:100%;height:auto;display:block;max-height:460px;object-fit:contain}
        .ts-shot-img.landscape{max-height:320px}
        .ts-shot-caption{padding:10px 14px 12px;border-top:1px solid #21262d}
        .ts-shot-title{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.12em;color:${C.brand};margin-bottom:3px}
        .ts-shot-file{font-size:11.5px;color:${C.textDim};font-family:'SF Mono','Fira Code',monospace}
        .ts-lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:1000;align-items:center;justify-content:center;padding:20px;cursor:zoom-out}
        .ts-lightbox.open{display:flex;animation:ts-modalFadeIn .2s ease-out}
        @keyframes ts-modalFadeIn{from{opacity:0}to{opacity:1}}
        .ts-lightbox-inner{position:relative;max-width:90vw;max-height:90vh;display:flex;flex-direction:column;cursor:default}
        .ts-lightbox-close{position:absolute;top:-14px;right:-14px;z-index:10;width:36px;height:36px;border-radius:50%;background:${C.border};border:1px solid ${C.borderLight};color:${C.text};cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;line-height:1;transition:background .15s,transform .15s}
        .ts-lightbox-close:hover{background:${C.borderLight};transform:scale(1.1)}
        .ts-lightbox-img{display:block;max-width:90vw;max-height:88vh;object-fit:contain;border-radius:10px;box-shadow:0 24px 80px rgba(0,0,0,.7)}
        .ts-lightbox-file{text-align:center;margin-top:12px;font-size:12px;color:${C.textDim};font-family:monospace}
        .ts-footer{margin-top:80px;padding-top:28px;border-top:1px solid #21262d;text-align:center;color:${C.textMuted};font-size:13px}
        @media (max-width:980px){.ts-page{display:block}.ts-sidebar{position:static;top:auto;width:100%;height:auto;border-right:none;border-bottom:1px solid ${C.border}}.ts-main{padding:32px 20px 64px;max-width:none}}
        @media (max-width:600px){.ts-shot-grid{grid-template-columns:1fr}.ts-shot-grid.single{grid-template-columns:1fr}.ts-page-header h1{font-size:32px}}
      `}</style>

      <div className={`ts-lightbox ${lightbox.open ? "open" : ""}`} onClick={closeLightbox}>
        <div className="ts-lightbox-inner" onClick={(e) => e.stopPropagation()}>
          <button className="ts-lightbox-close" type="button" onClick={closeLightbox} aria-label="Close">&times;</button>
          {lightbox.src ? <img className="ts-lightbox-img" src={lightbox.src} alt={lightbox.file || "Screenshot"} /> : null}
          <div className="ts-lightbox-file">{lightbox.file}</div>
        </div>
      </div>

      <aside className="ts-sidebar">
        <div className="ts-sidebar-logo">
          <div className="wordmark">GOLFSUM</div>
          <div className="sub">Advanced Tutorial</div>
        </div>
        <div className="ts-nav-section-label">Getting Started</div>
        <a className="ts-nav-item active" data-section="setup" href="#setup">1. First-Time Setup</a>
        <a className="ts-nav-item" data-section="playing" href="#playing">2. Playing a Round</a>
        <a className="ts-nav-item" data-section="import" href="#import">3. Importing Scorecards</a>
        <div className="ts-nav-section-label">Analytics</div>
        <a className="ts-nav-item" data-section="history" href="#history">4. History Tab</a>
        <a className="ts-nav-item" data-section="averages" href="#averages">5. Averages Tab</a>
        <a className="ts-nav-item" data-section="insights" href="#insights">6. Insights Tab</a>
        <a className="ts-nav-item" data-section="player-rating" href="#player-rating">7. Player Rating</a>
        <div className="ts-nav-section-label">Account</div>
        <a className="ts-nav-item" data-section="data" href="#data">8. Data & Export</a>
      </aside>

      <main className="ts-main">
        <div className="ts-page-header">
          <div className="eyebrow">Advanced Tutorial</div>
          <h1>Getting the most out of GolfSum.</h1>
          <p className="lead">Every screen covered, from first-time setup through reading your Insights.</p>
        </div>

        <section className="ts-section" id="setup">
          <div className="ts-section-header"><div className="ts-section-num">1</div><h2>First-Time Setup</h2></div>
          <h3>Personal Info</h3>
          <p>Open the <strong>Profile</strong> tab and fill in your name, nickname, and initials. GolfSum uses these when importing scorecards to find your column.</p>
          <h3>Scoring Mode</h3>
          <p><strong>Basic:</strong> score, putts, FIR, GIR. <strong>Advanced:</strong> directional misses, approach distance, clubs, up & down, bunkers, penalties.</p>
          <h3>Stat Tracking + Markings</h3>
          <p>Use Quick Presets and set FIR/GIR marking symbols to match exactly what you write on scorecards.</p>
          <div className="ts-box">
            {["All Stats: everything on", "Shot Tracking: FIR, GIR, approach distance, clubs", "Short Game: up & down, scrambling, bunkers, putts", "Minimal: essentials only"].map((x, i) => (
              <div className="ts-row" key={i}><div className="ts-dot" /><div>{x}</div></div>
            ))}
          </div>
          <h3>Bag Builder + Goals</h3>
          <p>Set your clubs (and optional carry distances) then define targets for player rating, score, FIR, GIR, putts, and up & down.</p>
          {renderShotGrid(["01-profile-personal-info.jpg", "02-scoring-mode-toggle.jpg", "03-stat-tracking-presets.jpg", "04-marking-symbols.jpg", "05-bag-builder.jpg", "06-goals-section.jpg"])}
          <div className="ts-tip"><strong>Tip:</strong> The more complete your setup, the better your import matching and coaching quality.</div>
        </section>

        <section className="ts-section" id="playing">
          <div className="ts-section-header"><div className="ts-section-num">2</div><h2>Playing a Round</h2></div>
          <p>Tap <strong>Play</strong>, select your course/tee, then log each hole. Use Full Scorecard to edit any prior hole.</p>
          <div className="ts-box">
            {["Basic mode: Score, FIR, GIR, Putts", "Advanced mode: directional FIR/GIR, approach distance, clubs, up & down, penalties, bunkers", "Finish Round: mark rating eligibility and save"].map((x, i) => (
              <div className="ts-row" key={i}><div className="ts-dot" /><div>{x}</div></div>
            ))}
          </div>
          {renderShotGrid(["07-course-search.jpg", "08-pre-round-splash.jpg", "09-scoring-basic.jpg", "10-scoring-advanced.jpg", "11-full-scorecard-modal.jpg"])}
          <div className="ts-tip"><strong>Rating handling:</strong> 9-hole and incomplete rounds are handled with GolfSum rating rules.</div>
        </section>

        <section className="ts-section" id="import">
          <div className="ts-section-header"><div className="ts-section-num">3</div><h2>Importing Scorecards</h2></div>
          <p>Go to <strong>Import Scorecard</strong>, capture a clear photo, then review Scores/Stats/Course/Yardages before saving.</p>
          <div className="ts-tip"><strong>Photo quality matters:</strong> keep edges in frame, avoid shadows over score rows, shoot straight-on.</div>
          {renderShotGrid(["12-import-camera.jpg", "13-import-review-scores.jpg", "14-import-review-course.jpg", "15-import-save-bar.jpg"])}
        </section>

        <section className="ts-section" id="history">
          <div className="ts-section-header"><div className="ts-section-num">4</div><h2>History Tab</h2></div>
          <p>Browse, search, and filter all saved rounds. Open any round for scorecard, distribution, round insights, and personal bests.</p>
          <p>Use <strong>Compare</strong> to analyze rounds side-by-side.</p>
          {renderShotGrid(["16-history-list.jpg", "17-round-detail.jpg"])}
        </section>

        <section className="ts-section" id="averages">
          <div className="ts-section-header"><div className="ts-section-num">5</div><h2>Averages Tab</h2></div>
          <p>Three sub-tabs: <strong>Overview</strong>, <strong>Ball Striking</strong>, <strong>By Par</strong>.</p>
          <p>Track FIR/GIR/putts/trends with confidence levels (Reliable/Developing/Early) and split views (front vs back, weather where available).</p>
          {renderShotGrid(["18-averages-overview.jpg", "19-averages-ball-striking.jpg", "20-averages-by-par.jpg"])}
        </section>

        <section className="ts-section" id="insights">
          <div className="ts-section-header"><div className="ts-section-num">6</div><h2>Insights Tab</h2></div>
          <p><strong>Focus</strong> gives highest-priority coaching. <strong>Patterns</strong> surfaces recurring miss/penalty/putting behaviors. <strong>Trends</strong> shows movement over recent rounds.</p>
          <p><strong>Practice Plan</strong> is available in Insights and gives a prioritized set of practice focuses based on your round data.</p>
          <p>Use thumbs up/down and dismiss actions to tune relevance over time.</p>
          {renderShotGrid(["21-insights-focus.jpg", "22-game-plan-card.jpg", "23-insights-patterns.jpg", "24-practice-plan.jpg"])}
        </section>

        <section className="ts-section" id="player-rating">
          <div className="ts-section-header"><div className="ts-section-num">7</div><h2>Player Rating</h2></div>
          <p>GolfSum calculates Round Rating and Player Rating using adjusted score versus par.</p>
          <div className="ts-box">
            {["Round Rating = Adjusted Gross Score - Course Par", "Uses rated rounds with early-rating and best-of-recent selection rules", "Unrated rounds are excluded and clearly marked"].map((x, i) => (
              <div className="ts-row" key={i}><div className="ts-dot" /><div>{x}</div></div>
            ))}
          </div>
          {renderShotGrid(["25-handicap-card.jpg"], { single: true })}
        </section>

        <section className="ts-section" id="data">
          <div className="ts-section-header"><div className="ts-section-num">8</div><h2>Data & Export</h2></div>
          <p>Use <strong>Profile → Export Data</strong> for CSV, Excel, or JSON, and <strong>Backup & Sync</strong> to force a manual sync or check status.</p>
          <p><strong>Best practice:</strong> import old scorecards early so your baseline insights become useful faster.</p>
          {renderShotGrid(["26-data-export.jpg"], { single: true })}
        </section>

        <div className="ts-footer">
          Questions? Email <a href="mailto:support@golfsum.com">support@golfsum.com</a><br /><br />
          © 2026 GolfSum. All rights reserved.
        </div>
      </main>
    </div>
  );
}

export default TutorialPage;

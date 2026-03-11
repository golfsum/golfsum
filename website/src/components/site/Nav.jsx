import { C } from "../../site/constants";

export default function Nav({ page, nav, user, isAdmin, onLogout, Icon }) {
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(11,15,19,0.85)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <button onClick={() => nav("home")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(8,12,16,0.85)", border: `1px solid ${C.border}` }}>
            <img src="/images/golfsum-logo.png" alt="GolfSum" style={{ height: 42, width: "auto", display: "block" }} />
          </div>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {["features", "pricing", "tutorial"].map((p) => (
            <button key={p} onClick={() => nav(p)} className="btn-ghost" style={{ color: page === p ? C.text : C.textMuted, fontWeight: page === p ? 600 : 400, textTransform: "capitalize" }}>{p}</button>
          ))}
          {user ? (
            <>
              <button onClick={() => nav("dashboard")} className="btn-ghost" style={{ color: page === "dashboard" ? C.text : C.textMuted, fontWeight: page === "dashboard" ? 600 : 400 }}>Dashboard</button>
              {isAdmin && <button onClick={() => nav("admin")} className="btn-ghost" style={{ color: page === "admin" ? C.amber : C.textMuted }}>Admin</button>}
              <button onClick={onLogout} className="btn-ghost" title="Log out"><Icon name="logout" size={18} /></button>
            </>
          ) : (
            <button onClick={() => nav("login")} className="btn btn-primary btn-sm" style={{ marginLeft: 8 }}>Sign In</button>
          )}
        </div>
      </div>
    </nav>
  );
}

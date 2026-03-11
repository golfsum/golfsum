import { C } from "../site/constants";

export default function PrivacyPage() {
  return (
    <section style={{ padding: "80px 24px", maxWidth: 740, margin: "0 auto" }}>
      <h1 className="serif fade-up" style={{ fontSize: 36, marginBottom: 8 }}>Privacy Policy</h1>
      <p className="fade-up stagger-1" style={{ color: C.textDim, marginBottom: 40, fontSize: 14 }}>Last updated: February 2026</p>
      {[
        { t: "1. Information We Collect", b: "We collect the information you provide when creating an account (email address) and the golf data you enter or import (scores, stats, course details). We also collect basic device and usage analytics to improve the app. We do not sell your personal data to third parties." },
        { t: "2. How We Use Your Data", b: "Your golf data is used to calculate your GolfSum Player Rating, generate coaching insights, and display your statistics. Account data is used for authentication and cloud sync. Anonymous, aggregated data may be used to improve our OCR accuracy and course catalog." },
        { t: "3. Data Storage & Security", b: "Your data is stored in Google Firebase (Firestore) with encryption at rest and in transit. Authentication is handled via Firebase Auth. We implement role-based access controls so users can only access their own data. Course catalog data contributed via OCR is shared across all users to improve the community database." },
        { t: "4. Third-Party Services", b: "We use Firebase (Google Cloud) for authentication, data storage, and hosting. We use Azure Document Intelligence for OCR processing. These services have their own privacy policies. We do not share your personal data with advertisers." },
        { t: "5. Your Rights", b: "You can export all your data at any time via the Data Export feature in the app. You can delete your account and all associated data by contacting support. We will respond to data deletion requests within 30 days." },
        { t: "6. Cookies & Tracking", b: "Our website uses essential cookies for authentication sessions. We do not use third-party advertising cookies or tracking pixels." },
        { t: "7. Children's Privacy", b: "GolfSum is not directed to children under 13. We do not knowingly collect data from children under 13. If you believe a child has provided us personal data, contact us and we will delete it." },
        { t: "8. Changes to This Policy", b: "We may update this policy from time to time. We will notify you of material changes via the app or email. Continued use after changes constitutes acceptance." },
        { t: "9. Contact", b: "For privacy questions or data requests, contact us at privacy@golfsum.com." },
      ].map((s, i) => (
        <div key={i} className={`fade-up stagger-${(i % 3) + 1}`} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: C.text }}>{s.t}</h2>
          <p style={{ fontSize: 15, color: C.textMuted, lineHeight: 1.7 }}>{s.b}</p>
        </div>
      ))}
    </section>
  );
}

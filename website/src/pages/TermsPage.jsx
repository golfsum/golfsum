import { C } from "../site/constants";

export default function TermsPage() {
  return (
    <section style={{ padding: "80px 24px", maxWidth: 740, margin: "0 auto" }}>
      <h1 className="serif fade-up" style={{ fontSize: 36, marginBottom: 8 }}>Terms of Service</h1>
      <p className="fade-up stagger-1" style={{ color: C.textDim, marginBottom: 40, fontSize: 14 }}>Last updated: February 2026</p>
      {[
        { t: "1. Acceptance of Terms", b: "By downloading, installing, or using GolfSum, you agree to these Terms of Service. If you do not agree, do not use the app." },
        { t: "2. Description of Service", b: "GolfSum is a golf analytics application that allows you to track scores, analyze statistics, and receive coaching insights. The service is provided on an 'as is' basis." },
        { t: "3. Accounts", b: "You are responsible for maintaining the security of your account credentials. You must provide accurate information when creating an account." },
        { t: "4. Subscriptions & Payments", b: "Premium features require an active subscription ($6.99/month or $69.99/year). Subscriptions are billed through Apple App Store or Google Play Store. Refunds are handled per the respective store's policy. We offer three free premium rounds; after that, you keep access to basic features unless you upgrade." },
        { t: "5. User Data & Content", b: "You retain ownership of all golf data you enter. By using the OCR import feature, you grant us a license to use extracted course data (yardages and pars) in our community course catalog." },
        { t: "6. Player Rating", b: "GolfSum Player Rating is a proprietary performance metric based on your round history. It is independent of the World Handicap System™ and is not a USGA Handicap Index®. It cannot be used as an official handicap for competition purposes." },
        { t: "7. Limitation of Liability", b: "GolfSum is provided 'as is' without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the app. Our total liability is limited to the amount you paid in the prior 12 months." },
        { t: "8. Termination", b: "We may terminate or suspend your account for violation of these terms. You may cancel your subscription and delete your account at any time." },
        { t: "9. Changes to Terms", b: "We may update these terms from time to time. Material changes will be communicated via the app. Continued use constitutes acceptance." },
        { t: "10. Contact", b: "For questions about these terms, contact us at support@golfsum.com." },
      ].map((s, i) => (
        <div key={i} className={`fade-up stagger-${(i % 3) + 1}`} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: C.text }}>{s.t}</h2>
          <p style={{ fontSize: 15, color: C.textMuted, lineHeight: 1.7 }}>{s.b}</p>
        </div>
      ))}
    </section>
  );
}

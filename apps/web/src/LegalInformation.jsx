import React from "react";

const sections = [
  {
    title: "1. About AssetChain",
    paragraphs: [
      "AssetChain is currently a demonstration platform for creating digital asset records, organising inspections, reviewing supporting evidence and examining available verification records.",
      "The platform is a prototype. Features, availability, data sources and workflows may change as development continues."
    ]
  },
  {
    title: "2. Information we handle",
    paragraphs: [
      "Depending on the features you use, information may include account details such as your name and email address; organisation and membership details; asset descriptions and locations; inspection applications and reports; and documents you choose to submit.",
      "Authentication is provided through Supabase. Organisation documents may be stored and processed using Supabase services. Do not upload information that you are not authorised to share.",
      "Only provide information that is reasonably necessary for the feature you are using. Avoid placing passwords, payment-card details, identity secrets or unnecessary sensitive personal information in asset descriptions, reports or uploaded documents."
    ]
  },
  {
    title: "3. How information is used",
    paragraphs: [
      "Information is used to create and manage accounts, provide asset and organisation workflows, support inspection and verification features, protect platform operations, and troubleshoot or improve the service.",
      "Access to organisation information and uploaded documents should be limited to authorised users and legitimate platform functions. Do not assume that every record is private merely because it appears inside a workspace."
    ]
  },
  {
    title: "4. Blockchain records and evidence",
    paragraphs: [
      "Some critical records or evidence fingerprints may be anchored to a public blockchain. Blockchain transactions and related metadata can be publicly visible, persistent and difficult or impossible to remove.",
      "A blockchain fingerprint can help identify whether data matches a recorded fingerprint. It does not independently prove legal ownership, document authenticity, physical condition or the truth of a claim.",
      "Do not submit personal or confidential information for blockchain anchoring unless you understand the public and persistent nature of the resulting record."
    ]
  },
  {
    title: "5. Browser storage and cookies",
    paragraphs: [
      "AssetChain uses authentication functionality that may rely on essential browser storage to maintain account sessions and support sign-in and account recovery.",
      "The reviewed frontend does not establish a need for advertising or analytics cookies. This notice is not a claim that every browser, hosting provider or integrated service uses no cookies or similar technologies. Optional tracking should not be introduced without an appropriate review and consent mechanism where required."
    ]
  },
  {
    title: "6. Service providers and data sharing",
    paragraphs: [
      "AssetChain relies on third-party infrastructure, including Supabase for authentication and related data services, and blockchain network infrastructure for supported blockchain operations.",
      "Information may be processed by these providers to deliver the features you request. AssetChain does not represent that information is never processed outside your country. Provider terms, security practices and applicable transfer requirements should be reviewed before public launch.",
      "We do not describe user information as being sold or shared for advertising. Any additional integrations must be assessed and disclosed before they are introduced."
    ]
  },
  {
    title: "7. Retention and account requests",
    paragraphs: [
      "Information should be retained only for legitimate operational, security, dispute-resolution and legal purposes. Actual retention periods depend on the records, service configuration and applicable requirements.",
      "The current interface does not provide a verified self-service account deletion workflow. Do not assume that signing out deletes your account or removes previously submitted records.",
      "A monitored privacy and support contact must be configured and published before public launch so users can submit access, correction or deletion requests. Requests may be subject to legal obligations, security checks, blockchain immutability and legitimate record-retention requirements."
    ]
  },
  {
    title: "8. Security and availability",
    paragraphs: [
      "Reasonable technical and organisational safeguards should be used to protect accounts, documents and platform records. No internet service or storage system can be guaranteed to be completely secure or continuously available.",
      "Use a unique password, protect your email account and sign out on shared devices. Report suspected unauthorised access through the official support channel once it has been configured."
    ]
  },
  {
    title: "9. Your responsibilities",
    paragraphs: [
      "You are responsible for ensuring that information and documents you submit are accurate to the best of your knowledge and that you have permission to submit them.",
      "Do not impersonate another person or organisation, upload unlawful material, misuse inspection workflows, interfere with platform security or rely on a demonstration record as a substitute for independent due diligence."
    ]
  },
  {
    title: "10. Platform terms and limitations",
    paragraphs: [
      "AssetChain records and verification tools are informational. Registration does not establish legal ownership or title. A matching passport or evidence fingerprint is not a guarantee that an asset exists, that a document is genuine or that a seller has authority to sell.",
      "Inspection results, simulated readings and demonstration data must be interpreted according to their labels and stated limitations. Users should independently verify important claims before making decisions.",
      "The platform is provided as a demonstration service and may be changed, suspended or unavailable during development. Do not rely on it as the sole recordkeeping system for critical legal or financial obligations."
    ]
  },
  {
    title: "11. Marketplace, payments and refunds",
    paragraphs: [
      "Marketplace offers are currently recorded for discussion only. AssetChain does not currently process payments, provide escrow, transfer legal ownership or guarantee buyer protection.",
      "No purchase payment or refund transaction is currently offered through this marketplace. If paid services are introduced, pricing, payment terms, cancellation rights and an applicable refund policy must be published before users are charged."
    ]
  },
  {
    title: "12. Changes and contact",
    paragraphs: [
      "This notice may be updated as AssetChain develops. Material changes should be reflected on this page with an updated effective date.",
      "Privacy contact: to be configured before public launch. The platform operator must publish a monitored contact address and confirm its legal identity before relying on this notice as a final public legal document."
    ]
  }
];

export default function LegalInformation() {
  return (
    <section className="legal-page">
      <div className="hero">
        <div>
          <span className="eyebrow light">TRANSPARENCY & ACCOUNTABILITY</span>
          <h2>Your information. Clear responsibilities.</h2>
          <p>Understand how AssetChain handles information, evidence, account access and marketplace activity.</p>
        </div>
        <div className="hero-symbol" aria-hidden="true">A</div>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <span className="status-pill">DEVELOPMENT NOTICE</span>
        <h3>Privacy notice and platform terms</h3>
        <p className="muted">
          This is a development-stage notice for the AssetChain prototype, not a substitute
          for legal advice or a completed legal review. The operator identity and monitored
          privacy contact must be finalised before public launch.
        </p>
        <p className="muted"><strong>Last updated:</strong> 14 November 2026</p>
      </div>

      {sections.map((section) => (
        <article className="panel" key={section.title} style={{ marginBottom: 14 }}>
          <h3>{section.title}</h3>
          {section.paragraphs.map((paragraph, index) => (
            <p className="muted" key={index}>{paragraph}</p>
          ))}
        </article>
      ))}

      <div className="panel">
        <h3>Before public launch</h3>
        <ul>
          <li>Confirm the legal identity and jurisdiction of the platform operator.</li>
          <li>Publish a monitored privacy and support email address.</li>
          <li>Review Supabase storage, access controls, retention and account-deletion procedures.</li>
          <li>Have the privacy notice and terms reviewed for applicable Nigerian and other relevant laws.</li>
          <li>Publish payment, cancellation and refund terms before introducing paid services.</li>
        </ul>
      </div>
    </section>
  );
}

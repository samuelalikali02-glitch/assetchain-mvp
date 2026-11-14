import React, { useEffect, useState } from "react";

export default function OrganisationVerificationHistory({ orgs = [], apiBase, token }) {
  const [history, setHistory] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let active = true;

    async function load() {
      for (const item of orgs) {
        const org = item.organisation;
        if (!org?.id) continue;

        try {
          const response = await fetch(
            `${apiBase}/organisations/${org.id}/verification-history`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Could not load review history.");

          if (active) {
            setHistory(previous => ({
              ...previous,
              [org.id]: data.history || []
            }));
          }
        } catch (error) {
          if (active) {
            setErrors(previous => ({ ...previous, [org.id]: error.message }));
          }
        }
      }
    }

    if (token) load();
    return () => { active = false; };
  }, [orgs, apiBase, token]);

  if (!orgs.length) return null;

  return (
    <section className="panel">
      <span className="eyebrow">REVIEW RECORDS</span>
      <h3>Verification history</h3>
      <p className="muted">A record of verification decisions made by the platform.</p>

      {orgs.map(item => {
        const org = item.organisation;
        if (!org?.id) return null;
        const entries = history[org.id] || [];

        return (
          <div className="report" key={org.id}>
            <h4>{org.display_name || org.legal_name}</h4>
            {errors[org.id] && <p role="alert">{errors[org.id]}</p>}
            {!errors[org.id] && entries.length === 0 && (
              <p className="muted">No review decisions recorded yet.</p>
            )}
            {entries.map(entry => (
              <div className="report" key={entry.id}>
                <strong>
                  {String(entry.new_status || "").replaceAll("_", " ").toUpperCase()}
                </strong>
                <p className="muted">
                  {entry.previous_status
                    ? `Previous status: ${entry.previous_status.replaceAll("_", " ")}`
                    : "Initial review"}
                </p>
                {entry.review_note && <p>{entry.review_note}</p>}
                <small>
                  {new Date(entry.created_at).toLocaleString()}
                </small>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

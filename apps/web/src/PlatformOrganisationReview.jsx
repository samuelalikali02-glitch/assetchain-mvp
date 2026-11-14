import React, { useCallback, useEffect, useState } from "react";

export default function PlatformOrganisationReview({ apiBase, token, onNotice }) {
  const [organisations, setOrganisations] = useState([]);
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState({});
  const [error, setError] = useState("");

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }, [apiBase, token]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError("");
      const data = await request("/platform/organisations");
      setOrganisations(data.organisations || []);
    } catch (err) {
      setError(err.message);
    }
  }, [request, token]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(org, status) {
    const note = (notes[org.id] || "").trim();

    if (["rejected", "needs_information"].includes(status) && !note) {
      setError("Add a review note before rejecting or requesting more information.");
      return;
    }

    setBusy(previous => ({ ...previous, [org.id]: true }));
    setError("");

    try {
      await request(`/platform/organisations/${org.id}/verification`, {
        method: "PATCH",
        body: JSON.stringify({
          verification_status: status,
          note
        })
      });

      setNotes(previous => ({ ...previous, [org.id]: "" }));
      await load();
      onNotice?.(`Organisation status updated to ${status.replaceAll("_", " ")}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(previous => ({ ...previous, [org.id]: false }));
    }
  }

  if (!token) return null;

  return (
    <section className="panel">
      <span className="eyebrow">PLATFORM ADMINISTRATION</span>
      <h3>Organisation verification queue</h3>
      <p className="muted">
        Review submitted organisation details and supporting documents before making a decision.
      </p>

      {error && <p className="caution" role="alert">{error}</p>}

      <button type="button" className="secondary" onClick={load}>
        Refresh queue
      </button>

      {organisations.length === 0 && !error && (
        <p className="muted">No organisations are currently available for review.</p>
      )}

      {organisations.map(org => (
        <article className="report" key={org.id}>
          <h4>{org.display_name || org.legal_name}</h4>
          <p><strong>Legal name:</strong> {org.legal_name}</p>
          <p><strong>Type:</strong> {org.organisation_type || "Not provided"}</p>
          <p><strong>Country:</strong> {org.country || "Not provided"}</p>
          <p><strong>Registration number:</strong> {org.registration_number || "Not provided"}</p>
          <p><strong>Contact:</strong> {org.contact_email || "Not provided"}</p>
          <p>
            <strong>Status:</strong>{" "}
            {String(org.verification_status || "pending").replaceAll("_", " ")}
          </p>

          <label>
            Review note
            <textarea
              rows="3"
              maxLength="1000"
              value={notes[org.id] || ""}
              onChange={event => setNotes(previous => ({
                ...previous,
                [org.id]: event.target.value
              }))}
              placeholder="Explain the decision or information required."
            />
          </label>

          <div className="profile-actions">
            <button
              type="button"
              className="primary"
              disabled={!!busy[org.id] || org.verification_status === "verified"}
              onClick={() => decide(org, "verified")}
            >
              Approve
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!!busy[org.id]}
              onClick={() => decide(org, "needs_information")}
            >
              Request information
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!!busy[org.id] || org.verification_status === "rejected"}
              onClick={() => decide(org, "rejected")}
            >
              Reject
            </button>
          </div>

          {busy[org.id] && <p className="muted">Saving decision...</p>}
        </article>
      ))}
    </section>
  );
}

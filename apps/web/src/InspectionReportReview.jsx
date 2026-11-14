import React, { useCallback, useEffect, useState } from "react";

export default function InspectionReportReview({ apiFetch, apiBase, setNotice }) {
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch(`${apiBase}/platform/inspections`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load inspection assignments.");
      }

      const assignments = Array.isArray(data) ? data : data.assignments || [];
      const submitted = assignments.filter(item => item.status === "submitted");

      const results = await Promise.all(
        submitted.map(async assignment => {
          const reportResponse = await apiFetch(
            `${apiBase}/platform/inspections/${assignment.id}/reports`
          );
          const reportData = await reportResponse.json();

          if (!reportResponse.ok) {
            throw new Error(reportData.error || "Could not load an inspection report.");
          }

          const history = Array.isArray(reportData)
            ? reportData
            : reportData.reports || [];

          const latest = [...history].sort(
            (a, b) => Number(b.version || 0) - Number(a.version || 0)
          )[0];

          return latest ? { assignment, report: latest } : null;
        })
      );

      setItems(results.filter(Boolean));
    } catch (err) {
      setError(err.message || "Could not load report review queue.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, apiBase]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function reviewReport(reportId, decision) {
    const reviewNotes = (notes[reportId] || "").trim();

    if (
      ["rejected", "revision_required"].includes(decision) &&
      !reviewNotes
    ) {
      setError("Add review notes when rejecting a report or requesting a revision.");
      return;
    }

    const labels = {
      approved: "approve this report",
      rejected: "reject this report",
      revision_required: "request a revision"
    };

    if (!window.confirm(`Are you sure you want to ${labels[decision]}?`)) {
      return;
    }

    setBusyId(reportId);
    setError("");

    try {
      const response = await apiFetch(
        `${apiBase}/platform/inspection-reports/${reportId}/reviews`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, reviewNotes })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save report review.");
      }

      setNotice?.(
        decision === "revision_required"
          ? "Revision requested. The inspector can update and resubmit the report."
          : `Inspection report ${decision}.`
      );

      setNotes(current => {
        const next = { ...current };
        delete next[reportId];
        return next;
      });

      await loadReports();
    } catch (err) {
      setError(err.message || "Could not complete report review.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="panel">
      <div className="sectionhead">
        <div>
          <span className="eyebrow">INSPECTION QUALITY CONTROL</span>
          <h3>Inspection report review</h3>
          <p className="muted">
            Review submitted findings before accepting inspection results.
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={loadReports}
          disabled={loading || Boolean(busyId)}
        >
          Refresh reports
        </button>
      </div>

      {error && <p role="alert" className="notice">{error}</p>}
      {loading && <p className="muted">Loading submitted reports...</p>}

      {!loading && items.length === 0 && (
        <p className="muted">There are no submitted inspection reports awaiting review.</p>
      )}

      {items.map(({ assignment, report }) => {
        const busy = busyId === report.id;
        const asset = assignment.asset || {};

        return (
          <article className="report" key={report.id}>
            <div className="sectionhead">
              <div>
                <h4>{asset.name || "Assigned asset"}</h4>
                <p className="muted">
                  {asset.passport_id || "No passport ID"} · Report version {report.version}
                </p>
              </div>
              <strong>Awaiting review</strong>
            </div>

            <p>
              <strong>Condition:</strong>{" "}
              {(report.asset_condition || "").replaceAll("_", " ")}
            </p>

            <p><strong>Inspector findings</strong></p>
            <p>{report.findings}</p>

            {report.recommendations && (
              <p><strong>Recommendations:</strong> {report.recommendations}</p>
            )}

            {report.inspection_notes && (
              <p><strong>Inspection notes:</strong> {report.inspection_notes}</p>
            )}

            <p className="muted">
              Submitted: {report.submitted_at
                ? new Date(report.submitted_at).toLocaleString()
                : "Date unavailable"}
            </p>

            <p className="muted">
              Report SHA-256: <code>{report.report_hash}</code>
            </p>

            <label>
              Review notes
              <textarea
                rows="3"
                maxLength="5000"
                value={notes[report.id] || ""}
                onChange={event =>
                  setNotes(current => ({
                    ...current,
                    [report.id]: event.target.value
                  }))
                }
                placeholder="Explain your decision or requested corrections..."
              />
            </label>

            <div className="profile-actions">
              <button
                type="button"
                className="primary"
                disabled={busy || Boolean(busyId)}
                onClick={() => reviewReport(report.id, "approved")}
              >
                {busy ? "Saving..." : "Approve report"}
              </button>

              <button
                type="button"
                className="secondary"
                disabled={busy || Boolean(busyId)}
                onClick={() => reviewReport(report.id, "revision_required")}
              >
                Request revision
              </button>

              <button
                type="button"
                className="textbtn"
                disabled={busy || Boolean(busyId)}
                onClick={() => reviewReport(report.id, "rejected")}
              >
                Reject report
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

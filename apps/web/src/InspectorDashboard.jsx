
import React, { useCallback, useEffect, useState } from "react";

export default function InspectorDashboard({ apiFetch, apiBase }) {
  const [assignments, setAssignments] = useState([]);
  const [reports, setReports] = useState({});
  const [forms, setForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch(`${apiBase}/platform/inspections`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load your assignments.");
      }

      const rows = Array.isArray(data) ? data : [];
      setAssignments(rows);

      const reportResults = await Promise.all(
        rows.map(async item => {
          try {
            const result = await apiFetch(
              `${apiBase}/platform/inspections/${item.id}/reports`
            );
            const reportData = await result.json();

            if (!result.ok) return [item.id, []];
            return [item.id, Array.isArray(reportData) ? reportData : []];
          } catch {
            return [item.id, []];
          }
        })
      );

      setReports(Object.fromEntries(reportResults));
    } catch (err) {
      setError(err.message || "Unable to load inspection assignments.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, apiBase]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  function updateForm(assignmentId, field, value) {
    setForms(current => ({
      ...current,
      [assignmentId]: {
        ...(current[assignmentId] || {}),
        [field]: value
      }
    }));
  }

  async function updateStatus(assignment, status) {
    setBusyId(assignment.id);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetch(
        `${apiBase}/platform/inspections/${assignment.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not update inspection.");
      }

      setSuccess("Inspection started successfully.");
      await loadAssignments();
    } catch (err) {
      setError(err.message || "Inspection update failed.");
    } finally {
      setBusyId("");
    }
  }

  async function submitReport(assignment) {
    const form = forms[assignment.id] || {};

    if (!form.assetCondition || !form.findings?.trim()) {
      setError("Select the asset condition and enter your findings.");
      return;
    }

    if (form.findings.trim().length < 10) {
      setError("Please provide more detail in your inspection findings.");
      return;
    }

    setBusyId(assignment.id);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetch(
        `${apiBase}/platform/inspections/${assignment.id}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetCondition: form.assetCondition,
            findings: form.findings.trim(),
            recommendations: form.recommendations || "",
            inspectionNotes: form.inspectionNotes || ""
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not submit inspection report.");
      }

      setForms(current => ({
        ...current,
        [assignment.id]: {
          assetCondition: "",
          findings: "",
          recommendations: "",
          inspectionNotes: ""
        }
      }));

      setSuccess("Your inspection report has been submitted.");
      await loadAssignments();
    } catch (err) {
      setError(err.message || "Report submission failed.");
    } finally {
      setBusyId("");
    }
  }

  const counts = {
    assigned: assignments.filter(x => x.status === "assigned").length,
    in_progress: assignments.filter(x => x.status === "in_progress").length,
    submitted: assignments.filter(x => x.status === "submitted").length,
    reviewed: assignments.filter(x => x.status === "reviewed").length
  };

  return (
    <section>
      <div className="sectionhead">
        <div>
          <span className="eyebrow">INSPECTOR WORKSPACE</span>
          <h3>My inspection assignments</h3>
          <p>Inspect assigned assets, document findings and submit reports for review.</p>
        </div>

        <button
          className="secondary"
          onClick={loadAssignments}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh assignments"}
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <small>ASSIGNED</small>
          <strong>{counts.assigned}</strong>
        </div>
        <div className="stat">
          <small>IN PROGRESS</small>
          <strong>{counts.in_progress}</strong>
        </div>
        <div className="stat">
          <small>SUBMITTED</small>
          <strong>{counts.submitted}</strong>
        </div>
        <div className="stat">
          <small>REVIEWED</small>
          <strong>{counts.reviewed}</strong>
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {success && <div className="notice">{success}</div>}

      {loading ? (
        <div className="panel">Loading your assignments...</div>
      ) : assignments.length === 0 ? (
        <div className="panel empty">
          <h3>No inspection assignments yet</h3>
          <p>Your assigned inspections will appear here when the platform team assigns them.</p>
        </div>
      ) : (
        <div className="columns">
          {assignments.map(item => {
            const form = forms[item.id] || {};
            const history = reports[item.id] || [];
            const busy = busyId === item.id;

            return (
              <article className="panel" key={item.id}>
                <span className="eyebrow">INSPECTION ASSIGNMENT</span>
                <h3>{item.asset?.name || "Assigned asset"}</h3>

                <p className="muted">
                  Passport: {item.asset?.passport_id || "Not supplied"}
                </p>

                <p>
                  <strong>Status:</strong>{" "}
                  {(item.status || "assigned").replaceAll("_", " ")}
                </p>

                {item.asset?.category && <p>Category: {item.asset.category}</p>}
                {item.asset?.location && <p>Location: {item.asset.location}</p>}
                {item.asset?.description && <p>{item.asset.description}</p>}

                <div className="report">
                  <strong>Inspection instructions</strong>
                  <p>{item.instructions || "Follow the standard AssetChain inspection procedure."}</p>

                  <strong>Due date</strong>
                  <p>
                    {item.due_at
                      ? new Date(item.due_at).toLocaleString()
                      : "No deadline specified"}
                  </p>
                </div>

                {item.status === "assigned" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => updateStatus(item, "in_progress")}
                  >
                    {busy ? "Updating..." : "Start inspection"}
                  </button>
                )}

                {item.status === "in_progress" && (
                  <div className="report">
                    <h3>Inspection report</h3>
                    <p className="muted">
                      Record your findings accurately before submitting.
                    </p>

                    <label>Overall asset condition</label>
                    <select
                      value={form.assetCondition || ""}
                      onChange={event =>
                        updateForm(item.id, "assetCondition", event.target.value)
                      }
                    >
                      <option value="">Select condition</option>
                      <option value="excellent">Excellent</option>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="poor">Poor</option>
                      <option value="critical">Critical</option>
                    </select>

                    <label>Inspection findings *</label>
                    <textarea
                      rows="5"
                      maxLength="10000"
                      value={form.findings || ""}
                      onChange={event =>
                        updateForm(item.id, "findings", event.target.value)
                      }
                      placeholder="Describe the asset's observed condition, defects and inspection results..."
                    />

                    <label>Recommendations</label>
                    <textarea
                      rows="3"
                      maxLength="5000"
                      value={form.recommendations || ""}
                      onChange={event =>
                        updateForm(item.id, "recommendations", event.target.value)
                      }
                      placeholder="Recommended maintenance, repairs or follow-up..."
                    />

                    <label>Additional inspection notes</label>
                    <textarea
                      rows="3"
                      maxLength="5000"
                      value={form.inspectionNotes || ""}
                      onChange={event =>
                        updateForm(item.id, "inspectionNotes", event.target.value)
                      }
                      placeholder="Other relevant observations..."
                    />

                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => submitReport(item)}
                    >
                      {busy ? "Submitting report..." : "Submit inspection report"}
                    </button>
                  </div>
                )}

                {item.status === "submitted" && (
                  <p className="muted">
                    Your report has been submitted and is awaiting platform review.
                  </p>
                )}

                {item.status === "reviewed" && (
                  <p className="muted">
                    This inspection assignment has been reviewed.
                  </p>
                )}

                {item.status === "cancelled" && (
                  <p className="muted">
                    This assignment has been cancelled.
                  </p>
                )}

                <div className="report">
                  <strong>Report history ({history.length})</strong>

                  {history.length === 0 ? (
                    <p className="muted">No reports submitted yet.</p>
                  ) : (
                    history.map(report => (
                      <div key={report.id}>
                        <p>
                          <strong>Version {report.version}</strong>
                        </p>
                        <p>
                          Condition: {(report.asset_condition || "").replaceAll("_", " ")}
                        </p>
                        <p>{report.findings}</p>

                        {report.recommendations && (
                          <p>
                            <strong>Recommendations:</strong>{" "}
                            {report.recommendations}
                          </p>
                        )}

                        <small className="muted">
                          Submitted: {new Date(report.submitted_at).toLocaleString()}
                        </small>

                        <p className="muted">
                          Report hash: {report.report_hash}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <small className="muted">
                  Assignment reference: {item.id}
                </small>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

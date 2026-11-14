
import React, { useEffect, useState } from "react";

export default function UserRoleManagement({
  apiFetch,
  apiBase,
  platformUser,
  setNotice
}) {
  const [roles, setRoles] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState("platform_admin");
  const [loading, setLoading] = useState(false);
  const [busyUser, setBusyUser] = useState("");

  const isOwner = platformUser?.platformRole === "platform_owner";
  const isAdmin = ["platform_owner", "platform_admin"].includes(
    platformUser?.platformRole
  );

  async function loadManagementData() {
    setLoading(true);

    try {
      const [rolesResponse, auditResponse] = await Promise.all([
        apiFetch(`${apiBase}/platform/roles`),
        apiFetch(`${apiBase}/platform/audit-logs?limit=30`)
      ]);

      const rolesData = await rolesResponse.json();
      const auditData = await auditResponse.json();

      if (!rolesResponse.ok) {
        throw new Error(rolesData.error || "Could not load platform roles");
      }

      if (!auditResponse.ok) {
        throw new Error(auditData.error || "Could not load audit history");
      }

      setRoles(Array.isArray(rolesData) ? rolesData : []);
      setAuditLogs(Array.isArray(auditData) ? auditData : []);
    } catch (error) {
      setNotice(error.message || "Could not load user management data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) {
      loadManagementData();
    }
  }, [platformUser?.platformRole]);

  async function appointUser(event) {
    event.preventDefault();

    if (!isOwner) return;

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setNotice("Enter the registered email address.");
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch(`${apiBase}/platform/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          role: newRole
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not appoint platform staff");
      }

      setEmail("");
      setNotice(`Platform ${newRole === "platform_admin" ? "administrator" : "inspector"} appointed successfully.`);
      await loadManagementData();
    } catch (error) {
      setNotice(error.message || "Appointment failed.");
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(userId, status) {
    if (!isOwner) return;

    const action = status === "suspended" ? "suspend" : "reactivate";

    if (!window.confirm(`Are you sure you want to ${action} this person's platform access?`)) {
      return;
    }

    setBusyUser(userId);

    try {
      const response = await apiFetch(
        `${apiBase}/platform/roles/${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not update platform access");
      }

      setNotice(`Platform access ${status === "active" ? "reactivated" : "suspended"}.`);
      await loadManagementData();
    } catch (error) {
      setNotice(error.message || "Could not update access.");
    } finally {
      setBusyUser("");
    }
  }

  async function revokeRole(userId) {
    if (!isOwner) return;

    if (!window.confirm(
      "Revoke this person's platform role? They will lose platform staff access."
    )) {
      return;
    }

    setBusyUser(userId);

    try {
      const response = await apiFetch(
        `${apiBase}/platform/roles/${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not revoke platform access");
      }

      setNotice("Platform staff access revoked.");
      await loadManagementData();
    } catch (error) {
      setNotice(error.message || "Could not revoke access.");
    } finally {
      setBusyUser("");
    }
  }

  if (!isAdmin) return null;

  return (
    <>
      <div className="panel">
        <div className="sectionhead">
          <div>
            <span className="eyebrow">PLATFORM ACCESS CONTROL</span>
            <h3>User &amp; Role Management</h3>
            <p className="muted">
              Review platform staff appointments and manage authorised access.
            </p>
          </div>

          <button
            type="button"
            className="secondary"
            disabled={loading}
            onClick={loadManagementData}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {isOwner ? (
          <>
            <h3>Appoint platform personnel</h3>

            <form className="form" onSubmit={appointUser}>
              <label>
                Registered user email
                <input
                  type="email"
                  required
                  maxLength="254"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="Enter the user's registered email"
                />
              </label>

              <label>
                Platform role
                <select
                  value={newRole}
                  onChange={event => setNewRole(event.target.value)}
                >
                  <option value="platform_admin">
                    Platform administrator
                  </option>
                  <option value="platform_inspector">
                    Platform inspector
                  </option>
                </select>
              </label>

              <button
                type="submit"
                className="primary"
                disabled={loading || !email.trim()}
              >
                {loading ? "Processing..." : "Appoint platform personnel"}
              </button>
            </form>

            <p className="muted">
              Only existing, active AssetChain accounts can be appointed.
              Appointments are recorded in the platform audit history.
            </p>
          </>
        ) : (
          <p className="muted">
            You can review platform appointments, but only the platform owner
            can appoint, suspend, reactivate or revoke platform staff.
          </p>
        )}
      </div>

      <div className="panel">
        <span className="eyebrow">CURRENT APPOINTMENTS</span>
        <h3>Platform staff accounts</h3>

        {roles.length === 0 && (
          <p className="muted">
            No platform appointments were returned.
          </p>
        )}

        {roles.map(item => {
          const isProtectedOwner = item.role === "platform_owner";

          return (
            <div className="report" key={item.user_id}>
              <div className="sectionhead">
                <div>
                  <strong>
                    {item.profile?.full_name || "Unnamed account"}
                  </strong>

                  <p className="muted">
                    User ID: {item.user_id}
                  </p>

                  <p>
                    Role:{" "}
                    <strong>
                      {item.role?.replaceAll("_", " ")}
                    </strong>
                  </p>

                  <p>
                    Status:{" "}
                    <strong>
                      {item.status}
                    </strong>
                  </p>

                  {item.profile?.country && (
                    <p className="muted">
                      Country: {item.profile.country}
                    </p>
                  )}
                </div>

                {isProtectedOwner && (
                  <span className="badge">
                    Protected owner
                  </span>
                )}
              </div>

              {isOwner && !isProtectedOwner && (
                <div className="profile-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busyUser === item.user_id}
                    onClick={() =>
                      changeStatus(
                        item.user_id,
                        item.status === "active" ? "suspended" : "active"
                      )
                    }
                  >
                    {busyUser === item.user_id
                      ? "Please wait..."
                      : item.status === "active"
                        ? "Suspend access"
                        : "Reactivate access"}
                  </button>

                  <button
                    type="button"
                    className="textbtn"
                    disabled={busyUser === item.user_id}
                    onClick={() => revokeRole(item.user_id)}
                  >
                    Revoke role
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <p className="muted">
          The platform owner account cannot be suspended or revoked through
          this management screen. Server-side protections also apply.
        </p>
      </div>

      <div className="panel">
        <span className="eyebrow">ACCOUNTABILITY</span>
        <h3>Platform audit history</h3>

        {auditLogs.length === 0 && (
          <p className="muted">
            No platform audit events were returned.
          </p>
        )}

        {auditLogs.map(log => (
          <div className="report" key={log.id}>
            <strong>
              {String(log.action || "Platform event").replaceAll("_", " ")}
            </strong>

            <p className="muted">
              {log.created_at
                ? new Date(log.created_at).toLocaleString()
                : "Date unavailable"}
            </p>

            <p className="muted">
              Actor: {log.actor_user_id || "Unavailable"}
            </p>

            <p className="muted">
              Target: {log.target_user_id || "Not specified"}
            </p>

            {log.details && (
              <details>
                <summary>View event details</summary>
                <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))}
      </div>

      <div className="panel soft">
        <span className="eyebrow">PERMISSION MODEL</span>
        <h3>Role-based access</h3>
        <p className="muted">
          AssetChain currently uses fixed platform role permissions.
          Platform administrators can oversee platform operations and review
          applications. The platform owner controls staff appointments and
          access changes.
        </p>
        <p className="muted">
          Individual permission switches and custom permission sets are not
          implemented yet.
        </p>
      </div>
    </>
  );
}

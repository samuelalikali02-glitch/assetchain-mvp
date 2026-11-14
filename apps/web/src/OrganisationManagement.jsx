import React, { useEffect, useState } from "react";

export default function OrganisationManagement({ orgs = [], apiBase, token, onNotice }) {
  const [members, setMembers] = useState({});
  const [forms, setForms] = useState({});
  const [emails, setEmails] = useState({});
  const [roles, setRoles] = useState({});
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});

  async function request(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Organisation request failed.");
    return data;
  }

  async function loadMembers(id) {
    try {
      const data = await request(`/organisations/${id}/members`);
      setMembers(previous => ({ ...previous, [id]: data.members || [] }));
    } catch (error) {
      setErrors(previous => ({ ...previous, [id]: error.message }));
    }
  }

  useEffect(() => {
    orgs.forEach(item => {
      const id = item.organisation?.id;
      if (id) loadMembers(id);
    });
  }, [orgs, token]);

  function updateForm(id, field, value) {
    setForms(previous => ({
      ...previous,
      [id]: { ...(previous[id] || {}), [field]: value }
    }));
  }

  async function saveProfile(id) {
    setBusy(previous => ({ ...previous, [id]: true }));
    try {
      const data = await request(`/organisations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(forms[id] || {})
      });
      onNotice?.("Organisation profile updated.");
      setForms(previous => ({ ...previous, [id]: {} }));
    } catch (error) {
      setErrors(previous => ({ ...previous, [id]: error.message }));
    } finally {
      setBusy(previous => ({ ...previous, [id]: false }));
    }
  }

  async function addMember(id) {
    setBusy(previous => ({ ...previous, [id]: true }));
    try {
      await request(`/organisations/${id}/members`, {
        method: "POST",
        body: JSON.stringify({
          email: emails[id] || "",
          role: roles[id] || "org_member"
        })
      });
      setEmails(previous => ({ ...previous, [id]: "" }));
      await loadMembers(id);
      onNotice?.("Organisation member added.");
    } catch (error) {
      setErrors(previous => ({ ...previous, [id]: error.message }));
    } finally {
      setBusy(previous => ({ ...previous, [id]: false }));
    }
  }

  async function updateMember(id, memberId, changes) {
    setBusy(previous => ({ ...previous, [id]: true }));
    try {
      await request(`/organisations/${id}/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify(changes)
      });
      await loadMembers(id);
      onNotice?.("Membership updated.");
    } catch (error) {
      setErrors(previous => ({ ...previous, [id]: error.message }));
    } finally {
      setBusy(previous => ({ ...previous, [id]: false }));
    }
  }

  return (
    <div className="panel org-workspace-panel org-management-panel">
      <span className="eyebrow">ORGANISATION MANAGEMENT</span>
      <h3>Profiles and team access</h3>
      <p className="muted">
        Manage organisation details and membership. Access is restricted by each member's organisation role.
      </p>

      {orgs.map(item => {
        const org = item.organisation;
        if (!org?.id) return null;

        const id = org.id;
        const role = item.role;
        const canEdit = ["org_owner", "org_admin"].includes(role);
        const isOwner = role === "org_owner";
        const form = forms[id] || {};

        return (
          <div className="org-workspace-card" key={id}>
            <h3>{org.display_name || org.legal_name}</h3>
            <p className="muted">
              Your role: <strong>{role}</strong> · Verification: <strong>{org.verification_status}</strong>
            </p>

            {errors[id] && <p role="alert" className="caution">{errors[id]}</p>}

            {canEdit && (
              <details>
                <summary><strong>Edit organisation profile</strong></summary>
                <div className="form org-workspace-form" style={{ marginTop: "12px" }}>
                  {[
                    ["legal_name", "Legal name"],
                    ["display_name", "Display name"],
                    ["organisation_type", "Organisation type"],
                    ["country", "Country"],
                    ["registration_number", "Registration number"],
                    ["address", "Address"],
                    ["website", "Website"],
                    ["contact_email", "Contact email"],
                    ["phone", "Phone"]
                  ].map(([field, label]) => (
                    <label key={field}>
                      {label}
                      <input
                        value={form[field] ?? org[field] ?? ""}
                        onChange={event => updateForm(id, field, event.target.value)}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className="primary"
                    disabled={!!busy[id] || !Object.keys(form).length}
                    onClick={() => saveProfile(id)}
                  >
                    {busy[id] ? "Saving..." : "Save organisation profile"}
                  </button>
                </div>
              </details>
            )}

            <details style={{ marginTop: "14px" }}>
              <summary><strong>Organisation members ({(members[id] || []).length})</strong></summary>
              <div style={{ marginTop: "12px" }}>
                {(members[id] || []).map(member => (
                  <div className="org-member-card" key={member.id}>
                    <p><strong>{member.role}</strong> · {member.status}</p>
                    <small>Account ID: {member.user_id}</small>
                    {isOwner && member.role !== "org_owner" && member.status === "active" && (
                      <div className="profile-actions">
                        <select
                          aria-label="Member role"
                          value={member.role}
                          onChange={event => updateMember(id, member.id, { role: event.target.value })}
                        >
                          <option value="org_admin">Administrator</option>
                          <option value="org_member">Member</option>
                          <option value="org_viewer">Viewer</option>
                        </select>
                        <button
                          type="button"
                          className="textbtn"
                          disabled={!!busy[id]}
                          onClick={() => updateMember(id, member.id, { status: "inactive" })}
                        >
                          Deactivate access
                        </button>
                      </div>
                    )}
                    {isOwner && member.role !== "org_owner" && member.status === "inactive" && (
                      <button
                        type="button"
                        className="secondary"
                        disabled={!!busy[id]}
                        onClick={() => updateMember(id, member.id, { status: "active" })}
                      >
                        Reactivate access
                      </button>
                    )}
                  </div>
                ))}

                {(!members[id] || members[id].length === 0) && (
                  <p className="muted">No membership records were returned.</p>
                )}
              </div>
            </details>

            {isOwner && (
              <details style={{ marginTop: "14px" }}>
                <summary><strong>Add a registered member</strong></summary>
                <div className="form org-workspace-form" style={{ marginTop: "12px" }}>
                  <label>Registered account email
                    <input
                      type="email"
                      required
                      value={emails[id] || ""}
                      onChange={event => setEmails(previous => ({ ...previous, [id]: event.target.value }))}
                      placeholder="member@example.com"
                    />
                  </label>
                  <label>Organisation role
                    <select
                      value={roles[id] || "org_member"}
                      onChange={event => setRoles(previous => ({ ...previous, [id]: event.target.value }))}
                    >
                      <option value="org_member">Member</option>
                      <option value="org_admin">Administrator</option>
                      <option value="org_viewer">Viewer</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="primary"
                    disabled={!!busy[id] || !(emails[id] || "").trim()}
                    onClick={() => addMember(id)}
                  >
                    {busy[id] ? "Processing..." : "Add member"}
                  </button>
                  <p className="muted">
                    Only an existing registered AssetChain account can be added. This does not send an email invitation.
                  </p>
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}


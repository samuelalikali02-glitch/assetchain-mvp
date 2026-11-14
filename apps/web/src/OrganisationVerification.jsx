import React, { useEffect, useState } from "react";

const MAX_SIZE = 15 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export default function OrganisationVerification({ orgs = [], apiBase, token, onNotice }) {
  const [documents, setDocuments] = useState({});
  const [types, setTypes] = useState({});
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});

  async function api(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body instanceof FormData ? {} :
          options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function loadDocuments(id) {
    try {
      const result = await api(`/organisations/${id}/documents`);
      setDocuments(previous => ({ ...previous, [id]: result.documents || [] }));
    } catch (error) {
      setErrors(previous => ({ ...previous, [id]: error.message }));
    }
  }

  useEffect(() => {
    orgs.forEach(item => {
      if (item.organisation?.id) loadDocuments(item.organisation.id);
    });
  }, [orgs, token]);

  async function upload(id) {
    const file = files[id];
    const documentType = types[id] || "";

    if (!file) {
      setErrors(previous => ({ ...previous, [id]: "Choose a document first." }));
      return;
    }

    if (!ACCEPTED.includes(file.type)) {
      setErrors(previous => ({ ...previous, [id]: "Only PDF, JPEG, PNG and WebP files are accepted." }));
      return;
    }

    if (file.size < 1 || file.size > MAX_SIZE) {
      setErrors(previous => ({ ...previous, [id]: "The document must be no larger than 15 MiB." }));
      return;
    }

    if (!documentType.trim()) {
      setErrors(previous => ({ ...previous, [id]: "Enter the document type." }));
      return;
    }

    setBusy(previous => ({ ...previous, [id]: true }));
    setErrors(previous => ({ ...previous, [id]: "" }));

    try {
      const signed = await api(`/organisations/${id}/documents/upload-url`, {
        method: "POST",
        body: JSON.stringify({
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
          document_type: documentType
        })
      });

      const uploaded = await fetch(signed.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "x-upsert": "false"
        },
        body: file
      });

      if (!uploaded.ok) {
        throw new Error("The private storage upload failed. Request a new upload link and try again.");
      }

      await api(`/organisations/${id}/documents/complete`, {
        method: "POST",
        body: JSON.stringify({
          path: signed.path,
          file_name: file.name,
          mime_type: file.type,
          document_type: documentType
        })
      });

      setFiles(previous => ({ ...previous, [id]: null }));
      setTypes(previous => ({ ...previous, [id]: "" }));
      await loadDocuments(id);
      onNotice?.("Verification document uploaded successfully.");
    } catch (error) {
      setErrors(previous => ({ ...previous, [id]: error.message }));
    } finally {
      setBusy(previous => ({ ...previous, [id]: false }));
    }
  }

  async function download(id, documentId) {
    try {
      const result = await api(`/organisations/${id}/documents/${documentId}`);
      const link = document.createElement("a");
      link.href = result.signed_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (error) {
      setErrors(previous => ({ ...previous, [id]: error.message }));
    }
  }

  async function submit(id) {
    setBusy(previous => ({ ...previous, [id]: true }));
    setErrors(previous => ({ ...previous, [id]: "" }));

    try {
      const result = await api(`/organisations/${id}/verification`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await loadDocuments(id);
      onNotice?.(result.message || "Verification submitted.");
    } catch (error) {
      setErrors(previous => ({ ...previous, [id]: error.message }));
    } finally {
      setBusy(previous => ({ ...previous, [id]: false }));
    }
  }

  return (
    <div className="panel org-workspace-panel org-verification-panel">
      <span className="eyebrow">ORGANISATION VERIFICATION</span>
      <h3>Supporting documents</h3>
      <p className="muted">
        Upload documents supporting your organisation's identity and registration.
        Only authorized organisation managers can upload and submit them.
      </p>

      {orgs.map(item => {
        const org = item.organisation;
        if (!org?.id) return null;

        const id = org.id;
        const manager = ["org_owner", "org_admin"].includes(item.role);

        return (
          <div className="org-workspace-card" key={id}>
            <h3>{org.display_name || org.legal_name}</h3>
            <p>Current verification status: <strong>{org.verification_status || "pending"}</strong></p>

            {errors[id] && <p className="caution" role="alert">{errors[id]}</p>}

            {manager && (
              <div className="form org-workspace-form">
                <label>Document type
                  <select
                    value={types[id] || ""}
                    onChange={event => setTypes(previous => ({ ...previous, [id]: event.target.value }))}
                  >
                    <option value="">Select document type</option>
                    <option value="Certificate of incorporation">Certificate of incorporation</option>
                    <option value="Business registration">Business registration</option>
                    <option value="Tax registration">Tax registration</option>
                    <option value="Proof of address">Proof of address</option>
                    <option value="Other supporting document">Other supporting document</option>
                  </select>
                </label>

                <label>Choose supporting document
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    onChange={event => setFiles(previous => ({ ...previous, [id]: event.target.files?.[0] || null }))}
                  />
                </label>

                {files[id] && (
                  <p className="muted">
                    {files[id].name} · {(files[id].size / 1024 / 1024).toFixed(2)} MiB
                  </p>
                )}

                <button
                  type="button"
                  className="secondary"
                  disabled={!!busy[id]}
                  onClick={() => upload(id)}
                >
                  {busy[id] ? "Processing..." : "Upload document"}
                </button>
              </div>
            )}

            <h4>Uploaded documents</h4>
            {(documents[id] || []).length === 0
              ? <p className="muted">No documents uploaded yet.</p>
              : (documents[id] || []).map(doc => (
                <div className="org-document-card" key={doc.id}>
                  <strong>{doc.document_type}</strong>
                  <p>{doc.file_name}</p>
                  <p>Status: {doc.status}</p>
                  <small>{new Date(doc.created_at).toLocaleString()}</small>
                  <div>
                    <button type="button" className="textbtn" onClick={() => download(id, doc.id)}>
                      Secure download
                    </button>
                  </div>
                </div>
              ))
            }

            {manager && (
              <>
                <button
                  type="button"
                  className="primary"
                  disabled={!!busy[id] || !(documents[id] || []).some(doc => doc.status === "pending")}
                  onClick={() => submit(id)}
                >
                  {busy[id] ? "Submitting..." : "Submit for verification review"}
                </button>
                <p className="muted">
                  Submission requests a platform review. It does not automatically verify the organisation or establish legal ownership.
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}



import { randomUUID, createHash } from "node:crypto";
import { supabase } from "./supabase.js";

const BUCKET = "assetchain-evidence";
const MAX_SIZE = 15 * 1024 * 1024;
const ALLOWED = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"]
};

function reply(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function safeFileName(name) {
  return String(name || "document")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
}

async function currentUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024 * 1024) throw new Error("Request body too large.");
  }
  return raw ? JSON.parse(raw) : {};
}

async function membership(orgId, userId) {
  const { data, error } = await supabase
    .from("organisation_members")
    .select("id,role,status")
    .eq("organisation_id", orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function audit(orgId, userId, action, details = {}) {
  const { error } = await supabase
    .from("organisation_audit_logs")
    .insert({
      organisation_id: orgId,
      actor_user_id: userId,
      action,
      details
    });

  if (error) throw error;
}

function detectMime(buffer) {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  ) return "application/pdf";

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) return "image/jpeg";

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) return "image/png";

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "image/webp";

  return null;
}

export async function handleOrganisationDocuments(req, res) {
  const pathname = req.url?.split("?")[0] || "";
  const match = pathname.match(
    /^\/api\/organisations\/([^/]+)\/(documents|verification)(?:\/([^/]+))?$/
  );

  if (!match) return false;

  try {
    const [, orgId, resource, action] = match;
    const user = await currentUser(req);

    if (!user) {
      reply(res, 401, { error: "Authentication required." });
      return true;
    }

    const member = await membership(orgId, user.id);

    if (!member) {
      reply(res, 403, { error: "Active organisation membership required." });
      return true;
    }

    const manager = ["org_owner", "org_admin"].includes(member.role);

    if (resource === "documents" && req.method === "GET" && !action) {
      const { data, error } = await supabase
        .from("organisation_documents")
        .select("id,document_type,file_name,mime_type,file_size,document_hash,status,created_at")
        .eq("organisation_id", orgId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      reply(res, 200, { documents: data || [] });
      return true;
    }

    if (
      resource === "documents" &&
      req.method === "POST" &&
      action === "upload-url"
    ) {
      if (!manager) {
        reply(res, 403, { error: "Organisation manager permission required." });
        return true;
      }

      const body = await readJson(req);
      const fileName = safeFileName(body.file_name);
      const mime = String(body.mime_type || "").toLowerCase();
      const size = Number(body.file_size);
      const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();

      if (!ALLOWED[mime] || !ALLOWED[mime].includes(extension)) {
        reply(res, 400, { error: "File type and extension must match an accepted format." });
        return true;
      }

      if (!Number.isInteger(size) || size < 1 || size > MAX_SIZE) {
        reply(res, 400, { error: "File must be between 1 byte and 15 MiB." });
        return true;
      }

      if (!String(body.document_type || "").trim()) {
        reply(res, 400, { error: "Document type is required." });
        return true;
      }

      const path = `${orgId}/verification/${randomUUID()}-${fileName}`;

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(path);

      if (error) throw error;

      await audit(orgId, user.id, "ORGANISATION_DOCUMENT_UPLOAD_AUTHORIZED", {
        storage_path: path,
        document_type: String(body.document_type).slice(0, 120),
        file_size: size
      });

      reply(res, 200, {
        path,
        token: data.token,
        upload_url: data.signedUrl
      });
      return true;
    }

    if (
      resource === "documents" &&
      req.method === "POST" &&
      action === "complete"
    ) {
      if (!manager) {
        reply(res, 403, { error: "Organisation manager permission required." });
        return true;
      }

      const body = await readJson(req);
      const storagePath = String(body.path || "");
      const fileName = safeFileName(body.file_name);
      const mime = String(body.mime_type || "").toLowerCase();
      const documentType = String(body.document_type || "").trim();

      if (
        !storagePath.startsWith(`${orgId}/verification/`) ||
        !ALLOWED[mime] ||
        !ALLOWED[mime].includes(fileName.slice(fileName.lastIndexOf(".")).toLowerCase()) ||
        !documentType
      ) {
        reply(res, 400, { error: "Invalid document upload metadata." });
        return true;
      }

      const { data: file, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(storagePath);

      if (downloadError || !file) {
        reply(res, 400, { error: "Uploaded file could not be retrieved from private storage." });
        return true;
      }

      const bytes = Buffer.from(await file.arrayBuffer());

      if (bytes.length < 1 || bytes.length > MAX_SIZE) {
        reply(res, 400, { error: "Stored file size is invalid or exceeds 15 MiB." });
        return true;
      }

      const actualMime = detectMime(bytes);

      if (!actualMime || actualMime !== mime) {
        reply(res, 400, { error: "The actual file contents do not match the declared file type." });
        return true;
      }

      const documentHash = createHash("sha256").update(bytes).digest("hex");

      const { data: document, error: insertError } = await supabase
        .from("organisation_documents")
        .insert({
          organisation_id: orgId,
          uploaded_by: user.id,
          document_type: documentType.slice(0, 120),
          file_name: fileName,
          storage_path: storagePath,
          mime_type: actualMime,
          file_size: bytes.length,
          document_hash: documentHash,
          status: "pending"
        })
        .select("id,document_type,file_name,mime_type,file_size,document_hash,status,created_at")
        .single();

      if (insertError) throw insertError;

      await audit(orgId, user.id, "ORGANISATION_DOCUMENT_REGISTERED", {
        document_id: document.id,
        document_hash: documentHash,
        file_size: bytes.length,
        mime_type: actualMime
      });

      reply(res, 201, {
        message: "Document securely uploaded and validated.",
        document
      });
      return true;
    }

    if (
      resource === "documents" &&
      req.method === "GET" &&
      action
    ) {
      const { data: document, error } = await supabase
        .from("organisation_documents")
        .select("id,storage_path,file_name")
        .eq("id", action)
        .eq("organisation_id", orgId)
        .maybeSingle();

      if (error) throw error;
      if (!document) {
        reply(res, 404, { error: "Document not found." });
        return true;
      }

      const { data: signed, error: signedError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(document.storage_path, 60);

      if (signedError) throw signedError;

      await audit(orgId, user.id, "ORGANISATION_DOCUMENT_ACCESS_GRANTED", {
        document_id: document.id
      });

      reply(res, 200, {
        signed_url: signed.signedUrl,
        expires_in: 60
      });
      return true;
    }

    if (
      resource === "verification" &&
      req.method === "POST" &&
      !action
    ) {
      if (!manager) {
        reply(res, 403, { error: "Organisation manager permission required." });
        return true;
      }

      const { data: docs, error: docsError } = await supabase
        .from("organisation_documents")
        .select("id")
        .eq("organisation_id", orgId)
        .eq("status", "pending")
        .limit(1);

      if (docsError) throw docsError;

      if (!docs?.length) {
        reply(res, 400, { error: "Upload at least one pending verification document first." });
        return true;
      }

      const { data: organisation, error: orgError } = await supabase
        .from("organisations")
        .select("verification_status")
        .eq("id", orgId)
        .single();

      if (orgError) throw orgError;

      const { error: updateError } = await supabase
        .from("organisations")
        .update({
          verification_status: "pending",
          updated_at: new Date().toISOString()
        })
        .eq("id", orgId);

      if (updateError) throw updateError;

      await audit(orgId, user.id, "ORGANISATION_VERIFICATION_SUBMITTED", {
        previous_status: organisation.verification_status,
        submitted_document_count: docs.length
      });

      reply(res, 200, {
        message: "Organisation submitted for platform verification review."
      });
      return true;
    }

    reply(res, 405, { error: "Method not allowed for this organisation resource." });
    return true;
  } catch (error) {
    console.error("Organisation document API error:", error);
    reply(res, 500, { error: "Unable to process the organisation document request." });
    return true;
  }
}

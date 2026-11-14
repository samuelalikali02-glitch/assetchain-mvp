import { createHash } from "node:crypto";
import { supabase } from "./supabase.js";

const BUCKET = "assetchain-evidence";
const MAX_SIZE = 15 * 1024 * 1024;

const TYPES = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024 * 1024) throw new Error("Request body too large.");
  }
  return raw ? JSON.parse(raw) : {};
}

function detectMime(bytes) {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

async function authenticate(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data?.user || null;
}

export async function handleValidatedOrganisationDocument(req, res) {
  const match = req.url?.split("?")[0].match(/^\/api\/organisations\/([^/]+)\/documents\/complete$/);
  if (!match || req.method !== "POST") return false;

  try {
    const user = await authenticate(req);
    if (!user) {
      send(res, 401, { error: "Authentication required." });
      return true;
    }

    const organisationId = match[1];
    const body = await readBody(req);

    const { data: membership, error: membershipError } = await supabase
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", organisationId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership || !["org_owner", "org_admin"].includes(membership.role)) {
      send(res, 403, { error: "Active organisation manager access required." });
      return true;
    }

    const path = String(body.path || "");
    const fileName = String(body.file_name || "").trim();
    const mimeType = String(body.mime_type || "").toLowerCase();
    const documentType = String(body.document_type || "").trim();

    if (!path.startsWith(`${organisationId}/verification/`) || path.includes("..") || path.includes("\\") || path.length > 500) {
      send(res, 400, { error: "Invalid organisation document storage path." });
      return true;
    }

    if (!fileName || fileName.length > 255 || /[/\\]/.test(fileName)) {
      send(res, 400, { error: "Invalid document filename." });
      return true;
    }

    if (!documentType || documentType.length > 100) {
      send(res, 400, { error: "A valid document type is required." });
      return true;
    }

    const dot = fileName.lastIndexOf(".");
    const extension = dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
    const expectedMime = TYPES[extension];

    if (!expectedMime || expectedMime !== mimeType) {
      send(res, 400, { error: "Filename extension and declared MIME type do not match." });
      return true;
    }

    const { data: downloaded, error: downloadError } = await supabase.storage.from(BUCKET).download(path);
    if (downloadError || !downloaded) {
      send(res, 400, { error: "Uploaded file could not be retrieved from private storage." });
      return true;
    }

    const bytes = Buffer.from(await downloaded.arrayBuffer());

    if (bytes.length < 1 || bytes.length > MAX_SIZE) {
      send(res, 400, { error: "Stored file must be between 1 byte and 15 MiB." });
      return true;
    }

    const actualMime = detectMime(bytes);
    if (!actualMime || actualMime !== expectedMime) {
      send(res, 400, { error: "Actual file contents do not match the declared file type." });
      return true;
    }

    const hash = createHash("sha256").update(bytes).digest("hex");

    const { data: existing, error: existingError } = await supabase
      .from("organisation_documents")
      .select("id")
      .eq("storage_path", path)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      send(res, 409, { error: "This uploaded document has already been registered." });
      return true;
    }

    const { data: document, error: insertError } = await supabase
      .from("organisation_documents")
      .insert({
        organisation_id: organisationId,
        uploaded_by: user.id,
        document_type: documentType,
        file_name: fileName,
        storage_path: path,
        mime_type: actualMime,
        file_size: bytes.length,
        document_hash: hash,
        status: "pending"
      })
      .select("id,document_type,file_name,mime_type,file_size,document_hash,status,created_at")
      .single();

    if (insertError) throw insertError;

    const { error: auditError } = await supabase
      .from("organisation_audit_logs")
      .insert({
        organisation_id: organisationId,
        actor_user_id: user.id,
        action: "ORGANISATION_DOCUMENT_UPLOADED",
        details: {
          document_id: document.id,
          file_name: fileName,
          document_type: documentType,
          mime_type: actualMime,
          file_size: bytes.length,
          document_hash: hash
        }
      });

    if (auditError) {
      console.error("Document audit insert failed:", auditError);
      send(res, 500, { error: "Document saved, but audit recording failed. Reconciliation is required." });
      return true;
    }

    send(res, 201, { message: "Document validated and registered.", document });
    return true;
  } catch (error) {
    console.error("Validated organisation document error:", error);
    send(res, 500, { error: "Unable to validate and register the uploaded document." });
    return true;
  }
}

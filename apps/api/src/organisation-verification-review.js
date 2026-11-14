import { supabase } from "./supabase.js";

function reply(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024 * 1024) throw new Error("Request body too large.");
  }
  return raw ? JSON.parse(raw) : {};
}

async function getPlatformReviewer(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;

  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth?.user) return null;

  const { data: roles, error } = await supabase
    .from("platform_user_roles")
    .select("role,status")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .in("role", ["platform_owner", "platform_admin"]);

  if (error || !roles?.length) return null;
  return { user: auth.user, role: roles[0].role };
}

export async function handleOrganisationVerificationReview(req, res) {
  const match = req.url?.split("?")[0].match(
    /^\/api\/platform\/organisations\/([^/]+)\/verification$/
  );

  if (!match || req.method !== "PATCH") return false;

  try {
    const reviewer = await getPlatformReviewer(req);
    if (!reviewer) {
      reply(res, 403, { error: "Platform administrator access required." });
      return true;
    }

    const organisationId = match[1];
    const body = await readBody(req);
    const status = body.verification_status || body.status;
    const note = String(body.note || body.review_note || "").trim();

    if (!["pending", "verified", "rejected", "needs_information"].includes(status)) {
      reply(res, 400, { error: "Invalid verification decision." });
      return true;
    }

    if (note.length > 1000) {
      reply(res, 400, { error: "Review note must not exceed 1,000 characters." });
      return true;
    }

    const { data, error } = await supabase.rpc(
      "review_organisation_verification",
      {
        p_org_id: organisationId,
        p_reviewer_id: reviewer.user.id,
        p_status: status,
        p_note: note || null
      }
    );

    if (error) {
      console.error("Atomic organisation review failed:", error);
      reply(res, 500, { error: "Unable to save the verification decision. No partial review should have been committed." });
      return true;
    }

    reply(res, 200, {
      message: "Organisation verification decision recorded.",
      ...data
    });
    return true;
  } catch (error) {
    console.error("Organisation verification review error:", error);
    reply(res, 500, { error: "Unable to complete the verification review." });
    return true;
  }
}

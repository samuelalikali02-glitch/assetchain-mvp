import { supabase } from "./supabase.js";

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export async function handleOrganisationVerificationHistory(req, res) {
  const match = req.url?.split("?")[0].match(
    /^\/api\/organisations\/([^/]+)\/verification-history$/
  );

  if (!match || req.method !== "GET") return false;

  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) {
      send(res, 401, { error: "Authentication required." });
      return true;
    }

    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth?.user) {
      send(res, 401, { error: "Invalid or expired session." });
      return true;
    }

    const organisationId = match[1];

    const { data: membership, error: membershipError } = await supabase
      .from("organisation_members")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("user_id", auth.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      send(res, 403, { error: "Active organisation membership required." });
      return true;
    }

    const { data, error } = await supabase
      .from("organisation_verification_reviews")
      .select("id,previous_status,new_status,review_note,reviewer_user_id,created_at")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    send(res, 200, { history: data || [] });
    return true;
  } catch (error) {
    console.error("Organisation verification history error:", error);
    send(res, 500, { error: "Unable to load verification history." });
    return true;
  }
}

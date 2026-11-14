import { supabase } from "./supabase.js";

const allowedMemberRoles = ["org_admin", "org_member", "org_viewer"];

function reply(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function getUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;

  return data.user;
}

async function getMembership(organisationId, userId) {
  const { data, error } = await supabase
    .from("organisation_members")
    .select("id, organisation_id, user_id, role, status")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function writeAudit(organisationId, actorId, action, targetUserId, details = {}) {
  const { error } = await supabase
    .from("organisation_audit_logs")
    .insert({
      organisation_id: organisationId,
      actor_user_id: actorId,
      action,
      target_user_id: targetUserId || null,
      details
    });

  if (error) throw error;
}

async function findRegisteredUser(email) {
  const wanted = email.trim().toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 500
    });

    if (error) throw error;

    const users = data?.users || [];
    const match = users.find(
      user => (user.email || "").toLowerCase() === wanted
    );

    if (match) return match;
    if (users.length < 500) break;
  }

  return null;
}

export async function handleOrganisationManagement(req, res, body) {
  if (body === undefined && ["POST", "PATCH"].includes(req.method.toUpperCase())) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > 1048576) {
        reply(res, 413, { error: "Request body is too large." });
        return true;
      }
      chunks.push(chunk);
    }
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    } catch {
      reply(res, 400, { error: "Invalid JSON request body." });
      return true;
    }
  }
  body = body || {};
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname.replace(/\/+$/, "");
  const method = req.method.toUpperCase();

  const profileMatch = path.match(/^\/api\/organisations\/([^/]+)$/);
  const membersMatch = path.match(/^\/api\/organisations\/([^/]+)\/members$/);
  const memberMatch = path.match(/^\/api\/organisations\/([^/]+)\/members\/([^/]+)$/);

  if (!profileMatch && !membersMatch && !memberMatch) return false;

  try {
    const user = await getUser(req);
    if (!user) {
      reply(res, 401, { error: "Please sign in again." });
      return true;
    }

    const organisationId = decodeURIComponent(
      (profileMatch || membersMatch || memberMatch)[1]
    );

    const membership = await getMembership(organisationId, user.id);

    if (!membership) {
      reply(res, 403, { error: "You do not have active access to this organisation." });
      return true;
    }

    const isManager = ["org_owner", "org_admin"].includes(membership.role);
    const isOwner = membership.role === "org_owner";

    if (profileMatch && method === "PATCH") {
      if (!isManager) {
        reply(res, 403, { error: "Only organisation owners and administrators can edit the profile." });
        return true;
      }

      const allowedFields = [
        "legal_name",
        "display_name",
        "organisation_type",
        "registration_number",
        "country",
        "address",
        "website",
        "contact_email",
        "phone"
      ];

      const updates = {};
      for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          updates[field] = typeof body[field] === "string"
            ? body[field].trim()
            : body[field];
        }
      }

      if (!Object.keys(updates).length) {
        reply(res, 400, { error: "No organisation fields were provided." });
        return true;
      }

      if (updates.legal_name !== undefined && !updates.legal_name) {
        reply(res, 400, { error: "Legal organisation name is required." });
        return true;
      }

      if (updates.country !== undefined && !updates.country) {
        reply(res, 400, { error: "Country is required." });
        return true;
      }

      if (updates.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.contact_email)) {
        reply(res, 400, { error: "Enter a valid organisation contact email." });
        return true;
      }

      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("organisations")
        .update(updates)
        .eq("id", organisationId)
        .select("*")
        .single();

      if (error) throw error;

      await writeAudit(
        organisationId,
        user.id,
        "ORGANISATION_PROFILE_UPDATED",
        null,
        { changed_fields: Object.keys(updates).filter(key => key !== "updated_at") }
      );

      reply(res, 200, { organisation: data });
      return true;
    }

    if (membersMatch && method === "GET") {
      const { data, error } = await supabase
        .from("organisation_members")
        .select("id, user_id, role, status, joined_at")
        .eq("organisation_id", organisationId)
        .order("joined_at", { ascending: true });

      if (error) throw error;

      reply(res, 200, {
        members: data || [],
        currentRole: membership.role
      });
      return true;
    }

    if (membersMatch && method === "POST") {
      if (!isOwner) {
        reply(res, 403, { error: "Only the organisation owner can add or appoint members." });
        return true;
      }

      const email = String(body.email || "").trim().toLowerCase();
      const role = String(body.role || "org_member");

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        reply(res, 400, { error: "Enter a valid registered account email." });
        return true;
      }

      if (!allowedMemberRoles.includes(role)) {
        reply(res, 400, { error: "Invalid organisation role." });
        return true;
      }

      const invitedUser = await findRegisteredUser(email);

      if (!invitedUser) {
        reply(res, 404, { error: "No registered AssetChain account was found for that email." });
        return true;
      }

      if (invitedUser.id === user.id) {
        reply(res, 400, { error: "You are already the organisation owner." });
        return true;
      }

      const { data: existing, error: existingError } = await supabase
        .from("organisation_members")
        .select("id, role, status")
        .eq("organisation_id", organisationId)
        .eq("user_id", invitedUser.id)
        .maybeSingle();

      if (existingError) throw existingError;

      let result;

      if (existing) {
        const { data, error } = await supabase
          .from("organisation_members")
          .update({ role, status: "active", joined_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select("id, user_id, role, status, joined_at")
          .single();

        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase
          .from("organisation_members")
          .insert({
            organisation_id: organisationId,
            user_id: invitedUser.id,
            role,
            status: "active"
          })
          .select("id, user_id, role, status, joined_at")
          .single();

        if (error) throw error;
        result = data;
      }

      await writeAudit(
        organisationId,
        user.id,
        existing ? "ORGANISATION_MEMBER_REACTIVATED" : "ORGANISATION_MEMBER_ADDED",
        invitedUser.id,
        { role }
      );

      reply(res, existing ? 200 : 201, { member: result });
      return true;
    }

    if (memberMatch && method === "PATCH") {
      if (!isOwner) {
        reply(res, 403, { error: "Only the organisation owner can change member access." });
        return true;
      }

      const memberId = decodeURIComponent(memberMatch[2]);
      const { data: target, error: targetError } = await supabase
        .from("organisation_members")
        .select("id, user_id, role, status")
        .eq("id", memberId)
        .eq("organisation_id", organisationId)
        .maybeSingle();

      if (targetError) throw targetError;

      if (!target) {
        reply(res, 404, { error: "Organisation membership not found." });
        return true;
      }

      if (target.role === "org_owner" || target.user_id === user.id) {
        reply(res, 403, { error: "The organisation owner's membership cannot be changed here." });
        return true;
      }

      const updates = {};

      if (body.role !== undefined) {
        if (!allowedMemberRoles.includes(body.role)) {
          reply(res, 400, { error: "Invalid organisation role." });
          return true;
        }
        updates.role = body.role;
      }

      if (body.status !== undefined) {
        if (!["active", "inactive"].includes(body.status)) {
          reply(res, 400, { error: "Membership status must be active or inactive." });
          return true;
        }
        updates.status = body.status;
      }

      if (!Object.keys(updates).length) {
        reply(res, 400, { error: "Provide a role or membership status to update." });
        return true;
      }

      const { data, error } = await supabase
        .from("organisation_members")
        .update(updates)
        .eq("id", memberId)
        .select("id, user_id, role, status, joined_at")
        .single();

      if (error) throw error;

      await writeAudit(
        organisationId,
        user.id,
        updates.status === "inactive"
          ? "ORGANISATION_MEMBER_DEACTIVATED"
          : "ORGANISATION_MEMBER_UPDATED",
        target.user_id,
        updates
      );

      reply(res, 200, { member: data });
      return true;
    }

    reply(res, 405, { error: "Method not supported for this organisation endpoint." });
    return true;
  } catch (error) {
    console.error("Organisation management error:", error);
    reply(res, 500, { error: "Organisation management request failed." });
    return true;
  }
}



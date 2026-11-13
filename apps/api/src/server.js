import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { enqueueCriticalEvent, startAnchoringWorker, getAnchoringEvents } from "./anchoring.js";
import { login, authenticate, logout, hasRole } from "./auth.js";
import { supabase } from "./supabase.js";
import {
  receiveUploads,
  attachUploads,
  getStoredFile
} from "./uploads.js";
const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const dataFile = fileURLToPath(new URL("../data/assets.json", import.meta.url));

mkdirSync(dataDir, { recursive: true });

let assets = [];
try {
  const saved = readFileSync(dataFile, "utf8").replace(/^\uFEFF/, "");
  assets = JSON.parse(saved);
  if (!Array.isArray(assets)) assets = [];
} catch {
  assets = [];
}

function saveAssets() {
  writeFileSync(dataFile, JSON.stringify(assets, null, 2), "utf8");
}

const port = 4000;

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

 let body = {};

const contentType = req.headers["content-type"] || "";

if (!contentType.toLowerCase().includes("multipart/form-data")) {
  try {
    let raw = "";
    let bodySize = 0;

    for await (const chunk of req) {
      bodySize += chunk.length;

      if (bodySize > 2 * 1024 * 1024) {
        res.writeHead(413);
        return res.end(JSON.stringify({ error: "Request body too large" }));
      }

      raw += chunk;
    }

    if (raw) body = JSON.parse(raw);
  } catch {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: "Invalid JSON" }));
  }
}
  const send = (code, data) => {
    res.writeHead(code);
    res.end(JSON.stringify(data));
  };

  if (req.url === "/api/login" && req.method === "POST") {
    const result = login(body.email, body.password);
    if (!result) return send(401, { error: "Invalid email or password" });
    return send(200, result);
  }

  if (req.url === "/api/me" && req.method === "GET") {
    const authHeader = req.headers.authorization || "";
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);

    if (!tokenMatch) {
      const legacyUser = authenticate(req);
      if (legacyUser) return send(200, { user: legacyUser });
      return send(401, { error: "Authentication required" });
    }

    const { data: authData, error: authError } =
      await supabase.auth.getUser(tokenMatch[1]);

    if (authError || !authData?.user) {
      return send(401, { error: "Invalid or expired Supabase session" });
    }

    const authUser = authData.user;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_status")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile authorization failed:", profileError.message);
      return send(503, { error: "Account authorization is temporarily unavailable" });
    }

    if (!profile || profile.account_status !== "active") {
      return send(403, { error: "Your AssetChain account is not active" });
    }

    const { data: platformRole, error: roleError } = await supabase
      .from("platform_user_roles")
      .select("role, status")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (roleError) {
      console.error("Platform role lookup failed:", roleError.message);
      return send(503, { error: "Platform permissions are temporarily unavailable" });
    }

    if (platformRole && platformRole.status !== "active") {
      return send(403, { error: "Your platform access is suspended" });
    }

    const roleMap = {
      platform_owner: "owner",
      platform_admin: "admin",
      platform_inspector: "platform_inspector"
    };

    const user = {
      id: authUser.id,
      email: authUser.email,
      role: roleMap[platformRole?.role] || "user",
      platformRole: platformRole?.role || "user"
    };

    return send(200, { user });
  }
  if (req.url === "/api/logout" && req.method === "POST") {
    logout(req);
    return send(200, { message: "Logged out" });
  }

  // Supabase-authenticated organisation endpoints.
  if (req.url === "/api/organisations" &&
      ["GET", "POST"].includes(req.method)) {

    const authHeader = req.headers.authorization || "";
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);

    if (!tokenMatch) {
      return send(401, { error: "Supabase authentication required" });
    }

    const { data: authData, error: authError } =
      await supabase.auth.getUser(tokenMatch[1]);

    if (authError || !authData?.user) {
      return send(401, { error: "Invalid or expired Supabase session" });
    }

    const authUser = authData.user;

    try {
      if (req.method === "GET") {
        const { data, error } = await supabase
          .from("organisation_members")
          .select(`
            id,
            role,
            status,
            joined_at,
            organisation:organisations (
              id,
              legal_name,
              display_name,
              organisation_type,
              country,
              verification_status,
              created_at
            )
          `)
          .eq("user_id", authUser.id)
          .eq("status", "active");

        if (error) throw error;

        return send(200, { organisations: data || [] });
      }

      const legalName = String(body.legal_name || "").trim();
      const displayName = String(body.display_name || "").trim();
      const organisationType = String(body.organisation_type || "").trim();
      const country = String(body.country || "").trim();

      if (!legalName || !displayName || !organisationType || !country) {
        return send(400, {
          error: "Legal name, display name, organisation type and country are required"
        });
      }

      // Ensure the Auth user's profile exists.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        const { error } = await supabase
          .from("profiles")
          .insert({
            id: authUser.id,
            full_name: String(authUser.user_metadata?.full_name || ""),
            platform_role: "user",
            account_status: "active"
          });

        if (error) throw error;
      }

      // Create the organisation as pending verification.
      const { data: organisation, error: organisationError } =
        await supabase
          .from("organisations")
          .insert({
            legal_name: legalName,
            display_name: displayName,
            organisation_type: organisationType,
            registration_number: String(body.registration_number || "").trim() || null,
            country,
            address: String(body.address || "").trim() || null,
            website: String(body.website || "").trim() || null,
            contact_email: String(body.contact_email || authUser.email || "").trim() || null,
            phone: String(body.phone || "").trim() || null,
            verification_status: "pending",
            created_by: authUser.id
          })
          .select("*")
          .single();

      if (organisationError) throw organisationError;

      // Automatically make the creator the organisation owner.
      const { data: membership, error: membershipError } =
        await supabase
          .from("organisation_members")
          .insert({
            organisation_id: organisation.id,
            user_id: authUser.id,
            role: "org_owner",
            status: "active"
          })
          .select("*")
          .single();

      if (membershipError) {
        await supabase
          .from("organisations")
          .delete()
          .eq("id", organisation.id);

        throw membershipError;
      }

      // Convenience default only; membership remains the authority.
      await supabase
        .from("profiles")
        .update({ organisation_id: organisation.id })
        .eq("id", authUser.id);

      return send(201, {
        message: "Organisation created successfully",
        organisation,
        membership
      });

    } catch (error) {
      console.error("Organisation API error:", error.message);
      return send(500, {
        error: "Organisation operation failed",
        detail: error.message
      });
    }
  }
  // Accept legacy demo sessions or verified Supabase sessions.
  let user = authenticate(req);

  if (!user) {
    const authHeader = req.headers.authorization || "";
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);

    if (tokenMatch) {
      const { data: { user: authUser }, error: authError } =
        await supabase.auth.getUser(tokenMatch[1]);

      if (!authError && authUser) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("account_status")
          .eq("id", authUser.id)
          .maybeSingle();

        if (profileError) {
          console.error("Profile authorization failed:", profileError.message);
          return send(503, { error: "Account authorization is temporarily unavailable" });
        }

        if (!profile || profile.account_status !== "active") {
          return send(403, { error: "Your AssetChain account is not active" });
        }

        const { data: platformRole, error: roleError } = await supabase
          .from("platform_user_roles")
          .select("role, status")
          .eq("user_id", authUser.id)
          .maybeSingle();

        if (roleError) {
          console.error("Platform role lookup failed:", roleError.message);
          return send(503, { error: "Platform permissions are temporarily unavailable" });
        }

        if (platformRole && platformRole.status !== "active") {
          return send(403, { error: "Your platform access is suspended" });
        }

        const roleMap = {
          platform_owner: "owner",
          platform_admin: "admin",
          platform_inspector: "platform_inspector"
        };

        user = {
          id: authUser.id,
          email: authUser.email,
          role: roleMap[platformRole?.role] || "user",
          platformRole: platformRole?.role || "user"
        };
      }
    }
  }
  if (req.url === "/api/inspector-applications" && req.method === "GET") {
    if (!user) return send(401, { error: "Sign in to view your application." });

    const { data, error } = await supabase
      .from("inspector_applications")
      .select("id, full_name, application_status, review_notes, created_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return send(500, { error: "Could not load your application." });
    return send(200, { application: data || null });
  }
  if (req.url === "/api/inspector-applications" && req.method === "POST") {
    if (!user) return send(401, { error: "Sign in before applying." });

    const fields = ["full_name", "email", "phone", "qualifications", "experience", "specialisation", "coverage_area"];
    for (const field of fields) {
      if (typeof body[field] !== "string" || !body[field].trim()) {
        return send(400, { error: `Please provide ${field.replaceAll("_", " ")}.` });
      }
    }

    if (body.full_name.length > 120 || body.email.length > 254 ||
        body.phone.length > 40 || body.qualifications.length > 2000 ||
        body.experience.length > 3000 || body.specialisation.length > 200 ||
        body.coverage_area.length > 200) {
      return send(400, { error: "One or more application fields are too long." });
    }

    const { data, error } = await supabase
      .from("inspector_applications")
      .upsert({
        user_id: user.id,
        full_name: body.full_name.trim(),
        email: body.email.trim().toLowerCase(),
        phone: body.phone.trim(),
        qualifications: body.qualifications.trim(),
        experience: body.experience.trim(),
        specialisation: body.specialisation.trim(),
        coverage_area: body.coverage_area.trim(),
        application_status: "pending",
        review_notes: null,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      console.error("Inspector application submission failed:", error.message);
      return send(500, { error: "Could not submit application." });
    }
    return send(201, { application: data, message: "Application submitted for review." });
  }
  // AssetChain platform administration API.
  const isPlatformAdmin = hasRole(user, ["owner", "admin"]);
  const isPlatformOwner = hasRole(user, ["owner"]);

  const recordPlatformAudit = async (action, targetUserId = null, details = {}) => {
    const { error } = await supabase.from("platform_audit_logs").insert({
      actor_user_id: user.id,
      action,
      target_user_id: targetUserId,
      details
    });
    if (error) {
      console.error("Platform audit write failed:", error.message);
      return false;
    }
    return true;
  };

  if (req.url.startsWith("/api/platform/")) {
    if (!user) return send(401, { error: "Authentication required" });

    const requestUrl = new URL(req.url, "http://127.0.0.1:4000");
    const pathname = requestUrl.pathname;

    if (pathname === "/api/platform/inspector-applications" && req.method === "GET") {
      if (!isPlatformAdmin) return send(403, { error: "Platform administrator access required" });

      const { data, error } = await supabase
        .from("inspector_applications")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return send(500, { error: "Could not load inspector applications." });
      return send(200, { applications: data || [] });
    }

    if (pathname.startsWith("/api/platform/inspector-applications/") && req.method === "PATCH") {
      if (!isPlatformAdmin) return send(403, { error: "Platform administrator access required" });

      const applicationId = pathname.split("/").pop();
      const allowedStatuses = ["approved", "rejected", "needs_information"];
      if (!/^[0-9a-f-]{36}$/i.test(applicationId) || !allowedStatuses.includes(body.status)) {
        return send(400, { error: "Invalid application ID or review status." });
      }

      if (body.status === "approved" && !isPlatformOwner) {
        return send(403, { error: "Only the platform owner can appoint platform inspectors." });
      }

      const { data: application, error: lookupError } = await supabase
        .from("inspector_applications")
        .select("id,user_id,application_status")
        .eq("id", applicationId)
        .maybeSingle();

      if (lookupError) return send(500, { error: "Could not load application." });
      if (!application) return send(404, { error: "Application not found." });

      if (body.status === "approved") {
        const { error: roleError } = await supabase
          .from("platform_user_roles")
          .upsert({
            user_id: application.user_id,
            role: "platform_inspector",
            status: "active",
            created_by: user.id,
            updated_at: new Date().toISOString()
          }, { onConflict: "user_id" });

        if (roleError) {
          console.error("Inspector appointment failed:", roleError.message);
          return send(500, { error: "Could not appoint inspector." });
        }
      }

      const { data: updated, error: updateError } = await supabase
        .from("inspector_applications")
        .update({
          application_status: body.status,
          review_notes: typeof body.review_notes === "string" ? body.review_notes.slice(0, 2000) : null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", applicationId)
        .select()
        .single();

      if (updateError) return send(500, { error: "Could not save application review." });

      const audited = await recordPlatformAudit("INSPECTOR_APPLICATION_REVIEWED", application.user_id, {
        application_id: applicationId,
        status: body.status
      });
      if (!audited) console.error("Inspector application review audit was not recorded.");

      return send(200, { application: updated });
    }
    // Platform overview.
    if (pathname === "/api/platform/overview" && req.method === "GET") {
      if (!isPlatformAdmin) return send(403, { error: "Platform administrator access required" });

      const tables = [
        "organisations",
        "asset_records",
        "profiles",
        "platform_user_roles",
        "platform_inspection_assignments"
      ];

      const results = await Promise.all(tables.map(table =>
        supabase.from(table).select("*", { count: "exact", head: true })
      ));

      const failed = results.find(result => result.error);
      if (failed) {
        console.error("Platform overview query failed:", failed.error.message);
        return send(503, { error: "Could not load platform statistics" });
      }

      return send(200, {
        organisations: results[0].count || 0,
        assets: results[1].count || 0,
        users: results[2].count || 0,
        platformAccounts: results[3].count || 0,
        inspectionAssignments: results[4].count || 0
      });
    }

    // List platform roles. Only the owner can manage appointments.
    if (pathname === "/api/platform/roles" && req.method === "GET") {
      if (!isPlatformAdmin) return send(403, { error: "Platform administrator access required" });

      const { data, error } = await supabase
        .from("platform_user_roles")
        .select("user_id, role, status, created_by, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (error) return send(500, { error: "Could not load platform roles" });

      const ids = (data || []).map(item => item.user_id);
      let profiles = [];
      if (ids.length) {
        const result = await supabase
          .from("profiles")
          .select("id, full_name, avatar_path, country, job_title")
          .in("id", ids);
        if (result.error) return send(500, { error: "Could not load platform user profiles" });
        profiles = result.data || [];
      }

      const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
      return send(200, (data || []).map(item => ({
        ...item,
        profile: profileMap.get(item.user_id) || null
      })));
    }

    // Appoint a platform admin or platform inspector by registered email.
    if (pathname === "/api/platform/roles" && req.method === "POST") {
      if (!isPlatformOwner) return send(403, { error: "Only the platform owner can appoint platform personnel" });

      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const role = body.role;

      if (!email || !["platform_admin", "platform_inspector"].includes(role)) {
        return send(400, { error: "Provide a registered email and a permitted platform role" });
      }

      const { data: usersData, error: usersError } =
        await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

      if (usersError) return send(503, { error: "Could not verify the account email" });

      const target = (usersData?.users || []).find(
        account => account.email?.toLowerCase() === email
      );

      if (!target) return send(404, { error: "No registered account was found for that email" });
      if (target.id === user.id) return send(400, { error: "You already have platform owner access" });

      const { data: targetProfile, error: profileError } = await supabase
        .from("profiles")
        .select("account_status")
        .eq("id", target.id)
        .maybeSingle();

      if (profileError) return send(500, { error: "Could not verify the target account" });
      if (!targetProfile || targetProfile.account_status !== "active") {
        return send(400, { error: "Only active AssetChain accounts can receive platform roles" });
      }

      const { data: savedRole, error } = await supabase
        .from("platform_user_roles")
        .upsert({
          user_id: target.id,
          role,
          status: "active",
          created_by: user.id,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" })
        .select("user_id, role, status, created_at, updated_at")
        .single();

      if (error) return send(500, { error: "Could not save the platform role" });

      const audited = await recordPlatformAudit("PLATFORM_ROLE_APPOINTED", target.id, {
        email,
        role
      });

      return send(200, { ...savedRole, email, auditRecorded: audited });
    }

    // Suspend, reinstate or revoke an existing platform role.
    const roleMatch = pathname.match(/^\/api\/platform\/roles\/([^/]+)$/);
    if (roleMatch && ["PATCH", "DELETE"].includes(req.method)) {
      if (!isPlatformOwner) return send(403, { error: "Only the platform owner can change platform roles" });

      const targetUserId = roleMatch[1];
      if (targetUserId === user.id) return send(400, { error: "You cannot change your own platform owner access" });

      if (req.method === "DELETE") {
        const { data: existing, error: lookupError } = await supabase
          .from("platform_user_roles")
          .select("role")
          .eq("user_id", targetUserId)
          .maybeSingle();

        if (lookupError) return send(500, { error: "Could not verify the platform role" });
        if (!existing) return send(404, { error: "Platform role not found" });
        if (existing.role === "platform_owner") return send(403, { error: "Platform owner access cannot be revoked here" });

        const { error } = await supabase
          .from("platform_user_roles")
          .delete()
          .eq("user_id", targetUserId);

        if (error) return send(500, { error: "Could not revoke platform access" });

        const audited = await recordPlatformAudit("PLATFORM_ROLE_REVOKED", targetUserId, {
          previousRole: existing.role
        });

        return send(200, { success: true, auditRecorded: audited });
      }

      if (!["active", "suspended"].includes(body.status)) {
        return send(400, { error: "Status must be active or suspended" });
      }

      const { data: existing, error: lookupError } = await supabase
        .from("platform_user_roles")
        .select("role, status")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (lookupError) return send(500, { error: "Could not verify the platform role" });
      if (!existing) return send(404, { error: "Platform role not found" });
      if (existing.role === "platform_owner") return send(403, { error: "Platform owner access cannot be suspended here" });

      const { data, error } = await supabase
        .from("platform_user_roles")
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq("user_id", targetUserId)
        .select("user_id, role, status")
        .single();

      if (error) return send(500, { error: "Could not update platform access" });

      const audited = await recordPlatformAudit("PLATFORM_ROLE_STATUS_CHANGED", targetUserId, {
        role: existing.role,
        previousStatus: existing.status,
        newStatus: body.status
      });

      return send(200, { ...data, auditRecorded: audited });
    }

    // Organisation oversight.
    if (pathname === "/api/platform/organisations" && req.method === "GET") {
      if (!isPlatformAdmin) return send(403, { error: "Platform administrator access required" });

      const { data, error } = await supabase
        .from("organisations")
        .select("id, legal_name, display_name, organisation_type, registration_number, country, address, website, contact_email, phone, verification_status, created_by, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (error) return send(500, { error: "Could not load organisations" });
      return send(200, data || []);
    }

    const organisationMatch = pathname.match(/^\/api\/platform\/organisations\/([^/]+)\/verification$/);
    if (organisationMatch && req.method === "PATCH") {
      if (!isPlatformAdmin) return send(403, { error: "Platform administrator access required" });

      const allowedStatuses = ["pending", "verified", "rejected", "needs_information"];
      if (!allowedStatuses.includes(body.status)) {
        return send(400, { error: "Invalid organisation verification status" });
      }

      const { data: previous, error: previousError } = await supabase
        .from("organisations")
        .select("verification_status")
        .eq("id", organisationMatch[1])
        .maybeSingle();

      if (previousError) return send(500, { error: "Could not load organisation" });
      if (!previous) return send(404, { error: "Organisation not found" });

      const { data, error } = await supabase
        .from("organisations")
        .update({
          verification_status: body.status,
          updated_at: new Date().toISOString()
        })
        .eq("id", organisationMatch[1])
        .select("id, legal_name, display_name, verification_status")
        .single();

      if (error) return send(500, { error: "Could not update organisation verification" });

      const audited = await recordPlatformAudit("ORGANISATION_VERIFICATION_CHANGED", null, {
        organisationId: organisationMatch[1],
        previousStatus: previous.verification_status,
        newStatus: body.status,
        note: typeof body.note === "string" ? body.note.slice(0, 1000) : ""
      });

      return send(200, { ...data, auditRecorded: audited });
    }

    // Platform inspection assignments.
    if (pathname === "/api/platform/inspections" && req.method === "GET") {
      if (!isPlatformAdmin && user.role !== "platform_inspector") {
        return send(403, { error: "Platform inspection access required" });
      }

      let query = supabase
        .from("platform_inspection_assignments")
        .select("id, asset_id, inspector_user_id, assigned_by, status, instructions, due_at, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (user.role === "platform_inspector") {
        query = query.eq("inspector_user_id", user.id);
      }

      const { data, error } = await query;
      if (error) return send(500, { error: "Could not load inspection assignments" });
      return send(200, data || []);
    }

    if (pathname === "/api/platform/inspections" && req.method === "POST") {
      if (!isPlatformAdmin) return send(403, { error: "Only platform administrators can assign inspections" });

      const { assetId, inspectorUserId, instructions, dueAt } = body;
      if (!assetId || !inspectorUserId) {
        return send(400, { error: "Asset and platform inspector are required" });
      }

      const { data: asset, error: assetError } = await supabase
        .from("asset_records")
        .select("id, name, passport_id")
        .eq("id", assetId)
        .maybeSingle();

      if (assetError) return send(500, { error: "Could not verify asset" });
      if (!asset) return send(404, { error: "Asset not found in the platform asset registry" });

      const { data: inspector, error: inspectorError } = await supabase
        .from("platform_user_roles")
        .select("role, status")
        .eq("user_id", inspectorUserId)
        .maybeSingle();

      if (inspectorError) return send(500, { error: "Could not verify inspector permissions" });
      if (!inspector || inspector.role !== "platform_inspector" || inspector.status !== "active") {
        return send(400, { error: "Select an active platform inspector" });
      }

      let parsedDueAt = null;
      if (dueAt) {
        const dueDate = new Date(dueAt);
        if (!Number.isFinite(dueDate.getTime())) {
          return send(400, { error: "Invalid inspection due date" });
        }
        parsedDueAt = dueDate.toISOString();
      }

      const { data, error } = await supabase
        .from("platform_inspection_assignments")
        .insert({
          asset_id: assetId,
          inspector_user_id: inspectorUserId,
          assigned_by: user.id,
          status: "assigned",
          instructions: typeof instructions === "string" ? instructions.slice(0, 3000) : null,
          due_at: parsedDueAt
        })
        .select()
        .single();

      if (error) return send(500, { error: "Could not create inspection assignment" });

      const audited = await recordPlatformAudit("PLATFORM_INSPECTION_ASSIGNED", inspectorUserId, {
        assignmentId: data.id,
        assetId,
        assetName: asset.name,
        passportId: asset.passport_id
      });

      return send(201, { ...data, asset, auditRecorded: audited });
    }

    const inspectionMatch = pathname.match(/^\/api\/platform\/inspections\/([^/]+)$/);
    if (inspectionMatch && req.method === "PATCH") {
      const assignmentId = inspectionMatch[1];
      const { data: assignment, error: assignmentError } = await supabase
        .from("platform_inspection_assignments")
        .select("id, inspector_user_id, status")
        .eq("id", assignmentId)
        .maybeSingle();

      if (assignmentError) return send(500, { error: "Could not load inspection assignment" });
      if (!assignment) return send(404, { error: "Inspection assignment not found" });

      const inspectorUpdate = user.role === "platform_inspector" &&
        assignment.inspector_user_id === user.id &&
        ["in_progress", "submitted"].includes(body.status);

      const adminUpdate = isPlatformAdmin &&
        ["reviewed", "cancelled"].includes(body.status);

      if (!inspectorUpdate && !adminUpdate) {
        return send(403, { error: "You are not permitted to make this inspection status change" });
      }

      const { data, error } = await supabase
        .from("platform_inspection_assignments")
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq("id", assignmentId)
        .select()
        .single();

      if (error) return send(500, { error: "Could not update inspection status" });

      const audited = await recordPlatformAudit("PLATFORM_INSPECTION_STATUS_CHANGED", assignment.inspector_user_id, {
        assignmentId,
        previousStatus: assignment.status,
        newStatus: body.status
      });

      return send(200, { ...data, auditRecorded: audited });
    }

    // Read-only audit history.
    if (pathname === "/api/platform/audit-logs" && req.method === "GET") {
      if (!isPlatformAdmin) return send(403, { error: "Platform administrator access required" });

      const limit = Math.min(Math.max(Number(requestUrl.searchParams.get("limit")) || 50, 1), 200);
      const { data, error } = await supabase
        .from("platform_audit_logs")
        .select("id, actor_user_id, action, target_user_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return send(500, { error: "Could not load audit history" });
      return send(200, data || []);
    }

    return send(404, { error: "Platform administration endpoint not found" });
  }
  // Marketplace: published listings are visible to authenticated users.
  if (req.url.startsWith("/api/marketplace/listings") && req.method === "GET") {
    if (!user) return send(401, { error: "Authentication required" });

    const { data: listings, error } = await supabase
      .from("marketplace_listings")
      .select("*")
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Marketplace listing read failed:", error.message);
      return send(503, { error: "Marketplace listings are temporarily unavailable" });
    }

    const ids = (listings || []).map(item => item.asset_id);
    let assetRows = [];

    if (ids.length) {
      const result = await supabase
        .from("asset_records")
        .select("id, passport_id, name, category, description, location, verification_status, record_hash, organisation_id")
        .in("id", ids);

      if (result.error) {
        return send(503, { error: "Could not load listing asset details" });
      }
      assetRows = result.data || [];
    }

    const assetMap = new Map(assetRows.map(item => [item.id, item]));
    return send(200, (listings || [])
      .filter(item => assetMap.has(item.asset_id))
      .map(item => ({ ...item, asset: assetMap.get(item.asset_id) })));
  }

  // Seller publishes an asset only after server-side ownership verification.
  if (req.url === "/api/marketplace/listings" && req.method === "POST") {
    if (!user) return send(401, { error: "Authentication required" });

    const { assetId, organisationId, listingType, askingPrice, currency, ownershipPercentage } = body;

    if (!assetId || !["full_sale", "fractional_sale"].includes(listingType)) {
      return send(400, { error: "Choose an asset and a valid listing type" });
    }

    const price = Number(askingPrice);
    const percentage = Number(ownershipPercentage ?? 100);

    if (!Number.isFinite(price) || price <= 0 ||
        !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      return send(400, { error: "Enter a valid positive price and ownership percentage" });
    }

    if (listingType === "full_sale" && percentage !== 100) {
      return send(400, { error: "A full-sale listing must represent 100%" });
    }

    const { data: assetRecord, error: assetError } = await supabase
      .from("asset_records")
      .select("id, owner_user_id, organisation_id")
      .eq("id", assetId)
      .maybeSingle();

    if (assetError) return send(503, { error: "Could not verify asset ownership" });
    if (!assetRecord) return send(404, { error: "Asset passport not found in marketplace records" });

    if (organisationId) {
      if (assetRecord.organisation_id !== organisationId) {
        return send(403, { error: "This asset is not registered to the selected organisation" });
      }

      const { data: membership, error: membershipError } = await supabase
        .from("organisation_members")
        .select("role, status")
        .eq("organisation_id", organisationId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError) return send(503, { error: "Could not verify organisation permissions" });

      if (!membership || membership.status !== "active" ||
          !["org_owner", "org_admin", "asset_manager"].includes(membership.role)) {
        return send(403, { error: "You are not authorised to publish for this organisation" });
      }
    } else {
      if (assetRecord.owner_user_id !== user.id || assetRecord.organisation_id) {
        return send(403, { error: "You are not authorised to publish this individual asset" });
      }
    }

    const { data: listing, error: listingError } = await supabase
      .from("marketplace_listings")
      .insert({
        asset_id: assetId,
        seller_id: user.id,
        organisation_id: organisationId || null,
        listing_type: listingType,
        ownership_percentage: percentage,
        asking_price: price,
        currency: String(currency || "NGN").toUpperCase(),
        status: "published",
        legal_review_status: "not_reviewed"
      })
      .select("*")
      .single();

    if (listingError) {
      console.error("Marketplace listing creation failed:", listingError.message);
      return send(503, { error: "Could not publish listing" });
    }

    return send(201, {
      message: "Listing published. Legal review has not been completed.",
      listing
    });
  }

  // Buyers can submit offers; no payment or escrow is initiated.
  if (req.url === "/api/marketplace/offers" && req.method === "POST") {
    if (!user) return send(401, { error: "Authentication required" });

    const amount = Number(body.offerAmount);
    if (!body.listingId || !Number.isFinite(amount) || amount <= 0) {
      return send(400, { error: "A listing and valid positive offer amount are required" });
    }

    const { data: listing, error: listingError } = await supabase
      .from("marketplace_listings")
      .select("id, seller_id, organisation_id, status")
      .eq("id", body.listingId)
      .maybeSingle();

    if (listingError) return send(503, { error: "Could not verify listing" });
    if (!listing || listing.status !== "published") {
      return send(404, { error: "Published listing not found" });
    }

    if (listing.seller_id === user.id) {
      return send(403, { error: "You cannot make an offer on your own listing" });
    }

    if (listing.organisation_id) {
      const { data: membership, error: membershipError } = await supabase
        .from("organisation_members")
        .select("status")
        .eq("organisation_id", listing.organisation_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError) return send(503, { error: "Could not verify buyer eligibility" });
      if (membership?.status === "active") {
        return send(403, { error: "Organisation members cannot make offers on their own organisation's listing" });
      }
    }

    const { data: offer, error: offerError } = await supabase
      .from("marketplace_offers")
      .insert({
        listing_id: listing.id,
        buyer_id: user.id,
        offer_amount: amount,
        offered_percentage: Number(body.offeredPercentage || 100),
        status: "pending"
      })
      .select("*")
      .single();

    if (offerError) {
      console.error("Marketplace offer creation failed:", offerError.message);
      return send(503, { error: "Could not submit offer" });
    }

    return send(201, {
      message: "Offer submitted. No payment has been made.",
      offer
    });
  }

  // Upload supporting evidence for authenticated accounts.
  if (req.url === "/api/uploads" && req.method === "POST") {
    if (!user) {
      return send(401, { error: "Authentication required" });
    }

    if (!hasRole(user, ["user", "owner", "admin"])) {
      return send(403, { error: "You cannot upload asset evidence" });
    }

    try {
      const files = await receiveUploads(req, user.id);
      return send(201, {
        message: "Files uploaded successfully",
        files
      });
    } catch (error) {
      return send(400, {
        error: error.message || "Upload failed"
      });
    }
  }
  if (req.url === "/api/health") {
    return send(200, { status: "ok", service: "AssetChain API" });
  }

  if (req.url === "/api/assets" && req.method === "GET") {
    if (!user) return send(401, { error: "Authentication required" });

    if (user.role === "inspector") {
      const assigned = assets
        .filter(a => a.inspector?.id === user.id)
        .map(a => ({
          id: a.id,
          passportId: a.passportId,
          name: a.name,
          category: a.category,
          location: a.location,
          description: a.description,
          status: a.status,
          inspector: a.inspector,
          inspectionSubmitted: (a.inspectionReports || []).some(
            report => report.inspectorId === user.id
          )
        }));

      return send(200, assigned);
    }

    if (user.role === "user") {
      return send(200, assets.filter(a => a.ownerId === user.id));
    }

    if (!hasRole(user, ["owner", "admin"])) {
      return send(403, { error: "Access denied" });
    }

    return send(200, assets);
  }

  if (req.url.startsWith("/api/blockchain-events") && req.method === "GET") {
    if (!user) return send(401, { error: "Authentication required" });
    if (!hasRole(user, ["owner", "admin", "user"])) {
      return send(403, { error: "Access denied" });
    }

    const requestUrl = new URL(req.url, "http://127.0.0.1:4000");
    const passportId = requestUrl.searchParams.get("passportId");

    if (user.role === "user" &&
        !assets.some(a => a.passportId === passportId && a.ownerId === user.id)) {
      return send(403, { error: "Access denied" });
    }

    return send(200, getAnchoringEvents(passportId || undefined));
  }

  if (req.url === "/api/assets" && req.method === "POST") {
    if (!user) {
      return send(401, { error: "Authentication required" });
    }

    if (!hasRole(user, ["user", "owner", "admin"])) {
      return send(403, { error: "You cannot register assets" });
    }

    if (!body.name || !body.category || !body.location) {
      return send(400, { error: "Name, category and location are required" });
    }

    const documents = Array.isArray(body.documents) ? body.documents : [];

    // Validate document fingerprints.
    for (const doc of documents) {
      if (!doc || !/^[0-9a-fA-F]{64}$/.test(doc.hash || "")) {
        return send(400, {
          error: "A document has an invalid SHA-256 fingerprint."
        });
      }
    }

    // Detect duplicate evidence without automatically rejecting reuse.
    const duplicateWarnings = [];

    for (const doc of documents) {
      const hash = doc.hash.toLowerCase();

      const matches = assets.flatMap(asset =>
        (asset.documents || [])
          .filter(existing =>
            existing.hash?.toLowerCase() === hash
          )
          .map(existing => ({
            passportId: asset.passportId,
            assetName: asset.name,
            documentName: existing.name || "Existing document"
          }))
      );

      if (matches.length > 0) {
        duplicateWarnings.push({
          hash,
          documentName: doc.name || "Uploaded document",
          message: "Matching evidence fingerprint found in existing records.",
          matches
        });
      }
    }

    const asset = {
      id: randomUUID(),
      ownerId: user.id,
      passportId: "AC-" + Date.now().toString(36).toUpperCase(),
      name: body.name,
      category: body.category,
      location: body.location,
      description: body.description || "",
      documents,
      status: "Inspection requested",
      inspector: null,
      readings: [],
      inspection: null,
      createdAt: new Date().toISOString()
    };

    const uploadedDocuments = attachUploads(
      body.storageIds || [],
      asset.id,
      user.id
    );

    asset.documents.push(...uploadedDocuments);

    for (const doc of uploadedDocuments) {
      if (doc.duplicateEvidence) {
        duplicateWarnings.push({
          hash: doc.hash,
          documentName: doc.name,
          message: "Matching evidence fingerprint found in existing uploads. Review required."
        });
      }
    }

    asset.duplicateWarnings = duplicateWarnings;

    asset.recordHash = createHash("sha256")
      .update(JSON.stringify({
        id: asset.id,
        name: asset.name,
        category: asset.category,
        location: asset.location,
        documents: asset.documents
      }))
      .digest("hex");

    // Persist the passport in Supabase so marketplace listings can reference it.
    let organisationId = body.organisationId || null;

    if (organisationId) {
      const { data: membership, error: membershipError } = await supabase
        .from("organisation_members")
        .select("role, status")
        .eq("organisation_id", organisationId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipError) {
        return send(503, { error: "Could not verify organisation membership" });
      }

      const allowedRoles = ["org_owner", "org_admin", "asset_manager"];
      if (!membership || membership.status !== "active" ||
          !allowedRoles.includes(membership.role)) {
        return send(403, { error: "You cannot register assets for this organisation" });
      }
    }

    asset.organisationId = organisationId;

    const { error: recordError } = await supabase
      .from("asset_records")
      .insert({
        id: asset.id,
        passport_id: asset.passportId,
        name: asset.name,
        category: asset.category,
        description: asset.description,
        location: asset.location,
        owner_user_id: organisationId ? null : user.id,
        organisation_id: organisationId,
        verification_status: "submitted",
        record_hash: asset.recordHash
      });

    if (recordError) {
      console.error("Supabase asset record creation failed:", recordError.message);
      return send(503, {
        error: "Passport could not be synchronised to the marketplace database. Please try again."
      });
    }

    assets.unshift(asset);
    saveAssets();

    enqueueCriticalEvent({
      passportId: asset.passportId,
      eventType: "ASSET_REGISTERED",
      data: { assetId: asset.id, recordHash: asset.recordHash }
    });

    return send(201, asset);
  }

  // Secure access to uploaded asset evidence.
  const fileMatch = req.url.match(/^\/api\/files\/([a-f0-9-]+)$/i);

  if (fileMatch && req.method === "GET") {
    if (!user) {
      return send(401, { error: "Authentication required" });
    }

    const file = getStoredFile(fileMatch[1]);

    if (!file || !file.assetId) {
      return send(404, { error: "File not found" });
    }

    const asset = assets.find(a => a.id === file.assetId);

    if (!asset) {
      return send(404, { error: "Associated asset not found" });
    }

    const authorized =
      hasRole(user, ["owner", "admin"]) ||
      asset.ownerId === user.id ||
      (user.role === "inspector" && asset.inspector?.id === user.id);

    if (!authorized) {
      return send(403, { error: "You cannot access this file" });
    }

    try {
      const fileContents = readFileSync(file.path);

      res.writeHead(200, {
        "Content-Type": file.mimeType,
        "Content-Length": fileContents.length,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store"
      });

      return res.end(fileContents);
    } catch {
      return send(404, { error: "Stored file is unavailable" });
    }
  }

  const match = req.url.match(/^\/api\/assets\/([^/]+)\/(assign|inspect)$/);

  if (match) {
    if (!user) return send(401, { error: "Authentication required" });

    const asset = assets.find(a => a.id === match[1]);
    if (!asset) return send(404, { error: "Asset not found" });

    // Assignment is restricted to platform owner and administrators.
    if (match[2] === "assign") {
      if (!hasRole(user, ["owner", "admin"])) {
        return send(403, { error: "Only authorized administrators can assign inspectors" });
      }

      const inspectorEmail = process.env.INSPECTOR_EMAIL?.toLowerCase();

      if (!inspectorEmail ||
          body.inspectorEmail?.trim().toLowerCase() !== inspectorEmail) {
        return send(400, { error: "Select the configured inspector account" });
      }

      asset.inspector = {
        id: "INSPECTOR-001",
        email: inspectorEmail,
        status: "Assigned",
        assignedBy: user.id,
        assignedAt: new Date().toISOString()
      };

      asset.status = "Inspector assigned";
      saveAssets();

      enqueueCriticalEvent({
        passportId: asset.passportId,
        eventType: "INSPECTOR_ASSIGNED",
        data: { assetId: asset.id, inspectorId: asset.inspector.id }
      });

      return send(200, {
        id: asset.id,
        passportId: asset.passportId,
        status: asset.status,
        inspector: asset.inspector
      });
    }

    // Only the authenticated, assigned inspector can submit findings.
    if (user.role !== "inspector") {
      return send(403, { error: "Only inspectors can submit inspection reports" });
    }

    if (asset.inspector?.id !== user.id) {
      return send(403, { error: "This asset is not assigned to your inspector account" });
    }

    if (!Array.isArray(body.findings) || body.findings.length === 0) {
      return send(400, { error: "Actual inspection findings are required" });
    }

    if (body.readings !== undefined || body.sensorSnapshot !== undefined) {
      return send(400, { error: "Sensor readings must not be submitted by inspectors" });
    }

    asset.inspectionReports ||= [];

    const report = {
      id: "INSP-" + randomUUID(),
      version: asset.inspectionReports.length + 1,
      inspectorId: user.id,
      inspectorEmail: user.email,
      findings: body.findings,
      condition: body.condition || "",
      measurements: body.measurements || {},
      notes: body.notes || "",
      source: "inspector-submitted",
      submittedAt: new Date().toISOString()
    };

    report.hash = createHash("sha256")
      .update(JSON.stringify(report))
      .digest("hex");

    // Append a new version. Never overwrite previous submissions.
    asset.inspectionReports.push(report);
    asset.inspection = report;
    asset.status = "Inspection submitted Ã¢â‚¬â€ pending review";

    saveAssets();

    enqueueCriticalEvent({
      passportId: asset.passportId,
      eventType: "INSPECTION_COMPLETED",
      data: {
        assetId: asset.id,
        reportHash: report.hash,
        reportVersion: report.version
      }
    });

    return send(201, {
      message: "Inspection report submitted",
      report
    });
  }
  send(404, { error: "Route not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AssetChain API running at http://127.0.0.1:${port}`);
  console.log(`${assets.length} saved asset(s) loaded.`);
  startAnchoringWorker();
});



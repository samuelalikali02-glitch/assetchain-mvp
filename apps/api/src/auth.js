import {
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

const SESSION_DURATION = 8 * 60 * 60 * 1000;
const sessions = new Map();

const accountDefinitions = [
  { role: "owner", id: "OWNER-001", email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD },
  { role: "admin", id: "ADMIN-001", email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  { role: "inspector", id: "INSPECTOR-001", email: process.env.INSPECTOR_EMAIL, password: process.env.INSPECTOR_PASSWORD },
  { role: "user", id: "USER-001", email: process.env.USER_EMAIL, password: process.env.USER_PASSWORD }
];

const accounts = new Map();

for (const account of accountDefinitions) {
  if (!account.email || !account.password) {
    throw new Error(`Missing ${account.role} login configuration in .env`);
  }

  const salt = randomBytes(16);
  const passwordHash = scryptSync(account.password, salt, 64);

  accounts.set(account.email.toLowerCase(), {
    id: account.id,
    role: account.role,
    email: account.email.toLowerCase(),
    salt,
    passwordHash
  });
}

export function login(email, password) {
  if (typeof email !== "string" || typeof password !== "string") {
    return null;
  }

  const account = accounts.get(email.trim().toLowerCase());
  if (!account) return null;

  const attemptedHash = scryptSync(password, account.salt, 64);

  if (!timingSafeEqual(attemptedHash, account.passwordHash)) {
    return null;
  }

  const token = randomBytes(32).toString("hex");

  sessions.set(token, {
    userId: account.id,
    role: account.role,
    email: account.email,
    expiresAt: Date.now() + SESSION_DURATION
  });

  return {
    token,
    user: {
      id: account.id,
      role: account.role,
      email: account.email
    }
  };
}

export function authenticate(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+([a-f0-9]{64})$/i);

  if (!match) return null;

  const session = sessions.get(match[1]);

  if (!session) return null;

  if (Date.now() >= session.expiresAt) {
    sessions.delete(match[1]);
    return null;
  }

  return {
    id: session.userId,
    role: session.role,
    email: session.email
  };
}

export function logout(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+([a-f0-9]{64})$/i);

  if (match) sessions.delete(match[1]);
}

export function hasRole(user, allowedRoles) {
  return Boolean(user && allowedRoles.includes(user.role));
}

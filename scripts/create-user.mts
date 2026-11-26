/**
 * Creates someone who can sign in, and the farm the first time.
 *
 *   yarn user:create --email ada@fowlex.com --name "Ada Obi" [--role owner] [--password ...]
 *
 * Reads MONGODB_URI from .env.local. Without --password, one is generated and printed once.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import { ROLES, type Role } from "../src/lib/auth/permissions";
import { FarmModel } from "../src/models/farm";
import { UserModel } from "../src/models/user";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Fine if the variables come from the environment instead.
}

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "owner" },
    password: { type: "string" },
  },
});

const role = values.role as Role;
if (!values.email || !values.name || !ROLES.includes(role)) {
  console.error(
    `Usage: yarn user:create --email <email> --name "<name>" [--role ${ROLES.join("|")}] [--password <pw>]`,
  );
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set. Add it to .env.local (run `yarn db` for a local one).");
  process.exit(1);
}

const password = values.password ?? randomBytes(9).toString("base64url");
if (password.length < 8) {
  console.error("Use a password of at least 8 characters.");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
const farm = (await FarmModel.findOne()) ?? (await FarmModel.create({ name: "Fowlex Farms" }));
const user = await UserModel.create({
  farmId: farm._id,
  email: values.email,
  name: values.name,
  role,
  passwordHash: await bcrypt.hash(password, 12),
}).catch(async (error: { code?: number }) => {
  await mongoose.disconnect();
  if (error.code === 11000) {
    console.error(`Someone with the email ${values.email} already exists.`);
    process.exit(1);
  }
  throw error;
});
await mongoose.disconnect();

console.log(`Created ${user.role} ${user.email} on ${farm.name}.`);
if (!values.password) console.log(`Password: ${password}  (shown once; change it with "Forgot password?")`);

import "server-only";

import { createHash, randomBytes } from "node:crypto";

/** A random, URL-safe token for a one-time link (reset, invite): 256 bits. */
export const newToken = () => randomBytes(32).toString("base64url");

/** What is stored instead of the token, so the database alone can't be used to follow a link. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

import "server-only";

import bcrypt from "bcryptjs";

const COST = 12;

export const hashPassword = (password: string) => bcrypt.hash(password, COST);

/** A hash of nothing in particular, compared against when the email is unknown, so a wrong email
 * takes as long to refuse as a wrong password and response times don't reveal who has an account. */
const DECOY = bcrypt.hashSync("fowlex-decoy-password", COST);

/** False for a missing hash (an invited user who hasn't set one), even if the decoy were guessed. */
export async function verifyPassword(password: string, hash: string | null | undefined) {
  const matches = await bcrypt.compare(password, hash ?? DECOY);
  return Boolean(hash) && matches;
}

/** Shared domain types — expanded in S2/S3. */

export interface UsernameRules {
  min: number;
  max: number;
  pattern: string;
}

export const USERNAME_RULES: UsernameRules = {
  min: 3,
  max: 32,
  pattern: "^[a-z0-9][a-z0-9._-]{2,31}$",
};

export function isValidUsername(username: string): boolean {
  return new RegExp(USERNAME_RULES.pattern).test(username);
}

import { describe, expect, it } from "vitest";
import {
  detectCsvSource,
  parseAppleCsv,
  parseGoogleCsv,
  parsePasswordCsv,
} from "./index";

const google = `name,url,username,password,note
GitHub,https://github.com,alice,s3cret,work
`;

const apple = `Title,URL,Username,Password,Notes,OTPAuth
iCloud,https://apple.com,bob,p@ss,note,
`;

describe("@localvault/importers S3", () => {
  it("detects sources", () => {
    expect(detectCsvSource("name,url,username,password,note")).toBe("google");
    expect(detectCsvSource("Title,URL,Username,Password,Notes,OTPAuth")).toBe("apple");
  });

  it("parses google", () => {
    const rows = parseGoogleCsv(google);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.username).toBe("alice");
    expect(rows[0]!.password).toBe("s3cret");
  });

  it("parses apple", () => {
    const rows = parseAppleCsv(apple);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("iCloud");
  });

  it("parsePasswordCsv", () => {
    const r = parsePasswordCsv(google);
    expect(r.source).toBe("google");
    expect(r.rows).toHaveLength(1);
  });
});

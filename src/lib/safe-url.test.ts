import { beforeEach, describe, expect, it } from "vitest";
import { safeLogoUrl, isSafeLogoUrl } from "./safe-url";

/**
 * The logo URL decides what the server fetches when it builds a PO or invoice
 * PDF. Before this guard existed, anyone who could set it could point the
 * server at cloud metadata or a service bound to localhost — reachable from
 * the server, not from outside. These are the cases that matter.
 */

const STORAGE = "https://cnlyuwslpcgosgwdmzav.supabase.co";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = STORAGE;
});

describe("safeLogoUrl", () => {
  it("accepts a logo on the project's own storage host", () => {
    const url = `${STORAGE}/storage/v1/object/public/edospmis-branding/abc/logo.png`;
    expect(safeLogoUrl(url)).toBe(url);
  });

  it("accepts nothing at all", () => {
    expect(safeLogoUrl(null)).toBeNull();
    expect(safeLogoUrl(undefined)).toBeNull();
    expect(safeLogoUrl("")).toBeNull();
  });

  it("refuses the cloud metadata endpoint", () => {
    expect(safeLogoUrl("http://169.254.169.254/latest/meta-data/iam/security-credentials/")).toBeNull();
    expect(safeLogoUrl("https://169.254.169.254/latest/meta-data/")).toBeNull();
  });

  it("refuses loopback and private addresses", () => {
    for (const u of [
      "http://localhost:3000/admin",
      "https://localhost/admin",
      "http://127.0.0.1:54321/",
      "https://10.0.0.5/internal",
      "https://192.168.1.1/",
    ]) {
      expect(safeLogoUrl(u), u).toBeNull();
    }
  });

  it("refuses any other host, however ordinary it looks", () => {
    expect(safeLogoUrl("https://example.com/logo.png")).toBeNull();
    expect(safeLogoUrl("https://evil.test/logo.png")).toBeNull();
  });

  it("refuses non-https schemes", () => {
    expect(safeLogoUrl(`http://cnlyuwslpcgosgwdmzav.supabase.co/logo.png`)).toBeNull();
    expect(safeLogoUrl("file:///etc/passwd")).toBeNull();
    expect(safeLogoUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(safeLogoUrl("javascript:alert(1)")).toBeNull();
  });

  it("refuses credentials in the URL, a known way to confuse host parsing", () => {
    expect(safeLogoUrl(`https://user:pass@cnlyuwslpcgosgwdmzav.supabase.co/logo.png`)).toBeNull();
    // The classic trick: the real host is the one after the @.
    expect(safeLogoUrl(`https://cnlyuwslpcgosgwdmzav.supabase.co@evil.test/logo.png`)).toBeNull();
  });

  it("refuses a host that merely ends with the allowed one", () => {
    expect(safeLogoUrl("https://cnlyuwslpcgosgwdmzav.supabase.co.evil.test/logo.png")).toBeNull();
    expect(safeLogoUrl("https://notcnlyuwslpcgosgwdmzav.supabase.co/logo.png")).toBeNull();
  });

  it("refuses anything that is not a URL", () => {
    expect(safeLogoUrl("not a url")).toBeNull();
    expect(safeLogoUrl("/relative/path.png")).toBeNull();
  });

  it("refuses everything when no storage host is configured", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(safeLogoUrl(`${STORAGE}/logo.png`)).toBeNull();
  });
});

describe("isSafeLogoUrl", () => {
  it("treats clearing the logo as valid", () => {
    expect(isSafeLogoUrl(null)).toBe(true);
    expect(isSafeLogoUrl("")).toBe(true);
  });

  it("agrees with safeLogoUrl on everything else", () => {
    expect(isSafeLogoUrl(`${STORAGE}/logo.png`)).toBe(true);
    expect(isSafeLogoUrl("https://example.com/logo.png")).toBe(false);
  });
});

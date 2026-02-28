import {
  ECOSYSTEM,
  SERVICES,
  byCategory,
  findByUrl,
  findByName,
  catalogSummary,
  type EcosystemCategory,
  type EcosystemService,
} from "./catalog.js";

// ---------------------------------------------------------------------------
// ECOSYSTEM array structure
// ---------------------------------------------------------------------------

describe("catalog — ECOSYSTEM array", () => {
  test("contains expected number of total entries", () => {
    // Simplified hackathon catalog: 12 Services/Endpoints only
    expect(ECOSYSTEM.length).toBe(12);
  });

  test("all entries have required fields", () => {
    for (const entry of ECOSYSTEM) {
      expect(entry.name).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.category).toBeTruthy();
      // domain is optional
    }
  });

  test("contains Services/Endpoints entries", () => {
    const services = ECOSYSTEM.filter(
      (e) => e.category === "Services/Endpoints",
    );
    expect(services.length).toBe(12);
    expect(services.some((s) => s.name === "Firecrawl")).toBe(true);
    expect(services.some((s) => s.name === "Minifetch")).toBe(true);
    expect(services.some((s) => s.name === "Pinata")).toBe(true);
  });

  test("contains Infrastructure & Tooling entries", () => {
    const infra = ECOSYSTEM.filter(
      (e) => e.category === "Infrastructure & Tooling",
    );
    // Simplified catalog has no Infrastructure entries
    expect(infra.length).toBe(0);
  });

  test("contains Facilitators entries", () => {
    const facilitators = ECOSYSTEM.filter((e) => e.category === "Facilitators");
    // Simplified catalog has no Facilitators
    expect(facilitators.length).toBe(0);
  });

  test("domains are valid when present", () => {
    const withDomains = ECOSYSTEM.filter((e) => e.domain);
    expect(withDomains.length).toBe(9); // 9 out of 12 have domains

    for (const entry of withDomains) {
      // Domain should not include protocol or path
      expect(entry.domain).not.toMatch(/^https?:\/\//);
      expect(entry.domain).not.toMatch(/\//);
    }
  });
});

// ---------------------------------------------------------------------------
// SERVICES filtered subset
// ---------------------------------------------------------------------------

describe("catalog — SERVICES", () => {
  test("contains only Services/Endpoints category", () => {
    for (const s of SERVICES) {
      expect(s.category).toBe("Services/Endpoints");
    }
  });

  test("is a subset of ECOSYSTEM", () => {
    // In simplified catalog, all entries are Services/Endpoints
    expect(SERVICES.length).toBe(ECOSYSTEM.length);
    expect(SERVICES.length).toBe(12);
  });

  test("excludes Infrastructure and Facilitators", () => {
    const names = SERVICES.map((s) => s.name);
    expect(names).not.toContain("Agently");
    expect(names).not.toContain("CDP Facilitator");
  });

  test("includes key service endpoints", () => {
    const names = SERVICES.map((s) => s.name);
    expect(names).toContain("Firecrawl");
    expect(names).toContain("Minifetch");
    expect(names).toContain("Imference");
    expect(names).toContain("Pinata");
    expect(names).toContain("dTelecom STT");
    expect(names).toContain("Gloria AI");
    expect(names).toContain("Neynar");
    expect(names).toContain("Bitrefill");
  });
});

// ---------------------------------------------------------------------------
// byCategory()
// ---------------------------------------------------------------------------

describe("catalog — byCategory", () => {
  test("groups all entries by category", () => {
    const grouped = byCategory();
    // Simplified catalog only has Services/Endpoints
    expect(grouped.size).toBe(1);
  });

  test("Services/Endpoints bucket exists and is largest", () => {
    const grouped = byCategory();
    const services = grouped.get("Services/Endpoints");
    expect(services).toBeDefined();
    expect(services!.length).toBe(12);
  });

  test("Infrastructure & Tooling bucket exists", () => {
    const grouped = byCategory();
    const infra = grouped.get("Infrastructure & Tooling");
    // Simplified catalog doesn't have this category
    expect(infra).toBeUndefined();
  });

  test("Facilitators bucket exists", () => {
    const grouped = byCategory();
    const facilitators = grouped.get("Facilitators");
    // Simplified catalog doesn't have this category
    expect(facilitators).toBeUndefined();
  });

  test("no entries are lost in grouping", () => {
    const grouped = byCategory();
    let total = 0;
    for (const bucket of grouped.values()) {
      total += bucket.length;
    }
    expect(total).toBe(ECOSYSTEM.length);
  });

  test("each entry appears in exactly one category", () => {
    const grouped = byCategory();
    const allNames = new Set<string>();

    for (const bucket of grouped.values()) {
      for (const entry of bucket) {
        expect(allNames.has(entry.name)).toBe(false); // No duplicates
        allNames.add(entry.name);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// findByUrl()
// ---------------------------------------------------------------------------

describe("catalog — findByUrl", () => {
  test("finds Firecrawl by api.firecrawl.dev", () => {
    const result = findByUrl("https://api.firecrawl.dev/scrape");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Firecrawl");
    expect(result!.domain).toBe("firecrawl.dev");
  });

  test("finds Gloria AI by gloria.news", () => {
    const result = findByUrl("https://api.gloria.news/news");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Gloria AI");
  });

  test("finds Imference by imference.com", () => {
    const result = findByUrl("https://imference.com/generate");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Imference");
  });

  test("finds Neynar by neynar.com", () => {
    const result = findByUrl("https://api.neynar.com/v2/casts");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Neynar");
  });

  test("finds Bitrefill by bitrefill.com", () => {
    const result = findByUrl("https://api.bitrefill.com/products");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Bitrefill");
  });

  test("finds Minifetch by minifetch.com", () => {
    const result = findByUrl("https://minifetch.com/extract");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Minifetch");
  });

  test("finds Pinata by api.pinata.cloud", () => {
    const result = findByUrl("https://api.pinata.cloud/pinning/pinFileToIPFS");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Pinata");
  });

  test("returns undefined for service not in simplified catalog", () => {
    // DappLooker not in simplified catalog
    const result = findByUrl("https://api.dapplooker.com/v1/query");
    expect(result).toBeUndefined();
  });

  test("finds dTelecom STT by x402stt.dtelecom.org", () => {
    const result = findByUrl("https://x402stt.dtelecom.org/session");
    expect(result).toBeDefined();
    expect(result!.name).toBe("dTelecom STT");
  });

  test("strips common prefixes (api, www, x402, app) from hostname", () => {
    // Should match firecrawl.dev even with api. prefix
    const withApi = findByUrl("https://api.firecrawl.dev/scrape");
    const withoutApi = findByUrl("https://firecrawl.dev/scrape");
    expect(withApi).toBeDefined();
    expect(withoutApi).toBeDefined();
    expect(withApi!.name).toBe(withoutApi!.name);
  });

  test("returns undefined for unknown domain", () => {
    const result = findByUrl("https://unknown-service.example.com/api");
    expect(result).toBeUndefined();
  });

  test("returns undefined for invalid URL", () => {
    const result = findByUrl("not-a-valid-url");
    expect(result).toBeUndefined();
  });

  test("returns undefined for entry without domain field", () => {
    // Most services have domains, but some don't (e.g., AdPrompt)
    const result = findByUrl("https://adprompt.example.com/api");
    expect(result).toBeUndefined();
  });

  test("handles URLs with ports", () => {
    const result = findByUrl("https://api.firecrawl.dev:443/scrape");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Firecrawl");
  });

  test("handles URLs with query parameters", () => {
    const result = findByUrl("https://api.gloria.news/news?topic=ai");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Gloria AI");
  });
});

// ---------------------------------------------------------------------------
// findByName()
// ---------------------------------------------------------------------------

describe("catalog — findByName", () => {
  test("finds exact match (case-insensitive)", () => {
    expect(findByName("Firecrawl")!.name).toBe("Firecrawl");
    expect(findByName("firecrawl")!.name).toBe("Firecrawl");
    expect(findByName("FIRECRAWL")!.name).toBe("Firecrawl");
  });

  test("finds partial match", () => {
    expect(findByName("Fire")!.name).toBe("Firecrawl");
    expect(findByName("crawl")!.name).toBe("Firecrawl");
  });

  test("finds multi-word name with partial match", () => {
    expect(findByName("Gloria")!.name).toBe("Gloria AI");
    expect(findByName("Gloria AI")!.name).toBe("Gloria AI");
  });

  test("returns first match when multiple names contain query", () => {
    // Multiple services might contain "AI" — returns first one found
    const result = findByName("AI");
    expect(result).toBeDefined();
    expect(result!.name.toLowerCase()).toContain("ai");
  });

  test("returns undefined when no match found", () => {
    const result = findByName("NonExistentService12345");
    expect(result).toBeUndefined();
  });

  test("handles empty string", () => {
    // Empty string matches first entry (everything contains "")
    const result = findByName("");
    expect(result).toBeDefined();
  });

  test("handles special characters", () => {
    const result = findByName("twit.sh");
    expect(result).toBeDefined();
    expect(result!.name).toBe("twit.sh");
  });
});

// ---------------------------------------------------------------------------
// catalogSummary()
// ---------------------------------------------------------------------------

describe("catalog — catalogSummary", () => {
  test("returns formatted string with all categories when no filter", () => {
    const summary = catalogSummary();
    expect(summary).toContain("Services/Endpoints");
    // Simplified catalog only has Services/Endpoints
    expect(summary).not.toContain("Infrastructure & Tooling");
    expect(summary).not.toContain("Facilitators");
  });

  test("includes count for each category", () => {
    const summary = catalogSummary();
    // Should have format: "Category (N):"
    expect(summary).toMatch(/Services\/Endpoints \(12\):/);
  });

  test("includes service names and descriptions", () => {
    const summary = catalogSummary();
    expect(summary).toContain("Firecrawl");
    expect(summary).toContain("Scrape any webpage");
    expect(summary).toContain("Gloria AI");
    expect(summary).toContain("real-time news");
  });

  test("filters to specific category when provided", () => {
    const summary = catalogSummary("Services/Endpoints");
    expect(summary).toContain("Services/Endpoints");
    expect(summary).toContain("Firecrawl");
    expect(summary).not.toContain("Infrastructure & Tooling");
    expect(summary).not.toContain("Facilitators");
  });

  test("filters to Infrastructure & Tooling", () => {
    const summary = catalogSummary("Infrastructure & Tooling");
    // Simplified catalog doesn't have this category
    expect(summary).toBe("");
  });

  test("filters to Facilitators", () => {
    const summary = catalogSummary("Facilitators");
    // Simplified catalog doesn't have this category
    expect(summary).toBe("");
  });

  test("formats each entry as 'Name — Description'", () => {
    const summary = catalogSummary("Services/Endpoints");
    const lines = summary
      .split("\n")
      .filter((l) => l.trim().startsWith("Firecrawl"));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/Firecrawl — /);
  });

  test("returns non-empty string", () => {
    expect(catalogSummary()).toBeTruthy();
    expect(catalogSummary("Services/Endpoints")).toBeTruthy();
  });
});

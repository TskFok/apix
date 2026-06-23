import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflow = parse(
  readFileSync(
    path.join(process.cwd(), ".github/workflows/release.yml"),
    "utf8",
  ),
);

describe("release workflow", () => {
  it("uses conventional-changelog release notes grouped by commit type", () => {
    const releaseSteps = workflow.jobs.release.steps;
    const generateNotesStep = releaseSteps.find(
      (step) => step.name === "Generate release notes",
    );
    const createReleaseStep = releaseSteps.find(
      (step) => step.name === "Create tag and release",
    );

    expect(generateNotesStep?.run).toContain(
      "node scripts/generate-release-notes.mjs --output release-notes.md --tag",
    );
    expect(createReleaseStep?.run).toContain("gh release create");
    expect(createReleaseStep?.run).toContain("--notes-file release-notes.md");
    expect(createReleaseStep?.run).not.toContain("--generate-notes");
  });
});

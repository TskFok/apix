import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CHANGELOG_COMMIT_TYPES,
  isReleaseVersionCommit,
  resolveReleaseTagRange,
} from "./changelog-config.mjs";
import {
  generateReleaseNotes,
  hasGroupedSections,
  normalizeReleaseNotes,
  parseReleaseNotesArgs,
} from "./generate-release-notes.mjs";

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function createTempGitRepo(commits) {
  const dir = mkdtempSync(path.join(tmpdir(), "apix-changelog-"));
  tempDirs.push(dir);

  const runGit = (args) => {
    execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  };

  runGit(["init"]);
  runGit(["config", "user.email", "test@example.com"]);
  runGit(["config", "user.name", "Test User"]);
  runGit(["remote", "add", "origin", "https://github.com/example/apix.git"]);

  for (const message of commits) {
    writeFileSync(path.join(dir, "README.md"), `${message}\n`, "utf8");
    runGit(["add", "README.md"]);
    runGit(["commit", "-m", message]);
  }

  return dir;
}

describe("changelog-config", () => {
  it("defines all project commit types with sections", () => {
    expect(CHANGELOG_COMMIT_TYPES.map((entry) => entry.type)).toEqual([
      "feat",
      "fix",
      "refactor",
      "docs",
      "test",
      "build",
      "ci",
      "chore",
    ]);
  });

  it("detects release version commits", () => {
    expect(
      isReleaseVersionCommit({ type: "chore", subject: "release v0.2.0" }),
    ).toBe(true);
    expect(
      isReleaseVersionCommit({ type: "chore", subject: "update lockfile" }),
    ).toBe(false);
  });

  it("resolves the commit range between release tags", async () => {
    const cwd = createTempGitRepo(["feat: initial release"]);
    execFileSync("git", ["tag", "-a", "v1.0.0", "-m", "v1.0.0"], { cwd });
    writeFileSync(path.join(cwd, "README.md"), "next\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd });
    execFileSync("git", ["commit", "-m", "fix: patch release"], { cwd });
    execFileSync("git", ["tag", "-a", "v1.1.0", "-m", "v1.1.0"], { cwd });

    await expect(resolveReleaseTagRange(cwd, "v1.1.0")).resolves.toEqual({
      currentTag: "v1.1.0",
      previousTag: "v1.0.0",
      version: "1.1.0",
    });
  });
});

describe("generate-release-notes helpers", () => {
  it("parses CLI args", () => {
    expect(
      parseReleaseNotesArgs([
        "--output",
        "notes.md",
        "--release-count",
        "2",
        "--tag-prefix",
        "v",
      ]),
    ).toEqual({
      output: "notes.md",
      tag: undefined,
      releaseCount: 2,
      tagPrefix: "v",
    });
  });

  it("uses fallback notes when no grouped sections exist", () => {
    expect(normalizeReleaseNotes("## [1.0.0](link) (2026-01-01)\n")).toContain(
      "No conventional commit entries",
    );
  });

  it("keeps grouped changelog sections", () => {
    const markdown = `## [1.0.0](link) (2026-01-01)

### Features

* add export button ([abc1234](https://example.com/commit/abc1234))
`;

    expect(hasGroupedSections(markdown)).toBe(true);
    expect(normalizeReleaseNotes(markdown)).toContain("### Features");
  });
});

describe("generateReleaseNotes", () => {
  it("groups conventional commits by type for the latest release", async () => {
    const cwd = createTempGitRepo([
      "feat: add websocket export",
      "fix: restore env headers",
      "docs: add commit guidelines",
      "chore: release v1.0.0",
    ]);

    execFileSync("git", ["tag", "-a", "v1.0.0", "-m", "v1.0.0"], { cwd });

    writeFileSync(path.join(cwd, "README.md"), "next\n", "utf8");
    execFileSync("git", ["add", "README.md"], { cwd });
    execFileSync("git", ["commit", "-m", "feat: add release notes generator"], {
      cwd,
    });
    execFileSync("git", ["commit", "--allow-empty", "-m", "fix: handle empty notes"], {
      cwd,
    });
    execFileSync("git", ["tag", "-a", "v1.1.0", "-m", "v1.1.0"], { cwd });

    const notes = await generateReleaseNotes({ cwd, tag: "v1.1.0" });

    expect(notes).toContain("### Features");
    expect(notes).toContain("add release notes generator");
    expect(notes).toContain("### Bug Fixes");
    expect(notes).toContain("handle empty notes");
    expect(notes).not.toContain("release v1.0.0");
  });
});

import { describe, expect, it } from "vitest";
import {
  applyVersionToProjectFiles,
  bumpVersion,
  parseReleaseArgs,
  runRelease,
} from "./release.mjs";

describe("release command", () => {
  it("bumps patch versions by default", () => {
    expect(bumpVersion("0.1.0", "patch")).toBe("0.1.1");
  });

  it("bumps minor versions and resets patch", () => {
    expect(bumpVersion("0.1.0", "minor")).toBe("0.2.0");
  });

  it("bumps major versions and resets minor and patch", () => {
    expect(bumpVersion("0.1.0", "major")).toBe("1.0.0");
  });

  it("parses release args with patch as the default bump type", () => {
    expect(parseReleaseArgs([])).toEqual({
      bumpType: "patch",
      useCurrentVersion: false,
    });
    expect(parseReleaseArgs(["minor"])).toEqual({
      bumpType: "minor",
      useCurrentVersion: false,
    });
    expect(parseReleaseArgs(["--", "major"])).toEqual({
      bumpType: "major",
      useCurrentVersion: false,
    });
  });

  it("supports npm run release --current", () => {
    expect(parseReleaseArgs(["--current"])).toEqual({
      bumpType: "patch",
      useCurrentVersion: true,
    });
    expect(parseReleaseArgs([], { npm_config_current: "true" })).toEqual({
      bumpType: "patch",
      useCurrentVersion: true,
    });
  });

  it("rejects unknown bump types", () => {
    expect(() => parseReleaseArgs(["next"])).toThrow(
      "Release bump type must be one of: patch, minor, major",
    );
  });

  it("updates all project version files", () => {
    const files = {
      packageJson: JSON.stringify(
        {
          name: "apix",
          version: "0.1.0",
          scripts: {
            test: "vitest run",
          },
        },
        null,
        2,
      ),
      packageLock: JSON.stringify(
        {
          name: "apix",
          version: "0.1.0",
          packages: {
            "": {
              name: "apix",
              version: "0.1.0",
            },
          },
        },
        null,
        2,
      ),
      tauriConfig: JSON.stringify(
        {
          productName: "apix",
          version: "0.1.0",
        },
        null,
        2,
      ),
      cargoToml: `[package]
name = "apix"
version = "0.1.0"

[dependencies]
serde = { version = "1" }
`,
      cargoLock: `[[package]]
name = "apix"
version = "0.1.0"
dependencies = [
 "tauri",
]
`,
    };

    expect(applyVersionToProjectFiles(files, "0.1.1")).toEqual({
      packageJson: `${JSON.stringify(
        {
          name: "apix",
          version: "0.1.1",
          scripts: {
            test: "vitest run",
          },
        },
        null,
        2,
      )}\n`,
      packageLock: `${JSON.stringify(
        {
          name: "apix",
          version: "0.1.1",
          packages: {
            "": {
              name: "apix",
              version: "0.1.1",
            },
          },
        },
        null,
        2,
      )}\n`,
      tauriConfig: `${JSON.stringify(
        {
          productName: "apix",
          version: "0.1.1",
        },
        null,
        2,
      )}\n`,
      cargoToml: `[package]
name = "apix"
version = "0.1.1"

[dependencies]
serde = { version = "1" }
`,
      cargoLock: `[[package]]
name = "apix"
version = "0.1.1"
dependencies = [
 "tauri",
]
`,
    });
  });

  it("commits, pushes, and triggers the Release workflow by pushing a tag", async () => {
    const commands = [];
    const writes = [];
    const files = {
      "package.json": JSON.stringify(
        { name: "apix", version: "0.1.0" },
        null,
        2,
      ),
      "package-lock.json": JSON.stringify(
        {
          name: "apix",
          version: "0.1.0",
          packages: { "": { name: "apix", version: "0.1.0" } },
        },
        null,
        2,
      ),
      "src-tauri/tauri.conf.json": JSON.stringify(
        { version: "0.1.0" },
        null,
        2,
      ),
      "src-tauri/Cargo.toml": `[package]
name = "apix"
version = "0.1.0"
`,
      "src-tauri/Cargo.lock": `[[package]]
name = "apix"
version = "0.1.0"
`,
    };

    const result = await runRelease({
      argv: ["minor"],
      cwd: "/repo",
      readFile: (filePath) => files[filePath],
      writeFile: (filePath, content) => writes.push([filePath, content]),
      runCommand: async (command, args) => {
        commands.push([command, args]);
        if (command === "git" && args.join(" ") === "status --porcelain") {
          return "";
        }
        if (
          command === "git" &&
          args.join(" ") === "branch --show-current"
        ) {
          return "main\n";
        }
        if (
          command === "git" &&
          args.join(" ") ===
            "ls-remote --tags origin refs/tags/v0.2.0"
        ) {
          return "";
        }
        return "";
      },
    });

    expect(result).toEqual({
      version: "0.2.0",
      tag: "v0.2.0",
      branch: "main",
    });
    expect(writes.map(([filePath]) => filePath)).toEqual([
      "package.json",
      "package-lock.json",
      "src-tauri/tauri.conf.json",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
    ]);
    expect(commands).toEqual([
      ["git", ["status", "--porcelain"]],
      ["git", ["branch", "--show-current"]],
      ["git", ["ls-remote", "--tags", "origin", "refs/tags/v0.2.0"]],
      [
        "git",
        [
          "add",
          "package.json",
          "package-lock.json",
          "src-tauri/tauri.conf.json",
          "src-tauri/Cargo.toml",
          "src-tauri/Cargo.lock",
        ],
      ],
      ["git", ["commit", "-m", "chore: release v0.2.0"]],
      ["git", ["push", "origin", "main"]],
      ["git", ["tag", "-a", "v0.2.0", "-m", "发布 APIX v0.2.0"]],
      ["git", ["push", "origin", "refs/tags/v0.2.0"]],
    ]);
  });

  it("can trigger the current version without bumping or committing", async () => {
    const commands = [];
    const writes = [];
    const files = {
      "package.json": JSON.stringify(
        { name: "apix", version: "0.1.1" },
        null,
        2,
      ),
      "package-lock.json": JSON.stringify(
        {
          name: "apix",
          version: "0.1.1",
          packages: { "": { name: "apix", version: "0.1.1" } },
        },
        null,
        2,
      ),
      "src-tauri/tauri.conf.json": JSON.stringify(
        { version: "0.1.1" },
        null,
        2,
      ),
      "src-tauri/Cargo.toml": `[package]
name = "apix"
version = "0.1.1"
`,
      "src-tauri/Cargo.lock": `[[package]]
name = "apix"
version = "0.1.1"
`,
    };

    const result = await runRelease({
      argv: ["--current"],
      cwd: "/repo",
      readFile: (filePath) => files[filePath],
      writeFile: (filePath, content) => writes.push([filePath, content]),
      runCommand: async (command, args) => {
        commands.push([command, args]);
        if (command === "git" && args.join(" ") === "status --porcelain") {
          return "";
        }
        if (
          command === "git" &&
          args.join(" ") === "branch --show-current"
        ) {
          return "main\n";
        }
        if (
          command === "git" &&
          args.join(" ") ===
            "ls-remote --tags origin refs/tags/v0.1.1"
        ) {
          return "";
        }
        return "";
      },
    });

    expect(result).toEqual({
      version: "0.1.1",
      tag: "v0.1.1",
      branch: "main",
    });
    expect(writes).toEqual([]);
    expect(commands).toEqual([
      ["git", ["status", "--porcelain"]],
      ["git", ["branch", "--show-current"]],
      ["git", ["ls-remote", "--tags", "origin", "refs/tags/v0.1.1"]],
      ["git", ["push", "origin", "main"]],
      ["git", ["tag", "-a", "v0.1.1", "-m", "发布 APIX v0.1.1"]],
      ["git", ["push", "origin", "refs/tags/v0.1.1"]],
    ]);
  });
});

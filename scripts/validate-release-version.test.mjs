import { describe, expect, it } from "vitest";
import {
  assertProjectVersionsMatch,
  parseCargoLockPackageVersion,
  parseCargoPackageVersion,
  parseReleaseVersion,
} from "./validate-release-version.mjs";

describe("validate-release-version", () => {
  it("parses a plain SemVer release version and derives the tag", () => {
    expect(parseReleaseVersion("0.1.0")).toEqual({
      version: "0.1.0",
      tag: "v0.1.0",
    });
  });

  it("rejects versions that already include the tag prefix", () => {
    expect(() => parseReleaseVersion("v0.1.0")).toThrow(
      "Version must not start with v",
    );
  });

  it("rejects build metadata because release tags must be stable", () => {
    expect(() => parseReleaseVersion("0.1.0+build.1")).toThrow(
      "Version must be SemVer",
    );
  });

  it("parses the version from the Cargo package section only", () => {
    const cargoToml = `
[package]
name = "apix"
version = "0.1.0"

[dependencies]
some-crate = { version = "9.9.9" }
`;

    expect(parseCargoPackageVersion(cargoToml)).toBe("0.1.0");
  });

  it("parses the apix package version from Cargo.lock", () => {
    const cargoLock = `
[[package]]
name = "other"
version = "9.9.9"

[[package]]
name = "apix"
version = "0.1.0"
dependencies = [
 "tauri",
]
`;

    expect(parseCargoLockPackageVersion(cargoLock, "apix")).toBe("0.1.0");
  });

  it("accepts matching project versions", () => {
    expect(() =>
      assertProjectVersionsMatch("0.1.0", {
        packageJson: "0.1.0",
        packageLock: "0.1.0",
        packageLockRoot: "0.1.0",
        tauriConfig: "0.1.0",
        cargoToml: "0.1.0",
        cargoLock: "0.1.0",
      }),
    ).not.toThrow();
  });

  it("reports every mismatched project version", () => {
    expect(() =>
      assertProjectVersionsMatch("0.2.0", {
        packageJson: "0.1.0",
        packageLock: "0.2.0",
        packageLockRoot: "0.5.0",
        tauriConfig: "0.2.0",
        cargoToml: "0.3.0",
        cargoLock: "0.4.0",
      }),
    ).toThrow(
      'Version mismatch: package.json=0.1.0, package-lock.json packages[""]=0.5.0, src-tauri/Cargo.toml=0.3.0, src-tauri/Cargo.lock=0.4.0',
    );
  });
});

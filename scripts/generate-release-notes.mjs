import { ConventionalGitClient } from "@conventional-changelog/git-client";
import { writeFileSync } from "node:fs";
import { ConventionalChangelog } from "conventional-changelog";
import { pathToFileURL } from "node:url";
import {
  configureChangelogGenerator,
  resolveReleaseTagRange,
} from "./changelog-config.mjs";

const FALLBACK_NOTES =
  "_No conventional commit entries for this release. See commit history for details._";

/**
 * @param {string} markdown
 * @returns {boolean}
 */
export function hasGroupedSections(markdown) {
  return /^### /m.test(markdown);
}

/**
 * @param {string} markdown
 * @returns {string}
 */
export function normalizeReleaseNotes(markdown) {
  const trimmed = markdown.trim();

  if (!trimmed || !hasGroupedSections(trimmed)) {
    return FALLBACK_NOTES;
  }

  return `${trimmed}\n`;
}

/**
 * @param {{ cwd?: string, tag?: string, releaseCount?: number, tagPrefix?: string }} [options]
 * @returns {Promise<string>}
 */
export async function generateReleaseNotes(options = {}) {
  const {
    cwd = process.cwd(),
    tag,
    releaseCount = 1,
    tagPrefix = "v",
  } = options;
  const generator = new ConventionalChangelog(cwd);
  let tagRange;

  if (tag) {
    tagRange = await resolveReleaseTagRange(cwd, tag, tagPrefix);
  } else {
    const gitClient = new ConventionalGitClient(cwd);
    const latestTag = await gitClient.getLastSemverTag({ prefix: tagPrefix });

    if (latestTag) {
      tagRange = await resolveReleaseTagRange(cwd, latestTag, tagPrefix);
    }
  }

  configureChangelogGenerator(generator, {
    releaseCount,
    tagPrefix,
    tagRange,
  });

  let markdown = "";

  for await (const chunk of generator.write()) {
    markdown += chunk;
  }

  return normalizeReleaseNotes(markdown);
}

/**
 * @param {string[]} argv
 * @returns {{ output?: string, tag?: string, releaseCount: number, tagPrefix: string }}
 */
export function parseReleaseNotesArgs(argv) {
  const args = argv.filter((arg) => arg !== "--");
  let output;
  let tag;
  let releaseCount = 1;
  let tagPrefix = "v";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--output" || arg === "-o") {
      output = args[index + 1];

      if (!output) {
        throw new Error("Missing value for --output");
      }

      index += 1;
      continue;
    }

    if (arg === "--tag" || arg === "-t") {
      tag = args[index + 1];

      if (!tag) {
        throw new Error("Missing value for --tag");
      }

      index += 1;
      continue;
    }

    if (arg === "--release-count" || arg === "-r") {
      const value = Number(args[index + 1]);

      if (!Number.isInteger(value) || value < 0) {
        throw new Error("Release count must be a non-negative integer");
      }

      releaseCount = value;
      index += 1;
      continue;
    }

    if (arg === "--tag-prefix") {
      tagPrefix = args[index + 1];

      if (!tagPrefix) {
        throw new Error("Missing value for --tag-prefix");
      }

      index += 1;
    }
  }

  return { output, tag, releaseCount, tagPrefix };
}

async function main() {
  const { output, tag, releaseCount, tagPrefix } = parseReleaseNotesArgs(
    process.argv.slice(2),
  );
  const notes = await generateReleaseNotes({ tag, releaseCount, tagPrefix });

  if (output) {
    writeFileSync(output, notes, "utf8");
    return;
  }

  process.stdout.write(notes);
}

const entryPath = process.argv[1];

if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

import { ConventionalGitClient } from "@conventional-changelog/git-client";
import semver from "semver";

/** @typedef {{ type: string, section: string, hidden?: boolean }} ChangelogCommitType */

/** @type {ChangelogCommitType[]} */
export const CHANGELOG_COMMIT_TYPES = [
  { type: "feat", section: "Features" },
  { type: "fix", section: "Bug Fixes" },
  { type: "refactor", section: "Refactor" },
  { type: "docs", section: "Documentation" },
  { type: "test", section: "Tests" },
  { type: "build", section: "Build" },
  { type: "ci", section: "CI" },
  { type: "chore", section: "Chore" },
];

/** @type {RegExp} */
export const RELEASE_COMMIT_SUBJECT_PATTERN = /^release v/i;

/** @type {RegExp} */
export const RELEASE_COMMIT_IGNORE_PATTERN = /^chore(\(.+\))?: release v/i;

/**
 * @param {{ type?: string, subject?: string }} commit
 * @returns {boolean}
 */
export function isReleaseVersionCommit(commit) {
  return (
    commit.type === "chore" &&
    RELEASE_COMMIT_SUBJECT_PATTERN.test(commit.subject ?? "")
  );
}

/**
 * @param {string} cwd
 * @param {string} tagPrefix
 * @returns {Promise<string[]>}
 */
export async function listSemverTags(cwd, tagPrefix = "v") {
  const gitClient = new ConventionalGitClient(cwd);
  const tags = [];

  for await (const tag of gitClient.getSemverTags({ prefix: tagPrefix })) {
    tags.push(tag);
  }

  return tags.sort(semver.rcompare);
}

/**
 * @param {string} tag
 * @param {string} tagPrefix
 * @returns {string}
 */
export function normalizeReleaseTag(tag, tagPrefix = "v") {
  return tag.startsWith(tagPrefix) ? tag : `${tagPrefix}${tag}`;
}

/**
 * @param {string} cwd
 * @param {string} tag
 * @param {string} [tagPrefix="v"]
 * @returns {Promise<{ currentTag: string, previousTag: string | null, version: string }>}
 */
export async function resolveReleaseTagRange(cwd, tag, tagPrefix = "v") {
  const currentTag = normalizeReleaseTag(tag, tagPrefix);
  const tags = await listSemverTags(cwd, tagPrefix);
  const index = tags.indexOf(currentTag);

  if (index === -1) {
    throw new Error(`Release tag ${currentTag} was not found`);
  }

  return {
    currentTag,
    previousTag: tags[index + 1] ?? null,
    version: currentTag.slice(tagPrefix.length),
  };
}

/**
 * @param {import("conventional-changelog").ConventionalChangelog} generator
 * @param {{ releaseCount?: number, tagPrefix?: string, tagRange?: { currentTag: string, previousTag: string | null, version: string } }} [options]
 */
export function configureChangelogGenerator(generator, options = {}) {
  const { releaseCount = 1, tagPrefix = "v", tagRange } = options;

  generator.loadPreset({
    name: "conventionalcommits",
    types: CHANGELOG_COMMIT_TYPES,
    ignoreCommits: RELEASE_COMMIT_IGNORE_PATTERN,
  });
  generator.readRepository();
  generator.tags({ prefix: tagPrefix });

  const transformCommit = (commit) => {
    if (isReleaseVersionCommit(commit)) {
      return null;
    }

    return commit;
  };

  if (tagRange) {
    generator.context({
      version: tagRange.version,
      currentTag: tagRange.currentTag,
      previousTag: tagRange.previousTag ?? undefined,
    });
    generator.commits(
      tagRange.previousTag
        ? { from: tagRange.previousTag, to: tagRange.currentTag }
        : { to: tagRange.currentTag },
    );
    generator.writer({ doFlush: true });
    generator.options({
      releaseCount: 0,
      transformCommit,
    });
  } else {
    generator.options({
      releaseCount,
      transformCommit,
    });
  }

  return generator;
}

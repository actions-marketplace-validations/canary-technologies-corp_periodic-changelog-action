import * as exec from "@actions/exec";
import { asRelative } from "./changelogs";
import { dirname } from "path";
import * as glob from "@actions/glob";
import * as core from "@actions/core";

export interface CommitLog {
  hash: string;
  title: string;
  tag: string | null;
}

export async function getCommitsForChangelog({
  changelogFilename,
  since,
}: {
  changelogFilename: string;
  since: Date;
}): Promise<CommitLog[]> {
  let output = "";
  let error = "";

  // Use siblings to search to always exclude commits that only affected the
  // current `CHANGELOG.md` file.
  const siblings = await getRelativeSiblingPaths(changelogFilename);
  core.debug(`Found siblings: ${siblings}`);
  const commandOutput = await exec.exec(
    "git",
    ["log", "--oneline", `--since=${since.toISOString()}`, "--", ...siblings],
    {
      listeners: {
        stdout: (data: Buffer) => {
          output += data.toString();
        },
        stderr: (data: Buffer) => {
          error += data.toString();
        },
      },
    },
  );
  if (commandOutput != 0) {
    throw new Error(`Error in 'git' - ${error}`);
  }
  return output
    .split("\n")
    .filter(line => line.trim().length > 0)
    .map(line => {
      const result = line.match(/^([A-z0-9]+)\s(\(tag:\sv[0-9.]+\))?(.*)$/m);
      if (!result?.[1] || !result?.[3]) {
        throw Error(`Unparsable commit: ${line}`);
      }
      return {
        hash: result[1],
        title: result[3],
        tag: result[2]?.replace("(tag: ", "")?.replace(")", "") ?? null,
      };
    });
}

async function getRelativeSiblingPaths(
  changelogFilename: string,
): Promise<string[]> {
  const relativeFilename = asRelative(changelogFilename);
  const patterns = [`${dirname(relativeFilename)}/*`, `!${relativeFilename}`];
  const globber = await glob.create(patterns.join("\n"), {
    followSymbolicLinks: false,
    implicitDescendants: false,
  });
  return (await globber.glob()).map(p => asRelative(p));
}

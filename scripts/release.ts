/**
 * Credits:
 *
 * - np, new-github-release-url - MIT License
 *     Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *     https://github.com/sindresorhus/np/blob/main/license
 *     https://github.com/sindresorhus/new-github-release-url/blob/main/license
 *
 * - bumpp, version-bump-prompt - MIT License
 *     Copyright (c) 2022 Anthony Fu
 *     Copyright (c) 2015 James Messinger
 *     https://github.com/antfu-collective/bumpp/blob/main/LICENSE
 *     https://github.com/JS-DevTools/version-bump-prompt/blob/master/LICENSE
 *
 * - opener - UNLICENSED
 *     https://deno.land/x/opener@v1.0.1
 */

// #region Imports

import type { ConfirmOptions, InputOptions, SelectOptions } from 'jsr:@cliffy/prompt@^1.3.1'
import { Confirm as _Confirm, Input as _Input, Select as _Select } from 'jsr:@cliffy/prompt@^1.3.1'
import { Spinner } from 'jsr:@std/cli@^1.0.32/unstable-spinner'
import { bold, cyan, dim, green, magenta } from 'jsr:@std/fmt@^1.0.10/colors'
import * as SemVer from 'jsr:@std/semver@^1.0.8'
import { $ } from './_dax.ts'

const SEMVER_INCREMENTS: SemVer.ReleaseType[] = [
  'patch',
  'minor',
  'major',
  'prepatch',
  'preminor',
  'premajor',
  'prerelease',
]

function isReleaseType(value: string): value is SemVer.ReleaseType {
  return SEMVER_INCREMENTS.includes(value as SemVer.ReleaseType)
}

// #endregion

// #region Environment

/**
 * Whether prompts can be shown. Confirmations are skipped and the version has to be passed as an argument otherwise.
 */
const ci = Deno.env.get('CI')
const interactive = Deno.stdin.isTerminal() && Deno.stdout.isTerminal() && (!ci || ci === 'false')

const githubToken = Deno.env.get('GH_TOKEN') || Deno.env.get('GITHUB_TOKEN')
const githubApiUrl = (Deno.env.get('GITHUB_API_URL') || 'https://api.github.com').replace(/\/+$/, '')

/**
 * An error that is reported without a stack trace.
 */
class UserError extends Error {}

// #endregion

// #region Prompt

const defaultTheme = { prefix: green('? '), listPointer: cyan('❯'), pointer: cyan('›') }

class Confirm extends _Confirm {
  public override getDefaultSettings(options: ConfirmOptions) {
    return { ...super.getDefaultSettings(options), active: 'yes', inactive: 'no', default: true, ...defaultTheme }
  }

  protected override addChar(char: string): void {
    if (char.toLowerCase() === 'y') {
      this.inputValue = 'yes'
      this.submit()
    } else if (char.toLowerCase() === 'n') {
      this.inputValue = 'no'
      this.submit()
    } else super.addChar(char)
  }
}

class Select extends _Select<string> {
  public override getDefaultSettings(options: SelectOptions<string>) {
    return { ...super.getDefaultSettings(options), ...defaultTheme }
  }

  protected override getListItemLabel(option: { name: string }, isSelected?: boolean): string {
    let name = option.name

    if (isReleaseType(name)) {
      const newVersion = SemVer.increment(oldVersion, name)

      const newMajor = newVersion.major + ''
      const newMinor = newVersion.minor + ''
      const newPatch = newVersion.patch + ''
      const newPre = newVersion.prerelease?.join('.') ?? ''

      const oldMajor = oldVersion.major + ''
      const oldMinor = oldVersion.minor + ''
      const oldPatch = oldVersion.patch + ''
      const oldPre = oldVersion.prerelease?.join('.') ?? ''

      const primary = [
        newMajor !== oldMajor ? cyan(newMajor) : newMajor,
        newMinor !== oldMinor ? cyan(newMinor) : newMinor,
        newPatch !== oldPatch ? cyan(newPatch) : newPatch,
      ].join('.')

      const pre = newPre && newPre !== oldPre ? cyan(newPre) : newPre
      const release = [primary, pre].filter((v) => v).join('-')

      name = `${name} \t${dim(release)}`
    }

    if (isSelected) return cyan(name)
    if (/^-+$/.test(name)) return dim(name)

    return name
  }
}

class Input extends _Input {
  public override getDefaultSettings(options: InputOptions) {
    return { ...super.getDefaultSettings(options), ...defaultTheme }
  }
}

/**
 * Ask for a confirmation, which is implied in non-interactive sessions.
 */
async function confirm(message: string): Promise<boolean> {
  return interactive ? await Confirm.prompt({ message }) : true
}

// #endregion

// #region Step

const okMark = '\x1b[32m✓\x1b[0m'
const failMark = '\x1b[31m✗\x1b[0m'

/**
 * Run a function with a spinner.
 *
 * @example
 * ```ts
 * await step('Loading', async () => {})
 * ```
 */
async function step<T>(text: string, fn: () => Promise<T>): Promise<T> {
  text = bold(text + '...')

  const spinner = interactive ? new Spinner({ message: text, color: 'cyan' }) : undefined
  spinner?.start()

  let success = false

  try {
    const result = await fn()
    success = true
    return result
  } finally {
    spinner?.stop()

    if (success) console.log(`${okMark} ${text}`)
    else console.log(`${failMark} ${text}`)
  }
}

// #endregion

// #region GitHub

type NewGithubReleaseUrlOptions = {
  /**
   * The tag name of the release.
   */
  tag?: string

  /**
   * The branch name or commit SHA to point the release's tag at, if the tag doesn't already exist.
   *
   * Default: The default branch.
   */
  target?: string

  /**
   * The title of the release.
   *
   * GitHub shows the `tag` name when not specified.
   */
  title?: string

  /**
   * The description text of the release.
   */
  body?: string

  /**
   * Whether the release should be marked as a pre-release.
   *
   * @default false
   */
  isPrerelease?: boolean

  /**
   * The full URL to the repo.
   */
  repoUrl: string
}

function newGithubReleaseUrl(options: NewGithubReleaseUrlOptions): string {
  const url = new URL(`${options.repoUrl}/releases/new`)

  const types = ['tag', 'target', 'title', 'body', 'isPrerelease']

  for (let type of types) {
    const value = options[type as keyof NewGithubReleaseUrlOptions]
    if (value === undefined) continue
    if (type === 'isPrerelease') type = 'prerelease'
    url.searchParams.set(type, value + '')
  }

  return url.href
}

type NewGithubPullRequestUrlOptions = {
  /**
   * The branch to merge into.
   */
  base: string

  /**
   * The branch to merge.
   */
  head: string

  /**
   * The title of the pull request.
   */
  title?: string

  /**
   * The description text of the pull request.
   */
  body?: string

  /**
   * The full URL to the repo.
   */
  repoUrl: string
}

function newGithubPullRequestUrl(options: NewGithubPullRequestUrlOptions): string {
  const url = new URL(`${options.repoUrl}/compare/${options.base}...${options.head}`)

  url.searchParams.set('quick_pull', '1')
  if (options.title !== undefined) url.searchParams.set('title', options.title)
  if (options.body !== undefined) url.searchParams.set('body', options.body)

  return url.href
}

/**
 * Convert the URL of a git remote to the HTTPS URL of the repo on its host.
 *
 * @example
 * ```ts
 * toRepoUrl('git@github.com:owner/repo.git') // 'https://github.com/owner/repo'
 * toRepoUrl('https://github.com/owner/owner.github.io.git') // 'https://github.com/owner/owner.github.io'
 * ```
 */
function toRepoUrl(remote: string): string {
  // scp-like syntax (`[user@]host:path`) isn't a valid URL, so it's normalized to `ssh://` first
  const url = new URL(remote.trim().replace(/^([^@/]+@)?([^:/]+):(?!\/\/)\/?/, 'ssh://$1$2/'))
  const path = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')

  return `https://${url.hostname}/${path}`
}

type GithubRequestOptions = {
  /**
   * The JSON payload of the request.
   */
  body?: unknown

  /**
   * Error statuses that shouldn't throw.
   */
  allow?: number[]
}

/**
 * Call the GitHub REST API with the token from the environment.
 */
async function github<T>(
  method: string,
  path: string,
  { body, allow = [] }: GithubRequestOptions = {},
): Promise<{ status: number; data: T }> {
  const url = githubApiUrl + path
  const response = await fetch(url, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${githubToken}`,
      'x-github-api-version': '2026-03-10',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()

  if (!response.ok && !allow.includes(response.status)) {
    throw new Error(`${method} ${url} failed with ${response.status} ${response.statusText}\n${text}`)
  }

  if (!response.headers.get('content-type')?.includes('json')) {
    throw new Error(
      `${method} ${url} returned ${response.status} ${response.statusText} without JSON\n${text.slice(0, 200)}`,
    )
  }

  return { status: response.status, data: JSON.parse(text) }
}

// #endregion

// #region Opener

const programAliases = { windows: 'explorer', darwin: 'open', linux: 'sensible-browser' }

function isSupportedOS(os: string): os is keyof typeof programAliases {
  return os in programAliases
}

async function open(url: string): Promise<void> {
  if (!isSupportedOS(Deno.build.os)) return
  await $`${programAliases[Deno.build.os]} ${$.escapeArg(url)}`.noThrow()
}

/**
 * Print the URL of a created resource, or of the form to create it manually when there is no token.
 */
async function report(label: string, { url, created }: { url: string; created: boolean }): Promise<void> {
  if (created) {
    console.log(`\n${label}: ${url}`)
  } else if (interactive) {
    console.log(`\nCreate the ${label.toLowerCase()} at:\n${url}`)
    await open(url)
  } else {
    console.log(
      `\nSet GH_TOKEN or GITHUB_TOKEN to create the ${label.toLowerCase()} automatically, or use this form:\n${url}`,
    )
  }
}

// #endregion

// #region Manifest

type Manifest = { name: string; version: string; tasks?: Record<string, unknown>; scripts?: Record<string, unknown> }

async function readManifest(file: string): Promise<Manifest | undefined> {
  return await Deno.readTextFile(file).then(JSON.parse).catch(() => undefined)
}

const denoJson = await readManifest('deno.json')
const packageJson = await readManifest('package.json')

const found = denoJson ?? packageJson
if (!found) throw new Error('deno.json or package.json is required')

const manifest: Manifest = found
const manifestFile = denoJson ? 'deno.json' : 'package.json'
const oldVersion = SemVer.parse(manifest.version)

// #endregion

// #region Steps

const repoUrl = toRepoUrl(await $`git remote get-url origin`.text())
const repoSlug = new URL(repoUrl).pathname.slice(1)
const repoOwner = repoSlug.split('/')[0] ?? ''

const usage = 'Usage: deno task release [prepare [<increment>|<version>] | finalize]'

/**
 * Resolve the new version from the argument, or ask for it in interactive sessions.
 */
async function resolveVersion(input?: string): Promise<string> {
  let version = input

  if (version === undefined) {
    if (!interactive) {
      throw new UserError(
        `Prompts aren't available in non-interactive sessions, pass the version to prepare.\n${usage}`,
      )
    }

    version = await Select.prompt({
      message: 'Select version increment',
      options: [...SEMVER_INCREMENTS, Select.separator(), { name: 'Other (specify)', value: 'other' }],
    })

    if (version === 'other') {
      version = await Input.prompt({
        message: 'Enter new version',
        validate: (value) => {
          if (!value) return 'Version is required'
          if (!SemVer.canParse(value)) return 'Invalid semver version'
          return true
        },
      })
    }
  } else if (!isReleaseType(version) && !SemVer.canParse(version)) {
    throw new UserError(`Invalid version "${version}". Expected ${SEMVER_INCREMENTS.join(', ')} or a semver version.`)
  }

  const newVersion = isReleaseType(version) ? SemVer.increment(oldVersion, version) : SemVer.parse(version)

  if (!SemVer.greaterThan(newVersion, oldVersion)) {
    throw new UserError(`${SemVer.format(newVersion)} is not higher than the current version ${manifest.version}`)
  }

  return SemVer.format(newVersion)
}

/**
 * Run a task if the project defines it, with pnpm for the scripts of package.json as deno can't run the shell shims
 * that pnpm puts in node_modules/.bin.
 */
async function runTask(name: string): Promise<void> {
  if (packageJson?.scripts?.[name]) await $`pnpm run ${name}`
  else if (denoJson?.tasks?.[name]) await $`deno task ${name}`
}

/**
 * Update the manifest and the changelog to the new version, confirming both in interactive sessions.
 */
async function bump(newVersion: string): Promise<void> {
  if (!(await confirm(`Bump ${dim(`(${manifest.version} → ${newVersion})`)}?`))) Deno.exit()

  await step(`Updating version in ${manifestFile} to ${newVersion}`, async () => {
    manifest.version = newVersion
    await Deno.writeTextFile(manifestFile, JSON.stringify(manifest, null, 2))
  })

  await step('Generating changelog', async () => {
    await $`deno run -A --no-lock \
      --preload='data:application/javascript,import "npm:conventional-changelog-conventionalcommits"' \
      npm:conventional-changelog -i CHANGELOG.md -s -p conventionalcommits -k ${manifestFile}`
    await runTask('format')
    await runTask('lint')
  })

  if (!(await confirm('Changelog generated. Does it look good?'))) Deno.exit()
}

/**
 * Extract the notes of a version from the changelog.
 */
async function releaseNotes(version: string): Promise<{ notes: string; compareUrl?: string }> {
  const escapedVersion = RegExp.escape(version)
  const heading = `^## (?:\\[${escapedVersion}\\]\\((.*?)\\)|${escapedVersion})(?: .*)?$`

  const changelog = await Deno.readTextFile('CHANGELOG.md').catch(() => {
    throw new UserError('CHANGELOG.md is missing')
  })
  const match = changelog.match(
    new RegExp(`${heading}\\n?([\\s\\S]*?)(?=^## \\[?\\d+\\.\\d+\\.\\d+|(?![\\s\\S]))`, 'm'),
  )

  if (!match) throw new UserError(`CHANGELOG.md has no section for ${version}`)

  return { notes: match[2]?.trim() ?? '', compareUrl: match[1] }
}

async function commit(): Promise<void> {
  await $`git add ${manifestFile} CHANGELOG.md`
  await $`git commit -m "release: v${manifest.version}"`
}

/**
 * Get the commit a tag points at, locally and on the remote (CI checkouts usually don't fetch tags).
 */
async function resolveTag(tag: string): Promise<{ local: string; remote: string }> {
  const local = await $`git rev-list -n 1 refs/tags/${tag}`.noThrow().text()
  const remote = await $`git ls-remote --tags origin refs/tags/${tag} ${$.escapeArg(`refs/tags/${tag}^{}`)}`.text()

  return { local, remote: remote.split('\n').at(-1)?.split('\t')[0] ?? '' }
}

/**
 * Fail before anything is changed if the release can't be completed. The history and the tag are only checked when
 * a version is about to be bumped.
 */
async function preflight(newVersion?: string): Promise<void> {
  if (Deno.env.get('GITHUB_ACTIONS') && !githubToken) {
    throw new UserError('Set GH_TOKEN or GITHUB_TOKEN to create pull requests and releases from GitHub Actions')
  }

  if (newVersion === undefined) return

  if ((await $`git rev-parse --is-shallow-repository`.text()) === 'true') {
    throw new UserError('The changelog needs the full history and the tags, fetch them first (fetch-depth 0 in CI)')
  }

  const { local, remote } = await resolveTag(`v${newVersion}`)
  if (local || remote) throw new UserError(`v${newVersion} already exists`)
}

/**
 * Tag the current commit and push the tag, unless the remote already has it there.
 */
async function pushTag(tag: string): Promise<void> {
  const head = await $`git rev-parse HEAD`.text()
  const { local, remote } = await resolveTag(tag)

  for (const commit of [local, remote]) {
    if (commit && commit !== head) {
      throw new UserError(`${tag} already exists and points at ${commit.slice(0, 7)} instead of HEAD`)
    }
  }

  if (remote) return
  if (!local) await $`git tag ${tag}`

  await $`git push origin refs/tags/${tag}`
}

/**
 * Create the release on GitHub, unless it already exists.
 */
async function createRelease(
  options: { tag: string; body: string; isPrerelease: boolean },
): Promise<{ url: string; created: boolean }> {
  if (!githubToken) return { url: newGithubReleaseUrl({ repoUrl, ...options }), created: false }

  const existing = await github<{ html_url: string }>('GET', `/repos/${repoSlug}/releases/tags/${options.tag}`, {
    allow: [404],
  })
  if (existing.status === 200) return { url: existing.data.html_url, created: true }

  const { data } = await github<{ html_url: string }>('POST', `/repos/${repoSlug}/releases`, {
    body: { tag_name: options.tag, name: options.tag, body: options.body, prerelease: options.isPrerelease },
  })
  return { url: data.html_url, created: true }
}

/**
 * Find the open pull request of a branch.
 */
async function findPullRequest(head: string): Promise<{ number: number; html_url: string } | undefined> {
  if (!githubToken) return undefined

  const params = new URLSearchParams({ head: `${repoOwner}:${head}`, state: 'open' })
  const { data } = await github<{ number: number; html_url: string }[]>('GET', `/repos/${repoSlug}/pulls?${params}`)

  return data[0]
}

/**
 * Create the pull request on GitHub.
 */
async function createPullRequest(
  options: { base: string; head: string; title: string; body: string },
): Promise<{ url: string; created: boolean }> {
  if (!githubToken) return { url: newGithubPullRequestUrl({ repoUrl, ...options }), created: false }

  const { data } = await github<{ html_url: string }>('POST', `/repos/${repoSlug}/pulls`, { body: options })
  return { url: data.html_url, created: true }
}

// #endregion

// #region Main

/**
 * Bump the version and release it from the current branch.
 */
async function release(): Promise<void> {
  const newVersion = await resolveVersion()
  await step('Checking prerequisites', () => preflight(newVersion))

  await bump(newVersion)
  await releaseNotes(newVersion)

  await step('Committing changes', commit)
  await step('Pushing to GitHub', async () => {
    await $`git push`
  })

  await finalize()
}

/**
 * Bump the version on a release branch and open a pull request for it.
 */
async function prepare(input?: string): Promise<void> {
  const baseBranch = await $`git branch --show-current`.text()
  if (!baseBranch) throw new UserError('Check out the branch that the release should be merged into first')

  const newVersion = await resolveVersion(input)
  await step('Checking prerequisites', () => preflight(newVersion))

  await bump(newVersion)

  const { notes } = await releaseNotes(newVersion)
  const branch = `release/v${newVersion}`

  await step(`Committing changes to ${branch}`, async () => {
    await $`git checkout -q -B ${branch}`
    await commit()
  })

  const pullRequest = { base: baseBranch, head: branch, title: `release: v${newVersion}`, body: notes }
  const existing = await findPullRequest(branch)

  if (existing) {
    await step('Updating the pull request', async () => {
      const { head: _, ...changes } = pullRequest
      await github('PATCH', `/repos/${repoSlug}/pulls/${existing.number}`, { body: changes })
    })
  }

  await step('Pushing to GitHub', async () => {
    await $`git push --force origin ${branch}`
    await $`git checkout -q ${$.escapeArg(baseBranch)}`
  })

  const pull = existing
    ? { url: existing.html_url, created: true }
    : await step('Creating a pull request', () => createPullRequest(pullRequest))

  await report('Pull request', pull)
}

/**
 * Tag the current commit with the version in the manifest and create the release for it.
 */
async function finalize(): Promise<void> {
  await preflight()

  const parsedVersion = SemVer.parse(manifest.version)
  const version = SemVer.format(parsedVersion)
  const tag = `v${version}`
  const isPrerelease = (parsedVersion.prerelease?.length ?? 0) > 0

  const { notes, compareUrl } = await releaseNotes(version)
  const body = [notes, `**Full Changelog**: ${compareUrl ?? `${repoUrl}/commits/${tag}`}`].filter(Boolean).join('\n\n')

  await step(`Tagging and pushing ${tag}`, () => pushTag(tag))

  const result = await step('Creating a new release', () => createRelease({ tag, body, isPrerelease }))

  await report('Release', result)
}

const [command, ...args] = Deno.args[0] === '--' ? Deno.args.slice(1) : Deno.args

if (command === 'finalize') {
  console.log(`\nFinalize the release of ${bold(magenta(manifest.name))} ${dim(`(version: ${manifest.version})`)}\n`)
} else {
  console.log(`\nPublish a new version of ${bold(magenta(manifest.name))} ${dim(`(current: ${manifest.version})`)}\n`)
}

try {
  const maxArgs = command === 'prepare' ? 1 : 0
  if (args.length > maxArgs) throw new UserError(`Unexpected argument "${args[maxArgs]}".\n${usage}`)

  if (command === undefined) await release()
  else if (command === 'prepare') await prepare(args[0])
  else if (command === 'finalize') await finalize()
  else throw new UserError(`Unknown command "${command}".\n${usage}`)
} catch (error) {
  if (!(error instanceof UserError)) throw error
  console.error(`\n${failMark} ${error.message}`)
  Deno.exit(1)
}

// #endregion

/**
 * TODO:
 * - `finalize` tags HEAD, it should find the commit that bumped the version instead (the base branch may have moved
 *   on since), check that it's reachable from the remote base branch, and exit cleanly when that commit is already
 *   released
 * - `prepare` branches from the local HEAD without fetching, so unpushed commits end up in the release PR
 * - the working tree is assumed to be clean: staged changes and uncommitted manifest edits end up in the release
 *   commit, the format task touches other files, and a failure after the release branch is checked out leaves it
 *   checked out (a re-run then uses it as the base)
 */

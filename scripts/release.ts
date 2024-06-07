/**
 * Credits:
 *
 * - np, new-github-release-url, is-in-ci - MIT License
 *     Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *     https://github.com/sindresorhus/np/blob/main/license
 *     https://github.com/sindresorhus/new-github-release-url/blob/main/license
 *     https://github.com/sindresorhus/is-in-ci/blob/main/license
 *
 * - bumpp, version-bump-prompt - MIT License
 *     Copyright (c) 2022 Anthony Fu
 *     Copyright (c) 2015 James Messinger
 *     https://github.com/antfu-collective/bumpp/blob/main/LICENSE
 *     https://github.com/JS-DevTools/version-bump-prompt/blob/master/LICENSE
 *
 * - opener - UNLICENSED
 *     https://deno.land/x/opener@v1.0.1
 *
 * - vitepress - MIT License
 *     Copyright (c) 2019-present, Yuxi (Evan) You
 *     https://github.com/vuejs/vitepress/blob/main/LICENSE
 */

// #region Imports

import {
  Confirm as _Confirm,
  type ConfirmOptions,
  Input as _Input,
  type InputOptions,
  Select as _Select,
  type SelectOptions,
} from 'jsr:@cliffy/prompt@1.0.0-rc.4'
import { $ } from 'jsr:@david/dax'
import { Spinner } from 'jsr:@std/cli'
import { bold, cyan, dim, green, magenta } from 'jsr:@std/fmt/colors'
import { escape } from 'jsr:@std/regexp'
import { canParse, format, increment, parse, type ReleaseType } from 'jsr:@std/semver'

const SEMVER_INCREMENTS: ReleaseType[] = ['patch', 'minor', 'major', 'prepatch', 'preminor', 'premajor', 'prerelease']

function isReleaseType(value: string): value is ReleaseType {
  return SEMVER_INCREMENTS.includes(value as ReleaseType)
}

const denoJson = JSON.parse(await Deno.readTextFile('deno.json'))
const oldVersion = parse(denoJson.version)

// #endregion

// #region Prompt

const defaultTheme = { prefix: green('? '), listPointer: cyan('❯'), pointer: cyan('›') }

class Confirm extends _Confirm {
  public getDefaultSettings(options: ConfirmOptions) {
    return { ...super.getDefaultSettings(options), active: 'yes', inactive: 'no', default: true, ...defaultTheme }
  }

  protected addChar(char: string): void {
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
  public getDefaultSettings(options: SelectOptions<string>) {
    return { ...super.getDefaultSettings(options), ...defaultTheme }
  }

  protected highlight(name: string | number): string {
    const isCurrent = name === this.options[this.listIndex]?.name

    name = name + ''

    if (isReleaseType(name)) {
      const newVersion = increment(oldVersion, name)

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

    if (isCurrent) return cyan(name)
    if (/^-+$/.test(name)) return dim(name)

    return name
  }
}

class Input extends _Input {
  public getDefaultSettings(options: InputOptions) {
    return { ...super.getDefaultSettings(options), ...defaultTheme }
  }
}

// #endregion

// #region Step

const env = Deno.env.toObject()

const isEnabled = Deno.stdout.isTerminal() &&
  !(env.CI !== '0' && env.CI !== 'false' &&
    ('CI' in env || 'CONTINUOUS_INTEGRATION' in env || Object.keys(env).some((key) => key.startsWith('CI_'))))

const okMark = '\x1b[32m✓\x1b[0m'
const failMark = '\x1b[31m✗\x1b[0m'

/**
 * Run a function with a spinner.
 *
 * @example
 * ```ts
 * await step('Loading...', async () => {})
 * ```
 */
async function step(text: string, fn: () => Promise<void>): Promise<void> {
  if (!isEnabled) {
    console.log(text)
    await fn()
    return
  }

  text = bold(text)

  const spinner = new Spinner({ message: text, color: 'cyan' })
  spinner.start()

  let success = false

  try {
    await fn()
    success = true
  } finally {
    spinner.stop()

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

// #endregion

// #region Opener

const programAliases = { windows: 'explorer', darwin: 'open', linux: 'sensible-browser' }

function isSupportedOS(os: string): os is keyof typeof programAliases {
  return os in programAliases
}

async function open(url: string): Promise<void> {
  if (!isSupportedOS(Deno.build.os)) {
    console.error('Unsupported OS. Please open the following URL manually:\n' + url)
    return
  }
  await $.raw`${programAliases[Deno.build.os]} ${$.escapeArg(url)}`
}

// #endregion

// #region Main

console.log(`\nPublish a new version of ${bold(magenta(denoJson.name))} ${dim(`(current: ${denoJson.version})`)}\n`)

let version = await Select.prompt({
  message: 'Select version increment',
  options: [...SEMVER_INCREMENTS, Select.separator(), { name: 'Other (specify)', value: 'other' }],
})

if (version === 'other') {
  version = await Input.prompt({
    message: 'Enter new version',
    validate: (value) => {
      if (!value) return 'Version is required'
      if (!canParse(value)) return 'Invalid semver version'
      return true
    },
  })
}

const newVersion = format(isReleaseType(version) ? increment(oldVersion, version) : parse(version))

if (!(await Confirm.prompt({ message: `Bump ${dim(`(${denoJson.version} → ${newVersion})`)}?` }))) Deno.exit()

await step('Updating version in deno.json...', async () => {
  denoJson.version = newVersion
  await Deno.writeTextFile('deno.json', JSON.stringify(denoJson, null, 2))
  await $.raw`deno fmt deno.json`.quiet()
})

await step('Generating changelog...', async () => {
  await $
    .raw`deno run -A --no-lock npm:conventional-changelog-cli -i CHANGELOG.md -s -p conventionalcommits -k deno.json`
    .quiet()
  await $.raw`deno fmt CHANGELOG.md`.quiet()
})

if (!(await Confirm.prompt({ message: 'Changelog generated. Does it look good?' }))) Deno.exit()

await step('Committing changes...', async () => {
  await $.raw`git add deno.json CHANGELOG.md`.quiet()
  await $.raw`git commit -m "release: v${newVersion}"`.quiet()
  await $.raw`git tag v${newVersion}`.quiet()
})

await step('Pushing to GitHub...', async () => {
  await $.raw`git push origin refs/tags/v${newVersion}`.quiet()
  await $.raw`git push`.quiet()
})

await step('Creating a new release...', async () => {
  const changelog = await Deno.readTextFile('CHANGELOG.md')

  const match = changelog.match(new RegExp(`## \\[${escape(newVersion)}\\]\\((.*?)\\).*?\n([\\s\\S]*?)(?=\n## |$)`))

  const url = newGithubReleaseUrl({
    body: `${match?.[2]?.trim() ?? ''}\n\n**Full Changelog**: ${match?.[1]?.trim() ?? ''}`,
    isPrerelease: (parse(newVersion).prerelease?.length ?? 0) > 0,
    repoUrl: 'https://github.com/globalbrain/hado',
    tag: `v${newVersion}`,
  })

  await open(url)
})

// #endregion

/**
 * TODO:
 * - publish stuff from this script as standalone modules
 * - remove version from @cliffy/prompt when it's stable
 */

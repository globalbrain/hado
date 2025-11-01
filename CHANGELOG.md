## [0.19.3](https://github.com/globalbrain/hado/compare/v0.19.2...v0.19.3) (2025-11-01)

## [0.19.2](https://github.com/globalbrain/hado/compare/v0.19.1...v0.19.2) (2025-10-09)

### Features

- export `timeoutSignal` ([fa0b7df](https://github.com/globalbrain/hado/commit/fa0b7dff0f7d2f95209661ba6b34014d7d383acc))

## [0.19.1](https://github.com/globalbrain/hado/compare/v0.19.0...v0.19.1) (2025-10-02)

### Bug Fixes

- no need for long initial timeout ([6f02452](https://github.com/globalbrain/hado/commit/6f0245245e814501a328c95b9918bf9a407693fa))

## [0.19.0](https://github.com/globalbrain/hado/compare/v0.18.1...v0.19.0) (2025-10-02)

### Bug Fixes

- exclude test files from route scanning ([f3572c2](https://github.com/globalbrain/hado/commit/f3572c2e2dfcb993831ef88cecb121227e44c72b))
- improve error traces for timeouts in fetch utilities ([ab41a84](https://github.com/globalbrain/hado/commit/ab41a84a24b16aa5170286ee6f5fbd954ef2f283))

## [0.18.1](https://github.com/globalbrain/hado/compare/v0.18.0...v0.18.1) (2025-09-06)

## [0.18.0](https://github.com/globalbrain/hado/compare/v0.17.3...v0.18.0) (2025-08-04)

### Features

- **utils:** extended fetch - `fx` ([#2](https://github.com/globalbrain/hado/issues/2)) ([79d55fa](https://github.com/globalbrain/hado/commit/79d55fa13ac902647275bd66cffd3d4f062e36a0))

## [0.17.3](https://github.com/globalbrain/hado/compare/v0.17.2...v0.17.3) (2025-07-30)

## [0.17.2](https://github.com/globalbrain/hado/compare/v0.17.1...v0.17.2) (2025-07-28)

## [0.17.1](https://github.com/globalbrain/hado/compare/v0.17.0...v0.17.1) (2025-07-09)

## [0.17.0](https://github.com/globalbrain/hado/compare/v0.16.0...v0.17.0) (2025-07-09)

### Features

- **utils:** support [standard schema](https://standardschema.dev/) ([93d37a2](https://github.com/globalbrain/hado/commit/93d37a2a626652f29d632d2543ef9535876659fd))

## [0.16.0](https://github.com/globalbrain/hado/compare/v0.15.3...v0.16.0) (2025-07-09)

### ⚠ BREAKING CHANGES

- Support for Deno <2.4 is dropped.
- The Sentry module is now published to JSR. The exports now closely mimic the official module.
- While not really a breaking change, but Hado now uses the built-in Deno FsWatcher. It isn't robust like `chokidar` and `@parcel/watcher` and can emit unnecessary or wrong events. So, ignore any extra _Reloading router_ logs.

### Features

- deno 2.4 support ([#1](https://github.com/globalbrain/hado/issues/1)) ([15372c0](https://github.com/globalbrain/hado/commit/15372c032390698c8986c7de9e7d91fcaf30a4fb))

## [0.15.3](https://github.com/globalbrain/hado/compare/v0.15.2...v0.15.3) (2025-06-06)

### Bug Fixes

- **utils/regression:** keep the body usable even after timeout ([b0b3491](https://github.com/globalbrain/hado/commit/b0b34917a4445f5cba8cffa886b8e617552303fe))

## [0.15.0](https://github.com/globalbrain/hado/compare/v0.14.0...v0.15.0) (2025-05-22)

### Features

- **router:** throw when ellipsis is used instead of three dots in segments ([328320c](https://github.com/globalbrain/hado/commit/328320c0151031dabf2ab573df87687bd381b356))

## [0.14.0](https://github.com/globalbrain/hado/compare/v0.13.0...v0.14.0) (2025-05-22)

### ⚠ BREAKING CHANGES

- **utils:** `pool` is changed to `key` and is now required for both `fetchAll` and `concurrentArrayFetcher`

### Bug Fixes

- **utils:** pooling logic ([c564ef4](https://github.com/globalbrain/hado/commit/c564ef41a0d563d3425fe503120c1c7362c3340e))

### Code Refactoring

- **utils:** use `concurrentArrayFetcher` to implement `fetchAll` ([b357f69](https://github.com/globalbrain/hado/commit/b357f6956f23ac8ab00169ba4e3126d30ab571c4))

## [0.13.0](https://github.com/globalbrain/hado/compare/v0.12.1...v0.13.0) (2025-05-17)

### Features

- **utils:** add `deadline` option to `concurrentArrayFetcher` too ([8626cde](https://github.com/globalbrain/hado/commit/8626cde367a275fb58cc2d042c118a0df60832ea))

## [0.12.1](https://github.com/globalbrain/hado/compare/v0.12.0...v0.12.1) (2025-05-16)

### Bug Fixes

- **utils:** properly abort fetch in case of timeout ([6e0f6e7](https://github.com/globalbrain/hado/commit/6e0f6e77de5ce27fcdbe10354578ec3b93cba14c))
- **utils:** outdated jsdocs, async zod schema support ([37cf737](https://github.com/globalbrain/hado/commit/37cf7377cd0dd54b2c9144aac2ce5297baa5d01c))

## [0.12.0](https://github.com/globalbrain/hado/compare/v0.11.0...v0.12.0) (2025-05-15)

### ⚠ BREAKING CHANGES

- **utils:** rename `retry` to `maxAttempts` in fetch utils ([9f79383](https://github.com/globalbrain/hado/commit/9f7938338a732c1793bf4e60c39ce62b9a586822))

### Features

- **utils:** return source item in `concurrentArrayFetcher` ([62cbf20](https://github.com/globalbrain/hado/commit/62cbf207f2b1085dab7df0f1f64209797ff5e608))

## [0.11.0](https://github.com/globalbrain/hado/compare/v0.10.1...v0.11.0) (2025-05-15)

### Features

- **utils:** add `concurrentArrayFetcher` ([8886fd5](https://github.com/globalbrain/hado/commit/8886fd5596890bcc0bb783b074e8d7782d59fe8b))

## [0.10.1](https://github.com/globalbrain/hado/compare/v0.10.0...v0.10.1) (2025-04-28)

### Bug Fixes

- watcher ignore patterns ([48ca2d1](https://github.com/globalbrain/hado/commit/48ca2d13e9f30c68b6f69bcc45bb11f0fc725ef4))

## [0.10.0](https://github.com/globalbrain/hado/compare/v0.9.4...v0.10.0) (2025-04-27)

### Features

- re-introduce `@parcel/watcher` ([1d083fd](https://github.com/globalbrain/hado/commit/1d083fd46e9b770e84c1516d24c46d0db5a6d752))

## [0.9.4](https://github.com/globalbrain/hado/compare/v0.9.3...v0.9.4) (2025-03-16)

## [0.9.3](https://github.com/globalbrain/hado/compare/v0.9.2...v0.9.3) (2025-03-16)

## [0.9.2](https://github.com/globalbrain/hado/compare/v0.9.1...v0.9.2) (2025-03-16)

## [0.9.1](https://github.com/globalbrain/hado/compare/v0.9.0...v0.9.1) (2025-02-28)

## [0.9.0](https://github.com/globalbrain/hado/compare/v0.8.5...v0.9.0) (2025-02-28)

### ⚠ BREAKING CHANGES

- Sentry SDK is upgraded to v9. Most likely, no changes are needed in users' code, but please refer to the [migration guide](https://docs.sentry.io/platforms/javascript/guides/deno/migration/v8-to-v9/) for more details.

### Features

- **sentry:** upgrade to sentry v9 ([1458a19](https://github.com/globalbrain/hado/commit/1458a198f204d359a970cbe7ee79a8ff187c60d2))

### Bug Fixes

- **sentry:** export everything from patched sentry module as `Sentry` ([a91e153](https://github.com/globalbrain/hado/commit/a91e153ae6c47bd3ce97a0632d374e966d0d1b30))

## [0.8.5](https://github.com/globalbrain/hado/compare/v0.8.4...v0.8.5) (2025-01-16)

### Features

- **sentry:** console integration for npm packages ([8fa09c2](https://github.com/globalbrain/hado/commit/8fa09c2f986a9d404a478e8293b205c8b7ef50f7))

## [0.8.4](https://github.com/globalbrain/hado/compare/v0.8.3...v0.8.4) (2025-01-15)

## [0.8.3](https://github.com/globalbrain/hado/compare/v0.8.2...v0.8.3) (2024-12-12)

## [0.8.2](https://github.com/globalbrain/hado/compare/v0.8.1...v0.8.2) (2024-12-12)

### Bug Fixes

- **sentry:** don't treat "listening on ..." logs as errors ([ede66d4](https://github.com/globalbrain/hado/commit/ede66d4b02f94cf6acf19f3d819e67c07ed32400))

## [0.8.1](https://github.com/globalbrain/hado/compare/v0.8.0...v0.8.1) (2024-11-28)

## [0.8.0](https://github.com/globalbrain/hado/compare/v0.7.3...v0.8.0) (2024-11-10)

### ⚠ BREAKING CHANGES

- `static.fsRoot` is now required to serve static files. This is a breaking change because previously static files were served from the project root by default, which posed a security risk of exposing sensitive files.

### Bug Fixes

- don't serve static files unless static.fsRoot is explicitly specified ([ba49813](https://github.com/globalbrain/hado/commit/ba49813972bad21e1774fed65c26bdc8b76ff85d))

## [0.7.3](https://github.com/globalbrain/hado/compare/v0.7.2...v0.7.3) (2024-10-28)

### Features

- support route groups, bump deps to stable, use deno 2 ([dec4018](https://github.com/globalbrain/hado/commit/dec4018acd94060a04ecb7462b041d0af4ed2ff4))

## [0.7.2](https://github.com/globalbrain/hado/compare/v0.7.1...v0.7.2) (2024-09-02)

### Features

- HEAD is now implicitly handled if GET is defined ([abef902](https://github.com/globalbrain/hado/commit/abef90270d17b75adc147f97b3b82849bce2b903))

### Bug Fixes

- cache logic resulting in internal server errors ([abef902](https://github.com/globalbrain/hado/commit/abef90270d17b75adc147f97b3b82849bce2b903))

## [0.7.1](https://github.com/globalbrain/hado/compare/v0.7.0...v0.7.1) (2024-08-05)

### Features

- stabilize deps ([bc6dcad](https://github.com/globalbrain/hado/commit/bc6dcad2bdcafa23dda4930664352d6a4acca570))

### Bug Fixes

- skip sentry init if dsn is not set ([8beff85](https://github.com/globalbrain/hado/commit/8beff85e0c0a2d7aab1127c706e7e305f4a06dde))

## [0.7.0](https://github.com/globalbrain/hado/compare/v0.6.4...v0.7.0) (2024-08-01)

### Bug Fixes

- removed sentry from exports due to jsr restrictions ([74ff5b0](https://github.com/globalbrain/hado/commit/74ff5b07f7537953623c01605a25e08205f2566e))

## [0.6.4](https://github.com/globalbrain/hado/compare/v0.6.3...v0.6.4) (2024-08-01)

### Features

- add sentry module ([54911ae](https://github.com/globalbrain/hado/commit/54911ae2622b1e783cdc267b0d70f5e971b63a5e))

## [0.6.3](https://github.com/globalbrain/hado/compare/v0.6.2...v0.6.3) (2024-07-15)

## [0.6.2](https://github.com/globalbrain/hado/compare/v0.6.1...v0.6.2) (2024-07-15)

## [0.6.1](https://github.com/globalbrain/hado/compare/v0.6.0...v0.6.1) (2024-07-15)

## [0.6.0](https://github.com/globalbrain/hado/compare/v0.5.0...v0.6.0) (2024-07-15)

### ⚠ BREAKING CHANGES

- hado/http is removed, exports are now same as 0.4.2

### Features

- split deps and devDeps ([75a8f78](https://github.com/globalbrain/hado/commit/75a8f78271a94eb3fdd6c772f67d78fdbac82a58))

## [0.5.0](https://github.com/globalbrain/hado/compare/v0.4.2...v0.5.0) (2024-07-12)

### ⚠ BREAKING CHANGES

- `createStandardResponse` and `STATUS_CODE` are now exported from `hado/http` instead of `hado/router`

### Features

- re-export everything from the `@std/http` module ([fe52d32](https://github.com/globalbrain/hado/commit/fe52d32d5f295bd961f3572b4022e3fd1455dbd9))

## [0.4.2](https://github.com/globalbrain/hado/compare/v0.4.1...v0.4.2) (2024-06-07)

## [0.4.1](https://github.com/globalbrain/hado/compare/v0.4.0...v0.4.1) (2024-06-06)

## [0.4.0](https://github.com/globalbrain/hado/compare/v0.3.7...v0.4.0) (2024-06-06)

### ⚠ BREAKING CHANGES

- **utils:** `fetchAll` now returns an object containing values and errors as arrays

### Features

- **utils:** return errors as array instead of throwing ([c32680b](https://github.com/globalbrain/hado/commit/c32680b07dbff0bca3ada4f5c62055a572d01c80))

## [0.3.7](https://github.com/globalbrain/hado/compare/v0.3.6...v0.3.7) (2024-06-06)

### Features

- **utils:** allow using zod schema in fetchAll ([c4a3de7](https://github.com/globalbrain/hado/commit/c4a3de7265f58c927661727ce3f5dde8ebff4b25))

## [0.3.6](https://github.com/globalbrain/hado/compare/v0.3.5...v0.3.6) (2024-06-06)

## [0.3.5](https://github.com/globalbrain/hado/compare/v0.3.4...v0.3.5) (2024-06-06)

## [0.3.4](https://github.com/globalbrain/hado/compare/v0.3.3...v0.3.4) (2024-06-06)

### Features

- **utils:** add fetchAll ([f482ec9](https://github.com/globalbrain/hado/commit/f482ec9bfe212f2e8e49b5ebbdb2483b2fd33641))

## [0.3.3](https://github.com/globalbrain/hado/compare/v0.3.2...v0.3.3) (2024-05-30)

### Features

- export `createStandardResponse` helper function ([23a7b4a](https://github.com/globalbrain/hado/commit/23a7b4ae68188b03d24656b33355e8c8f326a088))

## [0.3.2](https://github.com/globalbrain/hado/compare/v0.3.1...v0.3.2) (2024-05-30)

### Bug Fixes

- avoid race when a file is renamed ([5864f4f](https://github.com/globalbrain/hado/commit/5864f4f38872691f62d8983ff1d65fd1fa414e0b))

## [0.3.1](https://github.com/globalbrain/hado/compare/v0.3.0...v0.3.1) (2024-05-30)

### Bug Fixes

- empty `urlRoot` not working ([c66da3d](https://github.com/globalbrain/hado/commit/c66da3dc75150728146d4e76e520812f5dbd458e))

## [0.3.0](https://github.com/globalbrain/hado/compare/v0.2.0...v0.3.0) (2024-05-30)

### ⚠ BREAKING CHANGES

- leading slash in `urlRoot` is no longer required

### Features

- normalize path and builtin static file server ([91a8778](https://github.com/globalbrain/hado/commit/91a87788af74b354589d2ec0df697e0df2d67934))

### Bug Fixes

- handle spaces and non-ascii routes properly
- don't decode characters which are part of the URI syntax ([ad178f0](https://github.com/globalbrain/hado/commit/ad178f00d14d8d3fba78e57eaddef7e754d17be1))

## [0.2.0](https://github.com/globalbrain/hado/compare/v0.1.8...v0.2.0) (2024-05-30)

### ⚠ BREAKING CHANGES

- `createRouter` now takes an options object instead of a string

### Features

- change options and add notes on static file handling ([28e56f5](https://github.com/globalbrain/hado/commit/28e56f589ca886184372c4417f6ca309614abbbc))

## [0.1.8](https://github.com/globalbrain/hado/compare/v0.1.7...v0.1.8) (2024-05-29)

### Bug Fixes

- remove redundant ignore patterns ([5befcb4](https://github.com/globalbrain/hado/commit/5befcb467cea3f4eb9e62cca3404ef2eff6f8945))

## [0.1.7](https://github.com/globalbrain/hado/compare/v0.1.6...v0.1.7) (2024-05-29)

### Bug Fixes

- update chokidar ignore patterns ([a53b351](https://github.com/globalbrain/hado/commit/a53b3511e94936106bdaba4b754302aaf01fea68))

## [0.1.6](https://github.com/globalbrain/hado/compare/v0.1.5...v0.1.6) (2024-05-28)

## [0.1.5](https://github.com/globalbrain/hado/compare/v0.1.4...v0.1.5) (2024-05-28)

### Bug Fixes

- deno watches all files in import graph, no need for manually invalidating resolver cache ([6c4b8e4](https://github.com/globalbrain/hado/commit/6c4b8e4ce89c4a8a317ca2fd55916b67632c8099))

## [0.1.4](https://github.com/globalbrain/hado/compare/v0.1.3...v0.1.4) (2024-05-28)

## [0.1.3](https://github.com/globalbrain/hado/compare/v0.1.2...v0.1.3) (2024-05-28)

## [0.1.2](https://github.com/globalbrain/hado/compare/v0.1.1...v0.1.2) (2024-05-28)

### Bug Fixes

- `@parcel/watcher` breaking watch mode ([3ecd5a0](https://github.com/globalbrain/hado/commit/3ecd5a01ca578998129e5fd221fe111c68bd70cf))

## [0.1.1](https://github.com/globalbrain/hado/compare/v0.1.0...v0.1.1) (2024-05-28)

## [0.1.0](https://github.com/globalbrain/hado/compare/v0.0.6...v0.1.0) (2024-05-28)

### Features

- add router ([f89ceb7](https://github.com/globalbrain/hado/commit/f89ceb7229e7bdf26ab29763a76f5059e5b5b897))
- recreate router tree on file creation/deletion in dev ([bb1f5af](https://github.com/globalbrain/hado/commit/bb1f5affd367c650a16e550c4118775a84e65457))

### Bug Fixes

- explicit return types ([a8bd7dc](https://github.com/globalbrain/hado/commit/a8bd7dc49ab9696a382dba1179ab5309a8fbab2c))

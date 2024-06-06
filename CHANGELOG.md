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

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> *Note*: Some version numbers may be skipped to align feature set with the Java version.

---
## Version 4.3.3, 6/26/2025

### Added

1. Support file "append" mode in output data mapping
2. Dynamic fork-n-join feature for parallel processing of a list of elements by multiple instances of the same task

### Removed

N/A

### Changed

Improve CompileFlow error message. The new error message will tell where the error comes from.

---
## Version 4.3.1, 6/24/2025

### Added

Worked example and template to encapsulate worker thread as a composable function

### Removed

N/A

### Changed

N/A

---
## Version 4.3.0, 6/22/2025

### Added

Feature to consolidate classes from the same library into a single import statement.

### Removed

N/A

### Changed

Minor refactoring to reduce code complexity to level-15 as per SonarQube recommendation.

---
## Version 4.2.46, 6/6/2025

### Added

Support ".env" environment variable file using node.js standard library "process.loadEnvFile()" API

### Removed

N/A

### Changed

Updated unit test to validate environment variable

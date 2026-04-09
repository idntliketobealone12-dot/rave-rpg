# CHANGELOG

## 2.3.1 - 2026-04-10

### Fixed
- Damage workflow now uses a single chat button with mode selection in the damage options dialog
- Extra damage die selection now uses fixed die choices instead of a freeform formula field
- Weapon and extra dice are combined with `kh1` before enhanced or impaired damage is resolved
- Removable dice listing now follows the updated damage rules and only shows active dice with results of 4 or higher
- Damage summary text uses a darker color for readability

## 2.3.0 - 2026-04-10

### Added
- Structured damage rolling with optional extra dice and extra flat damage
- Damage chat controls for removing individual rolled dice and recalculating totals
- Additional localization keys for damage option and die management UI

### Improved
- Updated system compatibility metadata to indicate Foundry VTT v14 verification
- Updated README compatibility badge to Foundry v14

## 2.2.8 - 2026-01-25

### Fixed
- Removed duplicate version field in system.json
- Updated repository URLs to correct GitHub paths
- Synchronized package.json version with system.json

### Improved
- Added comprehensive JSDoc documentation to all modules
- Improved error handling with null-safe operators throughout codebase
- Replaced hardcoded Korean strings with i18n localization keys
- Added type constants to CONFIG.RAVE for better maintainability
- Enhanced code structure with private method organization
- Added validation for missing actor data
- Improved NPC data preparation with default values

### Added
- New i18n keys: Check, Ability, Wound, Slots, AutoCalculate, NoActor
- Damage mode constants (normal, enhanced, impaired)
- Item type validation constants
- Better dialog close handlers

## 1.2.0

- Add support for Foundry v10

# tee-time-scraping

## MODIFIED Requirements

### Requirement: Chronogolf V1 response parsing

The system SHALL validate and parse a raw Chronogolf V1 JSON response into
structured tee-time records without performing any network I/O. The hole count
SHALL be sourced from the `nb_holes` request parameter, not from the response
(whose `hole` field is the starting hole). Response parsing SHALL be validated
against captured fixtures so that a change in the platform's response shape
surfaces as a failing test — independent of how the parsing is factored
internally (whether as a standalone function or private to a platform scraper).

#### Scenario: Response fixture parses into structured records

- **WHEN** a captured Chronogolf V1 response fixture is parsed during scraping
- **THEN** the resulting records expose at least each slot's stable id, start time, restrictions, out-of-capacity flag, and raw green fee
- **AND** a response whose shape no longer matches the expected schema fails validation rather than silently dropping fields

# Candidate reconciliation

The cleartext candidates from canonical config and generated copies were deduplicated into `mobile-cleartext-lan-token-transport`; the generated `.tmp` instances were suppressed because official build-apk.ps1 excludes `.tmp`. Outbox/contour candidates from generated copies were likewise suppressed or deferred when current source controls were present.

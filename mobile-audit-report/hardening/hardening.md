# Mobile hardening portfolio

1. Enforce HTTPS or a pinned internal certificate/VPN for every credential and media request; make production fail closed on any HTTP URL.
2. Add owner_user_id and contour_id predicates to every point read/write and rebuild local keys or namespace IDs by contour.
3. Fix SQL bind arity and add native SQLite integration tests for assignment lifecycle, contour switch, and pending outbox.
4. Replace whole-file Base64 hashing/upload with streaming/native digest and enforce file/count/aggregate quotas.
5. Bind refresh sessions to a Keystore key, rotate refresh tokens, and verify server replay/revocation behavior.

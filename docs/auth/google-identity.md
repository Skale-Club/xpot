# Google Cloud passwordless sign-in

SMS is the primary sign-in; Google is the alternative. Both use Identity Platform in `skaleclub`, with a dedicated Xpot web OAuth client. Existing PostgreSQL users, approvals, customer access and Express sessions remain the application authority.

Set `GOOGLE_AUTH_ENABLED=true`, `GOOGLE_AUTH_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN` and `GOOGLE_WEB_CLIENT_ID` as runtime environment variables in Coolify. These public SDK values are returned by the phone configuration endpoint; OAuth client secrets are held in Google Cloud and never sent to the browser. Migration `0079_google_identity_auth.sql` is additive and runs before the server starts.

The backend validates signed Firebase JWTs against the configured issuer/project and permits only phone and Google identities. Email alone never claims an existing Xpot account: the first Google association requires a verified phone. Only approved representatives receive a team session; pending and blocked accounts remain outside. Customer panel sessions remain separate from the team, and Google phone confirmation also requires its existing piece/phone challenge.

The browser uses in-memory Firebase persistence; the Express cookie owns the app session. Legacy Supabase token exchange and password change endpoints return 410. In-flight legacy SMS codes can still finish during their original expiry window; the enabled Google flow sends no new Twilio authentication codes.

Validation: type check and build, 1,814 unit tests plus the customer Google boundary test, signed-JWT rejection cases, and real-PostgreSQL integration checks for phone approval, Google association and customer isolation. No real SMS is sent by the automated tests. A staged rollout must verify real Google/SMS interaction and preserve the existing application approval workflow.

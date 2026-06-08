# [OPEN] Debug Session: signin-stale-user

## Symptom
- User cannot reliably sign in.
- "Inventory Manager" keeps appearing as the logged-in user.
- IMS data is not loading properly after sign-in.

## Hypotheses
- Frontend falls back to seeded local user state before authenticated session data arrives.
- Firebase sign-in succeeds but `/api/auth/me` fails or returns an unexpected payload.
- A stale cached token or saved portal state is restoring the wrong user identity.
- Business data endpoints fail after auth and leave the portal in a partial state.

## Plan
- Add instrumentation first.
- Reproduce once.
- Analyze runtime evidence.
- Apply a minimal fix based on the confirmed cause.

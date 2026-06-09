[OPEN] user-delete-email-in-use

# Debug Session: user-delete-email-in-use

## Symptom
- After deleting a user from Settings > Team, signing up again with the same email still shows `Firebase: Error (auth/email-already-in-use)`.

## Expected
- Deleting a user from the portal should also remove the corresponding Firebase Auth account, so the same email can be used again.

## Hypotheses
- H1: The frontend delete action is not calling the backend route successfully in the live runtime.
- H2: The backend route runs, but Firebase Admin deletion fails before or during account removal.
- H3: The SQL user is deleted, but the Firebase Auth identity remains and blocks re-signup.
- H4: Signup is hitting an existing linked/provider-based Firebase user that the current delete logic does not remove as expected.

## Plan
- Add minimal instrumentation to frontend delete, backend delete, and signup failure path.
- Reproduce delete + signup once.
- Read debug logs and identify whether the failure is frontend, backend, Firebase Admin, or signup-side.

# Android push notifications

Android receives replies through Firebase Cloud Messaging (FCM). It does not need
an open WebView, a Supabase socket, a foreground service or a battery exemption.
Supabase remains the source of truth for chats. Firebase is used only for messaging.

## Delivery

1. Each signed-in operator registers this installation's FCM token through
   `register_push_device`. The RPC validates the operator, and device RLS limits
   reads/deletes to the owning account. Tokens reconcile on launch, resume, auth
   changes and once a minute while open. Native token changes are retained for
   reconciliation on the next app launch if the WebView is closed.
2. An `agent` or `system` reply inserted into `messages` creates a durable
   `push_deliveries` row for each registered phone belonging to that node's operator.
   User messages and activity updates do not produce notifications.
3. A database trigger wakes `send-push` using an endpoint and shared secret stored
   in Supabase Vault. A cron job retries every minute if a wake or delivery fails.
   Missing configuration does not prevent saving replies.
4. The Edge Function authenticates the internal request, obtains an OAuth token
   from a server-only Firebase service account, and sends an FCM HTTP v1 message.
   Leases prevent concurrent workers claiming the same pending delivery. Transient
   failures back off, with eight attempts and a one-hour delivery window. Expired
   FCM registrations are deleted. Queue records are retained for seven days.
5. A notification payload lets Android display background alerts without JavaScript.
   `NeptuneMessagingService` displays foreground alerts, suppressing the visible
   account/chat and deduplicating message ids. Android no longer creates alerts
   from React's Realtime callbacks. Stable notification tags also replace repeated
   background deliveries instead of creating extra notification cards. Delivery
   is at least once; a lost acknowledgement can still repeat an alert.
6. Tap data contains only the account email, chat id and message id. The app checks
   the account is signed in, reads the chat under RLS, then navigates to it. A tap
   can switch accounts and open older chats not loaded in the first list page.
7. Sign-out unregisters the installation for that account before discarding its
   session. Pending deliveries cascade away. Registration and unregistration are
   serialized to prevent an in-flight token refresh from undoing sign-out. If the
   network is unavailable, sign-out asks the user to reconnect so alerts can be
   revoked safely. Uninstalling is handled by FCM's expired-token responses.

Android must have Google Play services and notification permission. Explicit
**Force stop** in Settings prevents delivery until the app is opened again. Normal
backgrounding, screen locking and dismissal from Recents do not require Neptune
to stay open. Device-specific battery restrictions can still affect delivery.

## Provisioning

1. Create a Firebase project, without enabling Analytics. Register Android package
   `com.gulbidi.neptune`. Download its `google-services.json` into `android/`.
   This contains public client identifiers, not the service account private key.
   Once verified, explicitly commit this file (`git add -f android/google-services.json`)
   so the release workflow builds with the same project. Do not commit the example
   configuration under that name. The preparation script rejects the test project
   for signed releases.
2. Enable the Firebase Cloud Messaging HTTP v1 API. Create a dedicated service
   account with Firebase Cloud Messaging API Admin permissions, and download its
   JSON key into a private location outside the repository.
3. Set Supabase Edge Function secrets `FCM_SERVICE_ACCOUNT` (the entire JSON key)
   and `NEPTUNE_PUSH_SECRET` (a random shared secret). Neither belongs in app code
   or GitHub. Use a temporary secrets file outside the repo with `supabase secrets
   set --env-file ...`, then remove that temporary file.
4. Apply `20260930010000_push.sql`, then deploy `send-push --no-verify-jwt`. This
   endpoint uses the internal shared secret, not an operator session or public key.
5. Create Vault secrets `neptune_push_url`, with the project's
   `/functions/v1/send-push` URL, and `neptune_push_secret`, with the same value as
   `NEPTUNE_PUSH_SECRET`. Vault configuration is server-only. Do not paste real
   secret values into a committed migration.
6. Verify token registration, reply delivery, database permissions and Android
   behavior using throwaway accounts/nodes. Delete the test records afterwards.

## Build and tests

`scripts/prepare-android.mjs` copies Kotlin sources and the notification icon into
the generated Android project, registers the FCM service/channel, and adds the
Google Services plugin and Firebase Messaging SDK. Generated files remain ignored.
It runs in the release workflow after `tauri android init`.

`Android check` compiles Android Rust and Kotlin with an explicitly fake Firebase
configuration and unsigned debug build. It never publishes an APK. Local debug
builds can likewise use `node scripts/prepare-android.mjs --unsigned`.

- Unit tests cover tap validation, FCM payload expiry, invalid tokens and retry delays.
- Embedded Postgres tests apply the real push migration with network/cron stubs,
  then verify registration authorization, token privacy, reply fan-out, leasing,
  token refresh and sign-out cleanup. They never connect to production.
- Playwright mocks the native boundary and Supabase to test multi-account token
  registration, tapping into the correct chat, and sign-out revocation.
- `npx deno check supabase/functions/send-push/index.ts` checks Edge Function types.
- Actual phone verification requires the provisioned Firebase project and updated
  APK: foreground, open chat suppression, background, locked screen, Recents dismissal,
  notification tap, multiple accounts and sign-out.

## Production configuration

Firebase project `gulbidi-neptune` serves Android package `com.gulbidi.neptune`.
The committed client configuration identifies that project. The dedicated
`neptune-push` service account has only the Firebase Cloud Messaging API Admin
role; its private key is held outside the repository and in Supabase secrets.
The push migration, sender and Vault configuration are deployed to the existing
Supabase project `pqjmspieosgrqyrgfrqx`.

Live integration checks exercised throwaway pairing and OTP sign-in, task/reply
and stop database transitions, operator registration, token RLS, reply fan-out,
sender authentication and Firebase OAuth, and unregister cascade cleanup. They
emulated bridge protocol calls rather than launching an agent CLI. The throwaway
nodes and users were deleted. These checks do not establish physical Android
background delivery; verify that after installing the updated signed APK.

The sender selects the chat's agent with the explicit `chats_agent_id_fkey`
relationship. `agents.current_chat_id` also references chats, so an unqualified
nested agent join is ambiguous in PostgREST and prevents sending queued replies.
Live delivery checks must verify the outbox outcome, not only the sender's HTTP
status: a successful batch response can include deliveries scheduled for retry.

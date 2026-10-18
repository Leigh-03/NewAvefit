# AveFit Server

## Admin access allowlist

Set `ADMIN_EMAIL` in `server/.env` to the one email address permitted to sign in to the admin portal:

```env
ADMIN_EMAIL=admin@example.com
```

For deployment, add `ADMIN_EMAIL` to the server/API environment variables instead of committing it to source control. The existing row in the `admins` table must use this email address (case-insensitive). Admin login and all authenticated admin requests are rejected for any other address, and the admin profile email cannot be changed from the settings page. Restart or redeploy the server after changing the setting.

## Admin password reset email

Admin password reset links are sent only to the `ADMIN_EMAIL` account. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and (optionally) `SMTP_FROM` in the server environment; password reset is unavailable when SMTP is not configured. The link expires after 30 minutes and can only be used once.
Set `CLIENT_URL` to the public frontend origin in deployment so the emailed link opens the correct AveFit instance.

Member feedback is emailed to `ADMIN_EMAIL`; feedback submission requires a valid `ADMIN_EMAIL` and working SMTP configuration.

Weekly BMI reminder emails use the same SMTP settings. Active, verified members with a height on file receive an email when they have not logged progress in the previous seven days. Set `CLIENT_URL` to the public frontend origin so the email's progress link opens the deployed app. In-app reminders continue to work when SMTP is unavailable.

## Browser push notifications

Browser push requires a VAPID key pair in the server environment. Generate a pair from the `server` directory:

```powershell
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Set the returned values as `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_PRIVATE_KEY`, and set `WEB_PUSH_CONTACT` to a monitored `mailto:` address. Add these only to `server/.env` for local development or to the server's deployment secrets/environment; do not commit the private key or put it in a `VITE_` variable. Restart/redeploy the API after setting them. In-app notifications continue to work when browser push is not configured.

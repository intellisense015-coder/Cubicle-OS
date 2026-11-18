# Meta Lead Ads integration

This test-only integration receives Page `leadgen` webhooks, retrieves the
lead server-to-server, and stores it in the existing `public.leads` table. It
does not publish the Meta app,
enable paid ads, connect the Solexa portfolio, or expose any Meta secret to
the browser.

## Required server environment variables

Set these in `.env.local` and in Vercel's server environment. Do not use
`NEXT_PUBLIC_` for any of them and do not paste secret values into chat.

```env
META_APP_SECRET=replace-with-meta-app-secret
META_WEBHOOK_VERIFY_TOKEN=replace-with-a-long-random-token
META_PAGE_ACCESS_TOKEN=replace-with-a-page-access-token
META_PAGE_ID=1375937932279979
META_GRAPH_API_VERSION=v27.0
```

The existing server-only values `NEXT_PUBLIC_SUPABASE_URL`,
and `SUPABASE_SERVICE_ROLE_KEY` must also be available in the deployment. The
page access token must have the permissions needed to retrieve leads for the
test Page. Rotate it if it is ever exposed.

## Deployment and Meta configuration

1. Apply the migration with the project's normal Supabase migration process.
2. Deploy the app to Vercel.
3. In Meta Webhooks, choose the **Page** product and use:
   `https://cubicle-os.vercel.app/api/webhooks/meta`
4. Enter the same `META_WEBHOOK_VERIFY_TOKEN` value in Meta's Verify Token
   field. Meta's GET verification must return its challenge.
5. Subscribe the Page to the `leadgen` field. The Page must have the app
   installed/subscribed; this is separate from configuring the callback URL.
6. Use Meta's free Lead Ads Testing Tool to submit a test lead.

The POST route verifies `X-Hub-Signature-256` against the raw request body,
rejects other Page IDs, limits the body size, uses a bounded Graph API request,
and never logs the webhook body or access token. `leadgen_id` is unique in the
existing leads table, while `os_meta_lead_events` is a private server-only
delivery ledger that prevents duplicate processing.

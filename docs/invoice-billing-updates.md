# Invoice and quotation billing updates

## Calculation rules

The shared calculator in `lib/invoice-calculations.ts` is used by the invoice form, quotation form, Supabase invoice service, and document renderer:

```text
subtotal   = sum(line quantity × unit price)
sales tax  = round(subtotal × sales tax rate / (100 - sales tax rate))
WHT        = round(subtotal × WHT rate / 100)
net total  = max(0, subtotal + sales tax - WHT)
```

Amounts are converted to minor units before percentage calculations and rounded to two decimal places once at each financial boundary. Sales Tax is inclusive: entering PKR 85,000 of charges at 15% produces PKR 15,000 Sales Tax and a PKR 100,000 total. WHT is calculated on the subtotal only; sales tax is not included in the WHT base.

Tax rows are displayed only when the corresponding inclusion flag is true and the calculated amount is greater than zero. A disabled flag therefore represents `Not Included`, even if an old record contains a stale amount.

## Database migration

Apply `supabase/migrations/202610270001_invoice_tax_and_delivery.sql` before deploying the application. It adds:

- `invoices.sales_tax_enabled`, `invoices.sales_tax_rate`, and `invoices.sales_tax_amount`.
- `activity_log` rows for invoice email delivery, including actor, recipient, timestamps, provider metadata, and `pending`/`sent`/`failed` status.

The existing `invoices.tax_*` columns remain in place as the backward-compatible WHT columns. No invoice query or template reads or writes the removed invoice Joining Date field.

## Email delivery configuration

The Send Invoice action calls `POST /api/invoices/[id]/send`. The route authenticates the caller with the bearer token, reads the invoice and member email server-side, writes a pending activity row, sends a clean HTML invoice summary through Resend, and finalizes both the activity row and `invoices.email_status`. Configure these server-only variables in the deployment environment:

```text
RESEND_API_KEY=...
EMAIL_FROM="The Cubicle <billing@example.com>"
NEXT_PUBLIC_APP_URL=https://app.example.com
```

The server route never trusts a recipient email supplied by the browser and never exposes the service-role key to the client. Delivery or audit-finalization failures are returned to the UI and recorded as failed whenever an audit row was created.

## Automatic five-day reminders

The scheduled reminder flow uses the existing `invoice_email_queue` table:

- `GET /api/invoices/reminders` queues unpaid invoices whose due date is five days away in Asia/Karachi.
- `GET /api/invoices/email-queue/process` claims queued jobs, generates a server-side PDF, sends the invoice template through Resend, and records the provider message ID.
- Queue entries are unique per invoice and delivery kind, retry up to five times with backoff, and become failed after the final attempt.
- Jobs left in `processing` for more than 15 minutes are eligible for recovery on the next processor run.
- The queue status constraint must allow `queued`, `processing`, `sent`, `failed`, and `cancelled`; apply the queue status migration before running the worker.

Both routes require the server-only `CRON_SECRET` value in the Authorization bearer token or `x-cron-secret` header. Connect the two routes to the deployment host's scheduler after selecting the production host. A daily reminder run and a more frequent queue processor are recommended.

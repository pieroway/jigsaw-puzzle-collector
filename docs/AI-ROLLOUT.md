# AI rollout plan

## 1. Puzzle recognition pilot

Add an opt-in **Identify puzzle** action to import review in `frontend/src/import/ImportWorkspace.tsx`. The first release uses the corrected front when available, or the selected original. Extra box photos and catalogue matching are follow-up work. Before sending, disclose the provider and its data use. Send only selected images, resized where practical and stripped of metadata.

Use an app-managed Gemini API key on the server and start with Gemini 3.1 Flash-Lite. Keep the model configurable. Enable the pilot only when configured, with per-user and app-wide daily limits, request timeouts, and a single in-flight request per item. Reserve quota before dispatch, and keep keys and photo contents out of logs. Handle provider limits and timeouts in the review UI so the existing workflow can continue. [Gemini API pricing and free-tier data use](https://ai.google.dev/gemini-api/docs/pricing)

Add an owner-authorized action alongside the existing import-item review actions in `backend/src/ImportService.php`. Ask for structured fields covering brand, title, piece count, and visible barcode or product code. Validate the response, preserve leading zeros in identifiers, and show suggestions for the user to apply field by field. Use the existing edit and approval flow to save them. Require a matching barcode or a manufacturer and product-code match in the catalogue before presenting an exact edition match. Discard results if the selected photo revision changes during the request.

Test owner isolation, malformed results, quota enforcement, stale responses, and preservation of manual edits using a fake provider. Compare the pilot with existing OCR on a labeled sample of imports covering extra box photos, glare, rotation, and similar editions. Record field accuracy, unsupported guesses, latency, and usage. Expand access once the suggestions reduce manual corrections on that sample.

### Enable the recognition pilot

Create a Gemini API key in a project on the free tier. Set `GEMINI_API_KEY` in the local, ignored `.env` file and recreate the Compose API service with `docker compose up -d api`. Run `docker compose exec api php scripts/migrate.php` if applying migrations separately. The default limits are 20 requests per UTC day across the app and 5 per account. Adjust both below the project quota. Leave the key blank to hide the action. Use a free-tier project to avoid provider charges.

## 2. Studio image pilot

Keep the current Studio renderer available without an AI account. Test Cloudflare Workers AI FLUX.2 Klein 4B on reference-image edits within the free allowance. Use the existing renderer as the baseline and test generation of lighting and backgrounds with the original box composited back in wherever possible. [Cloudflare model catalogue](https://developers.cloudflare.com/workers-ai/models/) · [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

If the pilot produces usable results, add a separate **AI Studio preview** the user can explicitly save. Preserve the original and existing Studio assets, and route the optional output through the same owner-authorized delivery and cleanup lifecycle. Compare output on the same photos for cover artwork, typography, logos, box shape, and visual quality before enabling the feature.

## 3. User-provided credentials

After measuring the pilots, add **Profile → AI** with independent provider choices for recognition and Studio. Users can stay on the app-managed allowance where offered or supply their own provider credentials. Keep keys encrypted server-side, mask them in the interface, and support connection testing, replacement, and deletion. Show the selected provider and billing responsibility before each action. A quota or connection failure leaves the user in control of whether to try another provider.

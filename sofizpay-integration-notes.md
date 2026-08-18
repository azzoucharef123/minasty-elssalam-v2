# SofizPay integration notes

Date: 2026-08-18

The official SofizPay payment-link documentation at https://docs.sofizpay.com/en/api/v1/tools/payment-link/ shows payment links in the form `https://sofizpay.com/create-payment-link/?account=...&amount=...&memo=...&return_url=...`. The documented example includes an account identifier, amount, memo, and URL-encoded return URL.

The official SofizPay homepage at https://sofizpay.com/en/ describes card and QR payment support, real-time processing, analytics, and REST APIs. It also mentions dashboard notifications without webhook dependencies, but this must not be treated as a verified transaction callback contract without the merchant-specific documentation.

The search result identified a CIB/Edahabia endpoint page at https://docs.sofizpay.com/api/v1/endpoints/makeCibTransaction, but the official page currently returns 404 in the authenticated browser and the stateless extractor could not retrieve its content. Do not assume the endpoint fields, callback signature, or verification method until the merchant account or current documentation provides them.

No SofizPay connector exists in the current Manus configuration. No payment link, account identifier, secret, API key, or merchant callback credential has been added to the project or configuration.

Safety boundary: implementation can prepare the three payment flows and verify callbacks, but no real payment, transfer, or account-setting change should be executed without explicit confirmation of the exact action and amount. Payment success must be verified server-side before changing student entitlements.

Browser inspection of the open SofizPay merchant account: the merchant portal is authenticated and shows wallet balance 500.00 DZD, with a visible `مولد رابط الدفع` page. The generator has fields for Sofizpay account, amount, optional memo (max 28 characters), and optional return URL, followed by `إنشاء رابط الدفع`. The account field is prefilled in the UI with `GBYAJX2VUMCKQQMTQRKIHFL7GWKPXQGAQNNCJOIV232S3Q73NNYK6JF4` while the documentation example shows a different placeholder account. No link was created and no payment or account setting was changed.


Updated official documentation findings:

- `https://docs.sofizpay.com/en/api/v1/endpoints/makeCibTransaction/` documents `GET https://sofizpay.com/make-cib-transaction/` with required `account`, `amount`, `full_name`, `phone`, `email`, required `redirect`, optional `return_url`, `webhook_url`, `invoice_id`, `language`, `memo`, and `keep_return_url`. It returns a payment URL and a `cib_transaction_id`.
- The same official page says a `webhook_url` receives asynchronous payment status changes, and security guidance says to save the `cib_transaction_id` with the internal order ID and verify status server-side using SofizPay's transaction-check endpoint.
- The official page provides a sandbox endpoint and test cards, and says to enable Testing Mode in the SofizPay app to view sandbox transactions.
- `https://docs.sofizpay.com/en/merchant/v1/invoices/` documents invoice creation but requires an `encrypted_sk` secret key. Do not expose that key in browser code.
- A public SDK repository (not treated as authoritative) names a `checkCIBStatus(cib_transaction_id)` method and reiterates that the transaction ID must be stored server-side. Its endpoint details still require confirmation from SofizPay's official API documentation or merchant credentials.
- The authenticated merchant portal has a payment-link generator with account, amount, memo, and return URL fields. No link or payment was created.


The official transaction-check page is https://docs.sofizpay.com/en/api/v1/endpoints/cibTransactionCheck. It documents `GET https://sofizpay.com/cib-transaction-check/?order_number=...`, with success indicated by `orderStatus: 2`, `respCode: "00"`, and an accepted-payment description. It returns the order number, amount, and destination account. The official security guidance requires validating the transaction amount against the internal order, validating the receiving account, implementing idempotency for repeated callbacks, and logging verification attempts. This is sufficient to implement server-side verification without exposing secrets to the browser, using a webhook or signed return to trigger verification and the official status-check endpoint as the authority.

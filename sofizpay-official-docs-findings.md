# SofizPay official documentation findings

Source 1: https://docs.sofizpay.com/en/api/v1/endpoints/makeCibTransaction/

- CIB transaction endpoint: GET https://sofizpay.com/make-cib-transaction/
- Request supports `return_url`, `webhook_url`, `invoice_id`, `redirect`, and `keep_return_url`.
- `webhook_url` receives asynchronous server-to-server payment status webhooks.
- With `keep_return_url=True`, the callback is signed and the redirect includes an encrypted signature.
- Success response includes `transaction_id`, `cib_transaction_id` (the order number), `payment_url`, `status`, `more_info_url`, `webhook_url`, and `cib_response.orderId`.
- Official security guidance: include an internal order id in the return URL; save `cib_transaction_id` with the internal order id; then verify status through the CIB transaction check endpoint.

Source 2: https://docs.sofizpay.com/en/api/v1/endpoints/cibtransactioncheck/

- Check endpoint: GET https://sofizpay.com/cib-transaction-check/
- Required query parameter: `order_number`.
- Successful response example: `orderStatus: 2`, `errorCode: 0`, `respCode: "00"`, `destination_account`, and `Amount`.
- Not found response is an error such as `CIB transaction not found`.
- Official security guidance: validate amount and receiving account, implement idempotency for repeated callbacks, and log verification attempts.

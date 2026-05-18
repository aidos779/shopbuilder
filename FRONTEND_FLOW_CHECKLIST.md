# ShopBuilder Frontend Full-Flow Verification

Run this checklist after `docker compose up --build` succeeds.

## URLs

- Frontend: http://localhost:5173
- Backend health: http://localhost:3000/health
- Swagger: http://localhost:3000/docs

## Required Manual Flow

1. Open the frontend.
2. Set API base to `http://localhost:3000`.
3. Register a `MERCHANT_OWNER`.
4. Confirm the verification email arrives in the configured SMTP inbox.
5. Copy the verification token from the email link and verify the account in the UI.
6. Login as the merchant.
7. Create a merchant store through Swagger/Postman if no store exists yet.
8. Create a product in the frontend.
9. Generate variants using Size x Color x Material.
10. Open the Business tab and create a warehouse.
11. Set stock for a variant in that warehouse.
12. Create a discount code.
13. Register/login a customer.
14. Add the stocked variant to cart.
15. Checkout using the discount code.
16. Confirm customer order confirmation and merchant order notification emails are queued/sent.
17. Create a payment intent for the order.
18. If the response has `requires3ds: true`, submit the `threeDSecureToken` to `/payments/{id}/3ds`.
19. Capture the payment through `/payments/{id}/capture`.
20. Create a webhook endpoint and verify `/webhooks/deliveries` records delivery attempts.
21. Create a storefront token with `products:read`.
22. Call `/storefront/products` with `x-storefront-token`.
23. Create a subscription and verify the subscription worker sends renewal emails when due.
24. Open Analytics and verify revenue/order/cart metrics load from `/analytics`.
25. Open queue visibility and verify `/admin/queues` returns BullMQ counts.

## Pass Criteria

- No mock data is visible in the UI.
- Every UI action either succeeds with backend data or shows a backend error.
- SMTP inbox receives verification/reset/order/subscription/abandoned-cart emails.
- Swagger documents the endpoints used in this flow.
- `npm test`, `npx prisma validate`, and Docker health checks pass.

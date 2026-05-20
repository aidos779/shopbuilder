const emailQueue = require('../queues/email.queue');

const enqueue = async (name, data) => {
  if (!emailQueue) return;
  await emailQueue.add(name, data);
};

const verificationEmailHtml = (url) => `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <h2 style="color:#111;margin-top:0">Verify your email address</h2>
    <p style="color:#444;line-height:1.6">Thanks for signing up for ShopBuilder. Click the button below to verify your email address and activate your account.</p>
    <a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;margin:20px 0">Verify Email</a>
    <p style="color:#888;font-size:13px;margin-top:32px">This link expires in <strong>24 hours</strong>. If you didn't create a ShopBuilder account, you can safely ignore this email.</p>
  </div>
</body>
</html>`;

const passwordResetHtml = (url) => `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <h2 style="color:#111;margin-top:0">Reset your password</h2>
    <p style="color:#444;line-height:1.6">We received a request to reset your ShopBuilder password. Click the button below to choose a new password.</p>
    <a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;margin:20px 0">Reset Password</a>
    <p style="color:#888;font-size:13px;margin-top:32px">This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email.</p>
  </div>
</body>
</html>`;

const orderConfirmationHtml = (order) => `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <h2 style="color:#111;margin-top:0">Order Confirmed</h2>
    <p style="color:#444;line-height:1.6">Thank you for your order! Here's a summary:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr style="background:#f3f4f6">
        <td style="padding:10px 14px;font-weight:600;color:#111">Order Number</td>
        <td style="padding:10px 14px;color:#444">${order.orderNumber}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-weight:600;color:#111">Store</td>
        <td style="padding:10px 14px;color:#444">${order.store?.name || 'N/A'}</td>
      </tr>
      <tr style="background:#f3f4f6">
        <td style="padding:10px 14px;font-weight:600;color:#111">Total</td>
        <td style="padding:10px 14px;color:#444">$${order.totalAmount.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-weight:600;color:#111">Status</td>
        <td style="padding:10px 14px;color:#4f46e5;font-weight:600">${order.status}</td>
      </tr>
    </table>
    <p style="color:#888;font-size:13px;margin-top:32px">You will receive further updates as your order is processed.</p>
  </div>
</body>
</html>`;

const sendVerificationEmail = async (email, token) => {
  const url = `http://localhost:3000/api/auth/verify-email?token=${token}`;
  await enqueue('verify-email', {
    to: email,
    subject: 'Verify your ShopBuilder account',
    html: verificationEmailHtml(url),
  });
};

const sendPasswordResetEmail = async (email, token) => {
  const url = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  await enqueue('password-reset', {
    to: email,
    subject: 'Reset your ShopBuilder password',
    html: passwordResetHtml(url),
  });
};

const sendOrderConfirmationEmail = async (email, order) => {
  await enqueue('order-confirmation', {
    to: email,
    subject: `Order Confirmed — ${order.orderNumber}`,
    html: orderConfirmationHtml(order),
  });
};

const sendMerchantOrderNotificationEmail = async (email, order) => {
  await enqueue('merchant-order-notification', {
    to: email,
    subject: `New order ${order.orderNumber}`,
    html: orderConfirmationHtml(order),
  });
};

const sendAbandonedCartReminderEmail = async (email, cart) => {
  await enqueue('abandoned-cart-reminder', {
    to: email,
    subject: 'Complete your ShopBuilder checkout',
    html: `
      <h2>Your cart is waiting</h2>
      <p>You still have ${cart.items?.length || 0} item(s) in your cart at ${cart.store?.name || 'the store'}.</p>
      <p>Return to the storefront to complete your checkout.</p>
    `,
  });
};

const sendSubscriptionRenewalEmail = async (email, subscription) => {
  await enqueue('subscription-renewal-billing', {
    to: email,
    subject: `Subscription renewed - ${subscription.planName}`,
    html: `
      <h2>Subscription billing notice</h2>
      <p>Your ${subscription.planName} subscription has a renewal amount of ${subscription.currency} ${subscription.amount.toFixed(2)}.</p>
      <p>Next billing date: ${new Date(subscription.nextBillingAt).toISOString()}</p>
    `,
  });
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendMerchantOrderNotificationEmail,
  sendAbandonedCartReminderEmail,
  sendSubscriptionRenewalEmail,
};

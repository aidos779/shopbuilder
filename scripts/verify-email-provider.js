require('dotenv').config();
const { createTransporter } = require('../src/config/email');

const required = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`Missing email environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const to = process.env.EMAIL_TEST_TO || process.env.EMAIL_FROM;

(async () => {
  const transporter = createTransporter();
  await transporter.verify();
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'ShopBuilder SMTP verification',
    text: 'ShopBuilder SMTP provider is configured and able to send email.',
  });
  console.log(JSON.stringify({ ok: true, messageId: info.messageId, to }, null, 2));
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});

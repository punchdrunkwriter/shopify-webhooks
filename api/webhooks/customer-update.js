import { kv } from '@vercel/kv';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

// Middleware to capture raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

// Read raw body
async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Verify Shopify webhook signature
function verifyWebhook(body, hmac, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
  return hash === hmac;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get raw body and HMAC
    const rawBody = await getRawBody(req);
    const hmac = req.headers['x-shopify-hmac-sha256'];

    // Verify webhook signature
    if (!verifyWebhook(rawBody, hmac, process.env.SHOPIFY_WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const customer = JSON.parse(rawBody);
    const customerId = customer.id;

    // Get previous state from Vercel KV
    const prevCustomer = await kv.get(`bb:customer:${customerId}`);

    // Store current state (30 day TTL)
    await kv.set(`bb:customer:${customerId}`, customer, { ex: 86400 * 30 });

    // Compare addresses
    const oldAddresses = prevCustomer?.addresses || [];
    const newAddresses = customer.addresses || [];
    const addressChanged = JSON.stringify(oldAddresses) !== JSON.stringify(newAddresses);

    // Send email if address changed and we have previous state
    if (addressChanged && prevCustomer) {
      const transporter = nodemailer.createTransport({
        host: 'smtp.fastmail.com',
        port: 465,
        secure: true,
        auth: {
          user: process.env.FASTMAIL_EMAIL,
          pass: process.env.FASTMAIL_PASSWORD,
        },
      });

      const oldAddr = oldAddresses[0];
      const newAddr = newAddresses[0];

      const addressDiff = `
Old Address:
${oldAddr?.address1}, ${oldAddr?.city}, ${oldAddr?.province} ${oldAddr?.zip}

New Address:
${newAddr?.address1}, ${newAddr?.city}, ${newAddr?.province} ${newAddr?.zip}
      `.trim();

      await transporter.sendMail({
        from: process.env.FASTMAIL_EMAIL,
        to: process.env.NOTIFICATION_EMAIL,
        subject: `🔔 Address Changed — ${customer.first_name} ${customer.last_name}`,
        html: `
<h2>Customer Address Changed</h2>
<p><strong>${customer.first_name} ${customer.last_name}</strong></p>
<p>Email: <code>${customer.email}</code></p>

<h3>Old → New</h3>
<pre>${addressDiff}</pre>

<p><a href="https://admin.shopify.com/admin/customers/${customerId}">View in Shopify Admin</a></p>
        `,
      });

      console.log(`Address change email sent for customer ${customerId}`);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}

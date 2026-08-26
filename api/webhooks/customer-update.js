import nodemailer from 'nodemailer';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

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
    const rawBody = await getRawBody(req);
    const hmac = req.headers['x-shopify-hmac-sha256'];

    if (!verifyWebhook(rawBody, hmac, process.env.SHOPIFY_WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const customer = JSON.parse(rawBody);
    const addr = customer.addresses?.[0];

    if (!addr) {
      return res.status(200).json({ success: true });
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.fastmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.FASTMAIL_EMAIL,
        pass: process.env.FASTMAIL_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.FASTMAIL_EMAIL,
      to: process.env.NOTIFICATION_EMAIL,
      subject: `🔔 Customer Updated — ${customer.first_name} ${customer.last_name}`,
      html: `
<h2>Customer Record Updated</h2>
<p><strong>${customer.first_name} ${customer.last_name}</strong></p>
<p>Email: <code>${customer.email}</code></p>

<h3>Current Address</h3>
<p>
  ${addr.address1}${addr.address2 ? '<br>' + addr.address2 : ''}<br>
  ${addr.city}, ${addr.province} ${addr.zip}<br>
  ${addr.country}
</p>

<p><a href="https://admin.shopify.com/admin/customers/${customer.id}">View in Shopify Admin</a></p>
      `,
    });

    console.log(`Customer update email sent for ${customer.email}`);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}

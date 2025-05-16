const express = require('express');
const stripe = require('stripe')('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');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Database setup
const db = new sqlite3.Database('./users.db');
db.serialize(() => {
  db.run(\`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE,
    pin TEXT,
    points INTEGER DEFAULT 0
  )\`);
});

// Serve static UI
app.use('/', express.static(path.join(__dirname, 'public')));

// Auth & Points endpoints
app.post('/register', (req, res) => {
  const { username, pin } = req.body;
  db.run('INSERT INTO users(username, pin) VALUES(?,?)', [username, pin], function (err) {
    if (err) return res.json({ success: false, message: 'Username taken' });
    res.json({ success: true, message: 'Registered!' });
  });
});
app.post('/login', (req, res) => {
  const { username, pin } = req.body;
  db.get('SELECT pin FROM users WHERE username = ?', [username], (err, row) => {
    if (!row || row.pin !== pin) return res.json({ success: false, message: 'Invalid credentials' });
    res.json({ success: true, message: 'Logged in' });
  });
});
app.get('/user', (req, res) => {
  const { username } = req.query;
  db.get('SELECT points FROM users WHERE username = ?', [username], (err, row) => {
    res.json({ points: row ? row.points : 0 });
  });
});
app.post('/redeem', (req, res) => {
  const { username } = req.body;
  db.get('SELECT points FROM users WHERE username = ?', [username], (_, row) => {
    if (!row || row.points < 10) return res.json({ success: false, message: 'Not enough points' });
    db.run('UPDATE users SET points = points - 10 WHERE username = ?', [username], () =>
      res.json({ success: true, message: 'Redeemed for free item!' })
    );
  });
});

// Stripe Checkout
const YOUR_DOMAIN = 'http://10.0.0.145:8000'; // Update if needed

const CATALOG = {
  1: { name: 'Protein Bar', price_cents: 499 },
  2: { name: 'Creatine Pack', price_cents: 650 },
  3: { name: 'Protein Powder', price_cents: 525 }
};

app.post('/create-checkout-session', async (req, res) => {
  const { username, productId } = req.body;
  const product = CATALOG[productId];
  if (!product) return res.status(400).json({ error: 'Invalid product' });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{ price_data: {
      currency: 'usd',
      product_data: { name: product.name },
      unit_amount: product.price_cents
    }, quantity: 1 }],
    mode: 'payment',
    payment_intent_data: { metadata: { username, productId } },
    success_url: `${YOUR_DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${YOUR_DOMAIN}/cancel`
  });

  res.json({ url: session.url });
});

app.get('/success', async (req, res) => {
  const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
  const { username } = session.payment_intent.metadata;
  db.run('UPDATE users SET points = points + 1 WHERE username = ?', [username]);
  res.send(`<!DOCTYPE html><html><body>
    <h1>Thank you, ${username}!</h1>
    <p>Purchase complete – +1 point awarded.</p>
    <a href="/">Back to Vendly</a>
  </body></html>`);
});
app.get('/cancel', (req, res) => {
  res.send(`<!DOCTYPE html><html><body>
    <h1>Payment canceled</h1>
    <a href="/">Back to Vendly</a>
  </body></html>`);
});

app.listen(8000, () => console.log('Server running on http://10.0.0.145:8000'));
# Backend — Nova

This backend exposes Paystack endpoints and a webhook receiver.

Quick setup for local Paystack webhook testing with ngrok:

1. Create a `.env` in `backend/` with:

```
PORT=4000
DATABASE_FILE=./data/nova.sqlite
PAYSTACK_SECRET=your_paystack_secret_here
```

2. Start the backend:

```bash
cd backend
npm install
npm run dev
```

3. Expose the backend to the internet using ngrok:

```bash
ngrok http 4000
```

4. In the Paystack dashboard, set your webhook URL to:

```
https://<NGROK_HOST>/api/paystack/webhook
```

5. Ensure `Content-Type: application/json` is used when posting to the webhook. The server verifies Paystack signatures using `PAYSTACK_SECRET` and will reject invalid signatures.

Testing with curl (local):

```bash
curl -X POST http://localhost:4000/api/paystack/webhook -H "Content-Type: application/json" -d '{"event":"test","data":{"amount":100}}'
```

Note: For real Paystack events, use the ngrok URL so Paystack can reach your local server.

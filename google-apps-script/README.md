# Collecting RSVPs in a Google Sheet

The RSVP form on the site posts each reply to a small Google Apps Script web app,
which adds it as a row in a Google Sheet. Setup takes about five minutes.

## 1. Create the sheet and add the script

1. Create a new Google Sheet (for example "E & K RSVPs").
2. In the sheet, open **Extensions → Apps Script**.
3. Delete the starter code, paste in everything from [`rsvp.gs`](rsvp.gs), and save.

The script creates an **RSVPs** tab with the headings *Received*, *Full name* and
*Phone number* the first time a reply comes in.

## 2. Deploy it as a web app

1. Click **Deploy → New deployment**.
2. Under **Select type** (the gear icon), choose **Web app**.
3. Set **Execute as** to **Me**, and **Who has access** to **Anyone**.
   (Guests aren't signed in to Google, so it has to accept anonymous posts.
   The script can only add rows to this one sheet.)
4. Click **Deploy**, then approve the permissions Google asks for. If you see
   "Google hasn't verified this app", choose **Advanced → Go to … (unsafe)**:
   it's your own script.
5. Copy the **Web app URL**. It ends in `/exec`.

## 3. Connect the site

Open [`js/site.js`](../js/site.js) and paste the URL into `RSVP_ENDPOINT` near the top:

```js
var RSVP_ENDPOINT = 'https://script.google.com/macros/s/AKfy…/exec';
```

To test it, open the `/exec` URL in a browser. You should see
`{"ok":true,"message":"RSVP endpoint is running."}`. Then send a test RSVP
from the site and check that a row appears in the sheet.

## Online gifts with Paystack (optional)

The Cash gifts section can take payments online through Paystack's checkout
(card, bank transfer, USSD). Paystack sends the money to your Paystack balance
and pays it out to your bank account. Each successful gift is also logged on a
**Gifts** tab in this sheet.

1. Sign up at [paystack.com](https://paystack.com) and finish business
   verification. Until that's done you can only take test payments.
2. In the Paystack dashboard, open **Settings → API Keys & Webhooks**. You'll
   see a **public key** (`pk_…`) and a **secret key** (`sk_…`), each with a
   test and a live version.
3. **Public key → the site.** Paste it into `PAYSTACK_PUBLIC_KEY` near the top
   of [`js/site.js`](../js/site.js). The "Give online" form only appears once
   this is set.
4. **Secret key → the Apps Script, never the site.** In the Apps Script editor,
   open **Project Settings** (the gear icon) → **Script Properties** →
   **Add script property**. Name it `PAYSTACK_SECRET_KEY` and paste the secret
   key as the value.
5. Paste the updated [`rsvp.gs`](rsvp.gs) into the editor and deploy a new
   version (see below). Google will ask you to approve one new permission,
   "Connect to an external service". The script needs it to check each payment
   with Paystack.

**Test first.** Start with both *test* keys. Paystack's test cards (for example
`4084 0840 8408 4081`, any future expiry date, CVV `408`) let you go through a
whole payment without real money. Check that the thank-you message appears and
a row lands on the Gifts tab. Then switch both keys to the *live* ones. The
public key and the secret key must both be test, or both be live.

**How a gift is logged.** After a payment, the site sends the Paystack reference
to the script. The script asks Paystack whether that payment really succeeded,
and only then records the confirmed amount. Anyone posting fake gifts to the
script gets nothing written to the sheet. If logging fails (for example the
guest closes the tab straight away), the payment is still safe in Paystack. The
Paystack dashboard always has the full list.

## Changing the script later

If you edit `rsvp.gs`, go to **Deploy → Manage deployments**, click the pencil
icon, choose **Version: New version**, and click **Deploy**. This keeps the same
URL. **Deploy → New deployment** would give you a new URL, and you'd have to
update `site.js` again.

## Notes

- When a guest clicks **Change response** and submits again, the new reply is
  added as a new row. The earlier row stays, so the most recent row for a
  person is their current answer.
- The form has a hidden "website" field (a honeypot). People never see it, but
  spam bots tend to fill in every field. If it has anything in it, the site
  and the script both quietly drop the reply.
- When a guest's RSVP goes through, their browser remembers it and shows the
  thank-you message when they come back to the site.

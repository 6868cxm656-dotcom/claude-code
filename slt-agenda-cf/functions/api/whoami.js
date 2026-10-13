import { json } from "../_shared.js";

// Tells the page who is signed in. Empty until Cloudflare Access is switched on.
export const onRequestGet = ({ request }) =>
  json({ email: request.headers.get("Cf-Access-Authenticated-User-Email") || "" });

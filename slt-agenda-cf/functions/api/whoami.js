import { json, getEmail } from "../_shared.js";

// Tells the page who is signed in (via Cloudflare Access).
export const onRequestGet = ({ request }) => json({ email: getEmail(request) });

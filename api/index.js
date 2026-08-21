/**
 * Vercel serverless entrypoint.
 *
 * Vercel invokes this handler instead of running `node server.js`, so the app
 * is exported without binding a port. All routing (API + static files) is
 * handled by Express itself — see vercel.json, which sends every path here.
 */
module.exports = require('../server.js');
